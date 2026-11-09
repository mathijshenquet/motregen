import { chromium, firefox, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { writeFileSync } from 'node:fs'

// U110: wanneer verschijnen de winddeeltjes, en hoe gespreid? Meet per animatieframe de "inkt" van de
// zichtbare koppen (Σ alpha/255 × de onthullingsfade van de laag) en rapporteert de tijd tot 1 %, 50 % en
// 90 % van de stationaire inkt (mediaan van de laatste 3 s), plus de steilste toename per 250 ms.
// Tijden zijn ms sinds navigatie (koud/warm) of sinds de klik op Wind (wissel).
//
// Inkt is per budgetdeeltje (zie collect).
//
// usage: pnpm exec tsx scripts/wind-first-particles.ts ORIGIN [--browser=chromium|firefox] [--phone]
//          [--scenario=koud,warm,wissel] [--repeat=N] [--seconds=S] [--json=UIT.json]
//   --size=BxH: desktopbeeld (standaard 1440x900; swiftshader haalt daar maar ~7 fps).
//   --phone: 402×844, dpr 3, touch, 4× CPU-rem (alleen Chromium; zoals windsock-perf/mobile-4g).
//   wissel: koud op / laden, 1 s na de eerste regenbeelden op Wind tikken.

const args = process.argv.slice(2)
const origin = args.find((arg) => !arg.startsWith('--'))
if (!origin) throw new Error('usage: pnpm exec tsx scripts/wind-first-particles.ts ORIGIN [--browser=…] [--phone] [--scenario=…] [--repeat=N] [--json=…]')
const option = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const browserName = option('browser') ?? 'chromium'
const phone = args.includes('--phone')
const scenarios = (option('scenario') ?? 'koud,warm,wissel').split(',')
const repeat = Number(option('repeat') ?? 1)
const seconds = Number(option('seconds') ?? 20)
const jsonPath = option('json')
const [sizeWidth, sizeHeight] = (option('size') ?? '1440x900').split('x').map(Number)

interface Sample { t: number; ink: number; heads: number; stage: number; sim: number; budget: number }
interface Run { browser: string; phone: boolean; scenario: string; run: number; zeroMs: number; samples: Sample[]; metrics: Metrics }
interface Metrics { simSpreadMs: number | null; simHalfMs: number | null; layerMs: number | null; framesMs: number | null; fpsAfterFirst: number; steadyInk: number; firstMs: number | null; halfMs: number | null; ninetyMs: number | null; spreadMs: number | null; steepestPer250ms: number }

// In de pagina: per frame de koppen van de windlaag lezen (privévelden zijn runtime gewoon bereikbaar).
// Als tekst: tsx voegt anders `__name(…)`-aanroepen in die in de pagina niet bestaan.
const sampler = `(() => {
  const samples = []
  window.__u110Samples = samples
  // Simulatieklok zoals de laag hem ziet: per frame hooguit 40 ms (WindLayer.renderStep).
  let simulated = 0
  let previous
  const tick = () => {
    const wind = globalThis.__motregenWind
    const now = performance.now()
    if (wind) {
      const started = wind.revealStarted
      const reveal = started === undefined ? 0 : wind.revealDuration ? Math.min(1, (now - started) / wind.revealDuration) : 1
      const opacity = wind.tuning.intensity * Math.min(wind.tuning.visibility, 1) * reveal
      let ink = 0
      let heads = 0
      for (let index = 0; index < wind.active; index++) {
        const alpha = wind.instanceBytes[index * 20 + 19]
        if (alpha === 0 || wind.ages[index] <= 0) continue
        heads++
        ink += alpha / 255
      }
      if (wind.left && previous !== undefined) simulated += Math.min(40, now - previous)
      previous = wind.left ? now : undefined
      samples.push([now, ink * opacity, heads, wind.left ? 2 : 1, simulated, wind.budget])
    } else samples.push([now, 0, 0, 0, 0, 0])
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})()`

function metrics(samples: Sample[]): Metrics {
  const end = samples.at(-1)?.t ?? 0
  const tail = samples.filter((sample) => sample.t >= end - 3_000).map((sample) => sample.ink).sort((a, b) => a - b)
  const steadyInk = tail[Math.floor(tail.length / 2)] ?? 0
  const reach = (fraction: number) => samples.find((sample) => sample.ink >= steadyInk * fraction)?.t ?? null
  const firstMs = steadyInk > 0 ? reach(0.01) : null
  const halfMs = steadyInk > 0 ? reach(0.5) : null
  const ninetyMs = steadyInk > 0 ? reach(0.9) : null
  let steepest = 0
  let from = 0
  for (const sample of samples) {
    while (samples[from]!.t < sample.t - 250) from++
    if (steadyInk > 0) steepest = Math.max(steepest, (sample.ink - samples[from]!.ink) / steadyInk)
  }
  const layerMs = samples.find((sample) => sample.stage >= 1)?.t ?? null
  const framesMs = samples.find((sample) => sample.stage >= 2)?.t ?? null
  const afterFirst = firstMs === null ? [] : samples.filter((sample) => sample.t >= firstMs && sample.t < firstMs + 3_000)
  const fpsAfterFirst = afterFirst.length > 1 ? (afterFirst.length - 1) / ((afterFirst.at(-1)!.t - afterFirst[0]!.t) / 1_000) : 0
  // Spreiding op de simulatieklok: zo ziet een apparaat op volle fps de opbouw.
  const simAt = (ms: number | null) => ms === null ? null : samples.find((sample) => sample.t >= ms)?.sim ?? null
  const simFirst = simAt(firstMs)
  const simSpreadMs = simFirst === null || ninetyMs === null ? null : simAt(ninetyMs)! - simFirst
  const simHalfMs = simFirst === null || halfMs === null ? null : simAt(halfMs)! - simFirst
  return { simSpreadMs, simHalfMs, layerMs, framesMs, fpsAfterFirst, steadyInk, firstMs, halfMs, ninetyMs, spreadMs: firstMs !== null && ninetyMs !== null ? ninetyMs - firstMs : null, steepestPer250ms: steepest }
}

async function newContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext(phone
    ? { viewport: { width: 402, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: browserName === 'chromium', timezoneId: 'Europe/Amsterdam' }
    : { viewport: { width: sizeWidth!, height: sizeHeight! }, timezoneId: 'Europe/Amsterdam' })
  await context.addInitScript({ content: sampler })
  return context
}

async function throttle(context: BrowserContext, page: Page): Promise<void> {
  if (!phone || browserName !== 'chromium') return
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
}

async function collect(page: Page, zeroMs: number): Promise<Sample[]> {
  const raw = await page.evaluate(() => (window as unknown as { __u110Samples: Array<[number, number, number, number, number, number]> }).__u110Samples)
  // Inkt per budgetdeeltje: op swiftshader (~15 fps) knipt adjustBudget het budget na 45 trage frames met 22 %, en
  // dat leek anders een overshoot van de opbouw.
  return raw.map(([t, ink, heads, stage, sim, budget]) => ({ t: Math.round(t - zeroMs), ink: budget > 0 ? ink / budget : 0, heads, stage, sim, budget }))
}

const launch = browserName === 'firefox'
  ? () => firefox.launch({
    headless: true,
    firefoxUserPrefs: { 'webgl.force-enabled': true, 'gfx.webrender.software': true },
    env: {
      ...process.env,
      LIBGL_ALWAYS_SOFTWARE: '1',
      ...process.env.MOTREGEN_FIREFOX_MESA ? {
        LIBGL_DRIVERS_PATH: `${process.env.MOTREGEN_FIREFOX_MESA}/lib/dri`,
        __EGL_VENDOR_LIBRARY_FILENAMES: `${process.env.MOTREGEN_FIREFOX_MESA}/share/glvnd/egl_vendor.d/50_mesa.json`,
        LD_LIBRARY_PATH: `${process.env.MOTREGEN_FIREFOX_MESA}/lib:${process.env.MOTREGEN_FIREFOX_GL}/lib`,
      } : {},
    } as Record<string, string>,
  })
  : () => chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })

