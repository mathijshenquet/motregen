import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, type Page, type Request } from '@playwright/test'
import { test, warmingCache, warmVisit, cacheInventory, seedEvidence } from './rig-cache'
import { applyEmulation, performanceProfile } from './profiles'
import { installReferenceProbe, type ReferenceEvent } from './reference-probe'
import { hostLoadAverage, waitForQuietHost } from '../scripts/rig-host'
import { referenceMilestones, renderReferenceReport, type ReferenceReport } from '../scripts/reference-report'

interface RigOptions { profiles: string[]; scenarios?: string[]; repeat: number; cpuRate?: number; loadWaitMinutes?: number }
const options = JSON.parse(process.env.MOTREGEN_MOBILE_OPTIONS ?? '{"profiles":["mobile-4g"],"repeat":3,"cpuRate":4}') as RigOptions
const QUIET_HOST_WAIT_MS = (options.loadWaitMinutes ?? 20) * 60_000
const origin = 'https://www.buienradar.nl'
const observeAfterFirstFrameMs = 15_000
const selectors = { radarImage: 'img.leaflet-image-layer', mapContainer: '.leaflet-container', timeLabel: '[class*="time" i]' }

for (const profileId of options.profiles) {
  for (const scenario of options.scenarios ?? ['referentie-buienradar']) {
  for (let repetition = 1; repetition <= options.repeat; repetition++) {
    test(`${profileId} / ${scenario} / run ${repetition}`, async ({ page, context }) => {
      const calibrated = performanceProfile(profileId)
      const profile = { ...calibrated, cpuThrottleRate: options.cpuRate ?? calibrated.cpuThrottleRate }
      test.setTimeout(240_000 + QUIET_HOST_WAIT_MS)
      if (!warmingCache && process.env.MOTREGEN_PERF_LOCK_HELD !== '1' && !await waitForQuietHost(QUIET_HOST_WAIT_MS, (message) => console.log(message))) {
        throw new Error(`Host blijft te druk (loadavg ${hostLoadAverage()}); geen meting`)
      }
      const loadAverage = hostLoadAverage()
      if (!warmingCache) expect(loadAverage, 'startloadavg <8; nooit wachten onder de perf-lock').toBeLessThan(8)
      const events: ReferenceEvent[] = []
      const actions: ReferenceReport['actions'] = []
      await page.exposeFunction('__referenceEvent', (event: ReferenceEvent) => { events.push(event) })
      await page.addInitScript(installReferenceProbe, selectors)
      const cdp = await context.newCDPSession(page)
      await applyEmulation(cdp, profile)
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: !process.env.MOTREGEN_RIG_WARM_PROFILE })
      if (profile.device) {
        await page.setViewportSize(profile.device.viewport)
        await cdp.send('Emulation.setUserAgentOverride', { userAgent: profile.device.userAgent })
      }

      const capturedAt = new Date().toISOString()
      const requests: Request[] = []
      context.on('request', request => requests.push(request))
      const navigationStartMs = Date.now()
      await page.goto(origin, { waitUntil: 'commit', timeout: 120_000 })
      const consent = acceptConsent(page, actions, warmVisit ? 3_000 : 60_000)
      mkdirSync('tmp/perf-mobile', { recursive: true })
      const output = `tmp/perf-mobile/${profileId}-${scenario}-run${repetition}`
      try {
        await expect.poll(() => events.some((event) => event.kind === 'radar-frame'), { timeout: 150_000, message: 'eerste radarbeeld zichtbaar' }).toBe(true)
        await consent
        await page.waitForTimeout(observeAfterFirstFrameMs)
      } finally {
        // Ook bij een mislukte run: zonder beeld en gebeurtenissen is niet te zien of de site of de detectie veranderde.
        await page.screenshot({ path: `${output}.png` }).catch(() => undefined)
        writeFileSync(`${output}.events.json`, `${JSON.stringify({ url: page.url(), actions, events }, null, 2)}\n`)
      }

      const inventory = await cacheInventory(page)
      if (warmingCache) {
        writeFileSync(`${process.env.MOTREGEN_RIG_WARM_PROFILE}/cache-seed.json`, JSON.stringify({ completedAt: new Date().toISOString(), inventory, consent: actions, cookies: (await context.cookies()).map(cookie => ({ name: cookie.name, domain: cookie.domain })) }, null, 2))
        console.log('Buienradar cachevulbezoek voltooid; Chromium wordt gesloten, geen perf-rapport')
        return
      }
      const timeOrigin = await page.evaluate(() => performance.timeOrigin)
      const waterfall = await Promise.all(requests.map(async request => {
        const timing = request.timing()
        const response = await request.response()
        const sizes = await request.sizes().catch(() => null)
        return { url: request.url(), startMs: timing.startTime - timeOrigin, endMs: timing.responseEnd < 0 ? null : timing.startTime - timeOrigin + timing.responseEnd, status: response?.status(), fromServiceWorker: response?.fromServiceWorker(), bodyBytes: sizes?.responseBodySize ?? null, headers: response?.headers() }
      }))
      writeFileSync(`${output}.raw.json`, JSON.stringify({ requests: waterfall, resourceTiming: await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.toJSON())), cache: { seed: seedEvidence(), visit: inventory } }, null, 2))

      const report: ReferenceReport = {
        meta: { profile: profileId, origin, capturedAt, cpuThrottleRate: profile.cpuThrottleRate, network: profile.network, observeAfterFirstFrameMs, loadAverage, rendererCpuQuotaPercent: Number(process.env.MOTREGEN_RIG_RENDERER_QUOTA ?? 0) || null, cacheState: warmVisit ? 'warm-disk-new-browser' : 'cold' },
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
}

/**
 * Een koude bezoeker moet eerst door de toestemmingsmuur. De rig klikt zodra de knop er staat:
 * sneller dan een mens, dus de referentie valt eerder gunstig dan ongunstig uit voor Buienradar.
 */
async function acceptConsent(page: Page, actions: ReferenceReport['actions'], timeout: number): Promise<void> {
  const steps = [
    { name: 'toestemming: persoonlijke advertenties', locator: page.getByText('Met persoonlijke advertenties', { exact: true }) },
    { name: 'toestemming: doorgaan', locator: page.getByRole('button', { name: 'Doorgaan' }) },
  ]
  for (const step of steps) {
    try {
      await step.locator.click({ timeout })
      actions.push({ name: step.name, wallMs: Date.now() })
    } catch {
      actions.push({ name: `${step.name} (niet verschenen)`, wallMs: Date.now() })
      return
    }
  }
}
