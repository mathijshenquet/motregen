import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { applyEmulation, performanceProfile } from './profiles'
import { installReferenceProbe, type ReferenceEvent } from './reference-probe'
import { hostLoadAverage } from '../scripts/rig-host'
import { referenceMilestones, renderReferenceReport, type ReferenceReport } from '../scripts/reference-report'

interface RigOptions { profiles: string[]; repeat: number; cpuRate?: number }
const options = JSON.parse(process.env.MOTREGEN_MOBILE_OPTIONS ?? '{"profiles":["mobile-4g"],"repeat":3,"cpuRate":4}') as RigOptions
const origin = 'https://www.buienradar.nl'
const observeAfterFirstFrameMs = 15_000
const selectors = { radarImage: 'img.leaflet-image-layer', mapContainer: '.leaflet-container', timeLabel: '[class*="time" i]' }

for (const profileId of options.profiles) {
  for (let repetition = 1; repetition <= options.repeat; repetition++) {
    test(`${profileId} / referentie-buienradar / run ${repetition}`, async ({ page, context }) => {
      const calibrated = performanceProfile(profileId)
      const profile = { ...calibrated, cpuThrottleRate: options.cpuRate ?? calibrated.cpuThrottleRate }
      const loadAverage = hostLoadAverage()
      const events: ReferenceEvent[] = []
      const actions: ReferenceReport['actions'] = []
      await page.exposeFunction('__referenceEvent', (event: ReferenceEvent) => { events.push(event) })
      await page.addInitScript(installReferenceProbe, selectors)
      const cdp = await context.newCDPSession(page)
      await applyEmulation(cdp, profile)
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
      if (profile.device) {
        await page.setViewportSize(profile.device.viewport)
        await cdp.send('Emulation.setUserAgentOverride', { userAgent: profile.device.userAgent })
      }

      const capturedAt = new Date().toISOString()
      const navigationStartMs = Date.now()
      await page.goto(origin, { waitUntil: 'commit', timeout: 120_000 })
      const consent = acceptConsent(page, actions)
      mkdirSync('tmp/perf-mobile', { recursive: true })
      const output = `tmp/perf-mobile/${profileId}-referentie-buienradar-run${repetition}`
      try {
        await expect.poll(() => events.some((event) => event.kind === 'radar-frame'), { timeout: 150_000, message: 'eerste radarbeeld zichtbaar' }).toBe(true)
        await consent
        await page.waitForTimeout(observeAfterFirstFrameMs)
      } finally {
        // Ook bij een mislukte run: zonder beeld en gebeurtenissen is niet te zien of de site of de detectie veranderde.
        await page.screenshot({ path: `${output}.png` }).catch(() => undefined)
        writeFileSync(`${output}.events.json`, `${JSON.stringify({ url: page.url(), actions, events }, null, 2)}\n`)
      }

      const report: ReferenceReport = {
        meta: { profile: profileId, origin, capturedAt, cpuThrottleRate: profile.cpuThrottleRate, network: profile.network, observeAfterFirstFrameMs, loadAverage },
        milestones: referenceMilestones(events, actions, navigationStartMs),
        actions: actions.map((action) => ({ ...action, wallMs: action.wallMs - navigationStartMs })),
        events: events.map((event) => ({ ...event, wallMs: event.wallMs - navigationStartMs })),
      }
      writeFileSync(`${output}.json`, `${JSON.stringify(report, null, 2)}\n`)
      writeFileSync(`${output}.md`, renderReferenceReport(report))
      console.log(`${profileId}/referentie-buienradar run ${repetition}: eerste radarbeeld ${report.milestones.firstRadarMs} ms, ttfp-ref ${report.milestones.ttfpRefMs ?? 'geen frame-wissel'} ms (onbedekt ${report.milestones.ttfpRefUncoveredMs ?? '—'} ms), ${report.milestones.frameChanges} frame-wissels → ${output}.md`)
      expect(report.milestones.firstRadarMs, 'radarbeeld gezien').not.toBeNull()
    })
  }
}

/**
 * Een koude bezoeker moet eerst door de toestemmingsmuur. De rig klikt zodra de knop er staat:
 * sneller dan een mens, dus de referentie valt eerder gunstig dan ongunstig uit voor Buienradar.
 */
async function acceptConsent(page: Page, actions: ReferenceReport['actions']): Promise<void> {
  const steps = [
    { name: 'toestemming: persoonlijke advertenties', locator: page.getByText('Met persoonlijke advertenties', { exact: true }) },
    { name: 'toestemming: doorgaan', locator: page.getByRole('button', { name: 'Doorgaan' }) },
  ]
  for (const step of steps) {
    try {
      await step.locator.click({ timeout: 60_000 })
      actions.push({ name: step.name, wallMs: Date.now() })
    } catch {
      actions.push({ name: `${step.name} (niet verschenen)`, wallMs: Date.now() })
      return
    }
  }
}