const runs: Run[] = []
const browser = await launch()
for (let run = 1; run <= repeat; run++) {
  // Warm = dezelfde pagina opnieuw naar /wind (HTTP-cache, service worker en IndexedDB gevuld).
  let warm: { context: BrowserContext; page: Page } | undefined
  for (const scenario of scenarios) {
    const reuse = scenario === 'warm' ? warm : undefined
    const context = reuse?.context ?? await newContext(browser)
    const page = reuse?.page ?? await context.newPage()
    page.setDefaultTimeout(120_000)
    if (!reuse) await throttle(context, page)
    let zeroMs = 0
    if (scenario === 'wissel') {
      await page.goto(new URL('/', origin).href)
      await page.locator('.scrubber-placeholder').waitFor({ state: 'detached' })
      await page.waitForTimeout(1_000)
      await page.locator('.freshness-close').click({ timeout: 2_000 }).catch(() => {})
      zeroMs = await page.evaluate(() => performance.now())
      await page.getByRole('button', { name: 'Wind', exact: true }).first().click()
    } else {
      if (scenario === 'warm' && !reuse) {
        // Warm zonder voorafgaande koude run: eerst opwarmen.
        await page.goto(new URL('/wind', origin).href)
        await page.waitForTimeout(seconds * 1_000)
      }
      await page.goto(new URL('/wind', origin).href)
    }
    await page.waitForTimeout(seconds * 1_000)
    const samples = await collect(page, zeroMs)
    const ttfrMs = await page.evaluate(() => (globalThis as unknown as { __motregenPerf?: { snapshot: () => { ttfrMs: number | null } } }).__motregenPerf?.snapshot().ttfrMs ?? null)
    const result = { ttfrMs: ttfrMs === null || scenario === 'wissel' ? null : Math.round(ttfrMs), browser: browserName, phone, scenario, run, zeroMs: Math.round(zeroMs), samples, metrics: metrics(samples) }
    runs.push(result)
    const m = result.metrics
    const fmt = (value: number | null) => value === null ? '—' : `${(value / 1_000).toFixed(2)} s`
    console.log(`${browserName}${phone ? ' telefoon' : ' desktop'} ${scenario} #${run}: regen ${fmt(result.ttfrMs)}, laag ${fmt(m.layerMs)}, velden ${fmt(m.framesMs)}, eerste ${fmt(m.firstMs)}, 50 % ${fmt(m.halfMs)}, 90 % ${fmt(m.ninetyMs)}, spreiding ${fmt(m.spreadMs)} (sim: 50 % na ${fmt(m.simHalfMs)}, 90 % na ${fmt(m.simSpreadMs)}), steilste ${(m.steepestPer250ms * 100).toFixed(0)} % per 250 ms, stationair ${m.steadyInk.toFixed(2)} inkt/deeltje, ${m.fpsAfterFirst.toFixed(0)} fps`)
    if (scenario === 'koud') warm = { context, page }
    else if (context !== warm?.context) await context.close()
  }
  await warm?.context.close()
}
await browser.close()
if (jsonPath) writeFileSync(jsonPath, JSON.stringify(runs))
