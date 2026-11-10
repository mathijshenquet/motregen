import { chromium, firefox, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { loadavg } from 'node:os'

// U111: framegaten (rAF-intervallen) in de windmodus op een telefoonbeeld (402×844, DPR 3), per variant
// (`?dev&zakken=uit`, `?dev&isolijnen=uit`). Twee vensters per bezoek: "spelend" (vast venster in de autoplay) en
// "stil" (gepauzeerd, de zakken wuiven). Daarnaast per venster de JS-fasen uit `?perf`
// (windsock-draw, wind-step, isoline-blit, isoline-trace) en de loadavg van de host, die gedeeld is.
//
// usage: xvfb-run -a pnpm exec tsx scripts/wind-frame-gaps.ts ORIGIN [--browser=firefox|chromium]
//          [--variants=basis,zakken=uit,isolijnen=uit] [--repeat=N] [--warm=S] [--play=S] [--still=S] [--theme=licht|donker] [--json=UIT.json]
//   firefox: onder xvfb-run, met softwareraster (gfx.webrender.software) zoals de e2e; dat lijkt het meest op
//   Firefox Android, dat canvas-2D vaak op de CPU rastert. Varianten lopen om en om (ABAB) per herhaling.

const args = process.argv.slice(2)
const origin = args.find((arg) => !arg.startsWith('--'))
if (!origin) throw new Error('usage: pnpm exec tsx scripts/wind-frame-gaps.ts ORIGIN [--browser=…] [--variants=…] [--repeat=N] [--json=…]')
const option = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const browserName = option('browser') ?? 'firefox'
const variants = (option('variants') ?? 'basis,zakken=uit,isolijnen=uit').split(',')
const repeat = Number(option('repeat') ?? 2)
const stillSeconds = Number(option('still') ?? 8)
const playSeconds = Number(option('play') ?? 12)
const warmSeconds = Number(option('warm') ?? 6)
const theme = option('theme') ?? 'licht'
const jsonPath = option('json')

// In de pagina, als tekst (tsx voegt anders `__name(…)` in): per rAF de tijd en of de scrubber afspeelt, plus
// alle motregen-fasen via een PerformanceObserver (perf.ts wist zijn measures direct na het zetten).
const sampler = `(() => {
  const frames = []
  const phases = []
  window.__u111 = { frames, phases }
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) if (entry.name.startsWith('motregen:')) phases.push([entry.name.slice(9), entry.startTime, entry.duration])
  }).observe({ type: 'measure', buffered: false })
  const tick = (now) => {
    frames.push([now, document.querySelector('[data-playing]') ? 1 : 0])
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})()`

interface Window { gaps: Stats; frames: number; playingShare: number; seconds: number; fps: number; phases: Record<string, { count: number; p50: number; sum: number }>; load: number }
interface Stats { p50: number; p90: number; p99: number; max: number }
interface Visit { browser: string; variant: string; run: number; stil?: Window; spelend?: Window }

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!
}

async function window(page: Page, from: number, to: number): Promise<Window> {
  const { frames, phases } = await page.evaluate(() => (globalThis as unknown as { __u111: { frames: Array<[number, number]>; phases: Array<[string, number, number]> } }).__u111)
  const inWindow = frames.filter(([t]) => t >= from && t <= to)
  const times = inWindow.map(([t]) => t)
  const gaps = times.slice(1).map((t, index) => t - times[index]!).sort((a, b) => a - b)
  const byPhase: Window['phases'] = {}
  for (const name of ['windsock-draw', 'wind-step', 'isoline-blit', 'isoline-trace', 'windsock-layout', 'scrubber-paint']) {
    const durations = phases.filter(([phase, start]) => phase === name && start >= from && start <= to).map(([, , duration]) => duration).sort((a, b) => a - b)
    byPhase[name] = { count: durations.length, p50: round(quantile(durations, 0.5)), sum: round(durations.reduce((sum, value) => sum + value, 0)) }
  }
  const seconds = (to - from) / 1_000
  return {
    gaps: { p50: round(quantile(gaps, 0.5)), p90: round(quantile(gaps, 0.9)), p99: round(quantile(gaps, 0.99)), max: round(gaps.at(-1) ?? NaN) },
    frames: times.length, playingShare: round(inWindow.filter(([, playing]) => playing).length / Math.max(1, inWindow.length)), seconds: round(seconds), fps: round(times.length / seconds), phases: byPhase, load: loadavg()[0]!,
  }
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

const launch = (): Promise<Browser> => browserName === 'firefox'
  ? firefox.launch({
    // Gecko heeft voor WebGL een echte X/EGL-context nodig: draai onder `xvfb-run -a` (zoals e2e-slot.sh).
    headless: !process.env.DISPLAY,
    firefoxUserPrefs: { 'webgl.force-enabled': true, 'gfx.webrender.software': true },
    env: {
      ...process.env,
      LIBGL_ALWAYS_SOFTWARE: '1',
      LP_NUM_THREADS: '2',
      ...process.env.MOTREGEN_FIREFOX_MESA ? {
        LIBGL_DRIVERS_PATH: `${process.env.MOTREGEN_FIREFOX_MESA}/lib/dri`,
        __EGL_VENDOR_LIBRARY_FILENAMES: `${process.env.MOTREGEN_FIREFOX_MESA}/share/glvnd/egl_vendor.d/50_mesa.json`,
        LD_LIBRARY_PATH: `${process.env.MOTREGEN_FIREFOX_MESA}/lib:${process.env.MOTREGEN_FIREFOX_GL}/lib`,
      } : {},
    } as Record<string, string>,
  })
  : chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })

