// U72 meetrig: wat kost het voorfilter per frame? Zet de rig-schakelaar `motregen-dev-regenveld-meet` aan (elke
// pass wacht op de GPU via een teruggelezen pixel), speelt 20 s af op het po-android-profiel en vat de passes samen.
// Gebruik (onder de perf-lock, vanuit web/): pnpm exec tsx tmp/u72/filter-cost.ts <baseURL> <label> <uren vooruit> <radar-stand> <harmonie-stand>
// Let op: SwiftShader rekent het filter op de CPU (met de renderer-quota van 40 %); een telefoon-GPU doet
// hetzelfde werk parallel. De tijden zijn dus een bovengrens en vooral onderling vergelijkbaar.
import { chromium, devices } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { loadavg } from 'node:os'
import { performanceProfile } from '../../e2e/profiles'

const [baseURL = 'http://127.0.0.1:4320', label = 'run', hoursAhead = '9', radar = 'bilineair', harmonie = 'bilineair'] = process.argv.slice(2)
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })
const poAndroid = performanceProfile('po-android')
const maxLoad = Number(process.env.U72_MAX_LOAD ?? 16)
const loadAtStart = Math.round(loadavg()[0]! * 100) / 100
if (loadAtStart > maxLoad) throw new Error(`loadavg ${loadAtStart} > ${maxLoad}: geen meting`)

const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader',
  `--renderer-cmd-prefix=systemd-run --user --scope --quiet -p CPUQuota=${poAndroid.rendererCpuQuotaPercent}% -p CPUQuotaPeriodSec=5ms --`] })
const context = await browser.newContext({ ...devices['Pixel 5'], ...poAndroid.device })
await context.addInitScript('globalThis.__name = (target) => target')
await context.addInitScript(([radarChoice, harmonieChoice]) => {
  localStorage.setItem('motregen-dev-regenveld-radar', radarChoice!)
  localStorage.setItem('motregen-dev-regenveld-harmonie', harmonieChoice!)
  localStorage.setItem('motregen-dev-regenveld-meet', 'aan')
}, [radar, harmonie])
const page = await context.newPage()
const start = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam', dateStyle: 'short', timeStyle: 'short' }).format(new Date(Date.now() + Number(hoursAhead) * 3_600_000))
await page.goto(`${baseURL}/?dev#t=${start.replace(' ', 'T').replace(':', '')}`)
await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
await page.waitForTimeout(3_000)
if (await page.locator('.freshness-dialog[open]').count()) {
  await page.keyboard.press('Escape')
  await page.locator('.freshness-dialog[open]').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => undefined)
}
await page.evaluate(() => document.querySelector('.dev-panel')?.removeAttribute('open'))
await page.waitForTimeout(22_000)
const scrubber = page.locator('.scrub-surface')
if (await scrubber.getAttribute('data-playing') === null) await scrubber.press(' ')
await page.waitForTimeout(20_000)
const sources = await page.locator('[data-rain-sources]').getAttribute('data-rain-sources')
type Pass = { kernel: string; taps: number; sourceCellWidth: number; axis: 'x' | 'y'; milliseconds: number }
const passes = await page.evaluate(() => (window as unknown as { __motregenRainFilterPasses?: Pass[] }).__motregenRainFilterPasses ?? [])
await browser.close()

const groups = new Map<string, number[]>()
for (const pass of passes) {
  const key = `${pass.kernel} ${pass.taps} taps · broncel ${pass.sourceCellWidth} · ${pass.axis}`
  groups.set(key, [...(groups.get(key) ?? []), pass.milliseconds])
}
const rounded = (value: number) => Math.round(value * 10) / 10
const summary = {
  label, radar, harmonie, start, sourcesAtEnd: sources, load: [loadAtStart, Math.round(loadavg()[0]! * 100) / 100], passes: passes.length,
  perPass: Object.fromEntries([...groups].map(([key, values]) => {
    const sorted = [...values].sort((left, right) => left - right)
    return [key, { count: sorted.length, medianMs: rounded(sorted[Math.floor(sorted.length / 2)]!), maxMs: rounded(sorted.at(-1)!) }]
  })),
}
writeFileSync(`${outputDir}filter-cost-${label}.json`, JSON.stringify(summary, null, 1))
console.log(JSON.stringify(summary))