async function newContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: { width: 402, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: browserName === 'chromium',
    timezoneId: 'Europe/Amsterdam', colorScheme: theme === 'donker' ? 'dark' : 'light',
  })
  await context.addInitScript({ content: sampler })
  return context
}

const now = (page: Page) => page.evaluate(() => performance.now())
async function visit(browser: Browser, variant: string, run: number): Promise<Visit> {
  const context = await newContext(browser)
  const page = await context.newPage()
  page.setDefaultTimeout(120_000)
  const url = new URL('/wind', origin)
  url.searchParams.set('dev', '')
  url.searchParams.set('perf', '1')
  // `zakken=uit+isolijnen=uit` zet beide.
  for (const pair of variant === 'basis' ? [] : variant.split('+')) {
    const [key, value] = pair.split('=')
    url.searchParams.set(key!, value!)
  }
  await page.goto(url.href)
  // Het open dev-paneel ligt over de kaart; de PO-opname had alleen de perf-HUD.
  await page.locator('details.dev-panel').evaluate((panel) => panel.removeAttribute('open')).catch(() => {})
  const result: Visit = { browser: browserName, variant, run }
  // De app speelt vanzelf af, in Wind minutenlang (afspelen loopt op de klok, niet per tik). Venster 1: vast
  // `playSeconds` vanaf `warmSeconds` na de eerste afspeeltik; dan pauzeren met spatie op de klokknop (zoals een
  // gebruiker), venster 2: `stillSeconds` stil met wuivende zakken.
  await page.locator('[data-playing]').waitFor({ state: 'attached', timeout: 120_000 })
  await page.waitForTimeout(warmSeconds * 1_000)
  const playFrom = await now(page)
  await page.waitForTimeout(playSeconds * 1_000)
  result.spelend = await window(page, playFrom, await now(page))
  await page.locator('.freshness-trigger').press(' ')
  await page.locator('.clock-play').waitFor({ state: 'visible', timeout: 10_000 })
  await page.waitForTimeout(2_000)
  const stillFrom = await now(page)
  await page.waitForTimeout(stillSeconds * 1_000)
  result.stil = await window(page, stillFrom, await now(page))
  await context.close()
  return result
}

function line(visit: Visit, label: 'stil' | 'spelend'): string {
  const w = visit[label]
  if (!w) return `${visit.variant.padEnd(14)} ${label.padEnd(7)} —`
  const phase = (name: string) => `${name.replace('windsock-', 'zak-').replace('isoline-', 'iso-')} ${w.phases[name]!.count}×${w.phases[name]!.p50}`
  return `${visit.variant.padEnd(14)} ${label.padEnd(7)} gat p50/p90/p99/max ${w.gaps.p50}/${w.gaps.p90}/${w.gaps.p99}/${w.gaps.max} ms · ${w.fps} fps over ${w.seconds} s (${Math.round(w.playingShare * 100)} % spelend) · ${['windsock-draw', 'wind-step', 'isoline-blit', 'isoline-trace'].map(phase).join(' · ')} ms · load ${w.load.toFixed(2)}`
}

const visits: Visit[] = []
const browser = await launch()
for (let run = 1; run <= repeat; run++) {
  for (const variant of variants) {
    const result = await visit(browser, variant, run)
    visits.push(result)
    console.log(`#${run} ${line(result, 'stil')}`)
    console.log(`#${run} ${line(result, 'spelend')}`)
  }
}
await browser.close()
if (jsonPath) writeFileSync(jsonPath, JSON.stringify(visits, null, 1))
