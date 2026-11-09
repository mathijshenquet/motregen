import { chromium } from '@playwright/test'

// Kosten van de windzakken (U101 ronde 3) op het telefoonprofiel: 402×844, dpr 3, 4× CPU-rem (zoals mobile-4g).
// Per scenario 10 s meten met de PerfHud-monitor (`?perf`): de fase `windsock-draw` en de fps van de pagina.
// usage: pnpm exec tsx scripts/windsock-perf.ts ORIGIN TIJD [EXTRA-DEV-QUERY]   (bv. windfactor=2)
//   WINDSOCK_PERF_SOFTWARE_2D=1 rastert de 2D-canvas in software (swiftshader-GPU-2D is pathologisch traag, zie U101-LOG).
const [origin, time, extra] = process.argv.slice(2)
if (!origin || !time) throw new Error('usage: pnpm exec tsx scripts/windsock-perf.ts ORIGIN TIJD')
// U107: `idleMs` wacht zonder interactie (wuifbudget: na 30 s 15 fps), `scroll` scrolt de tabel in beeld (kaart weg).
//   WINDSOCK_PERF_SCENARIOS=data,stil kiest scenario's op naamprefix; WINDSOCK_PERF_RATE=1 meet zonder CPU-rem.
const allScenarios: Array<{ name: string; query: string; idleMs?: number; scroll?: boolean }> = [
  { name: 'storm, trilling', query: 'windfactor=2.2' },
  { name: 'data (max ~5 Bft)', query: '' },
  { name: 'stil > 30 s', query: '', idleMs: 31_000 },
  { name: 'tabel in beeld', query: '', scroll: true },
]
const scenarios = process.env.WINDSOCK_PERF_SCENARIOS ? allScenarios.filter((scenario) => process.env.WINDSOCK_PERF_SCENARIOS!.split(',').some((prefix) => scenario.name.startsWith(prefix))) : allScenarios
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', ...(process.env.WINDSOCK_PERF_SOFTWARE_2D ? ['--disable-accelerated-2d-canvas'] : [])] })
for (const scenario of scenarios) {
  const context = await browser.newContext({ viewport: { width: 402, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, timezoneId: 'Europe/Amsterdam' })
  const page = await context.newPage()
  page.setDefaultTimeout(120_000)
  const cdp = await context.newCDPSession(page)
  await page.goto(new URL(`/wind?dev&perf&${scenario.query}${extra ? `&${extra}` : ''}&t=${time}`, origin).href)
  await page.locator('.scrubber-placeholder').waitFor({ state: 'detached' })
  await page.locator('.freshness-close').click()
  await page.locator('.map-overlay-windsocks[data-socks]').waitFor({ state: 'attached' })
  await page.waitForTimeout(5_000)
  if (scenario.scroll) {
    await page.evaluate(() => {
      const shell = document.querySelector('.app-shell')
      const scroller = shell && shell.scrollHeight > shell.clientHeight ? shell : document.scrollingElement!
      scroller.scrollTo(0, scroller.scrollHeight)
    })
    await page.waitForTimeout(1_000)
  }
  if (scenario.idleMs) await page.waitForTimeout(scenario.idleMs)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.WINDSOCK_PERF_RATE ?? 4) })
  await cdp.send('Performance.enable')
  const taskSeconds = async () => (await cdp.send('Performance.getMetrics')).metrics.find((metric) => metric.name === 'TaskDuration')?.value ?? 0
  const tasksBefore = await taskSeconds()
  const draws = () => page.evaluate(() => Number(document.querySelector<HTMLElement>('.map-overlay-windsocks')?.dataset.draws ?? 0))
  const before = await draws()
  await page.waitForTimeout(10_000)
  const result = await page.evaluate(() => {
    const snapshot = window.__motregenPerf.snapshot()
    return { phase: snapshot.phases['windsock-draw'], layout: snapshot.phases['windsock-layout'], fps: snapshot.fps, socks: document.querySelector<HTMLElement>('.map-overlay-windsocks')?.dataset.socks }
  })
  const busy = (await taskSeconds() - tasksBefore) / 10
  const phase = result.phase
  const drawn = await draws() - before
  const layout = result.layout ? `; indelen p50 ${result.layout.p50Ms.toFixed(2)} ms (${result.layout.count}×)` : ''
  console.log(`${scenario.name}: zakken|max-Bft ${result.socks}; ${drawn} tekeningen in 10 s${phase ? `, p50 ${phase.p50Ms.toFixed(2)} ms, p95 ${phase.p95Ms.toFixed(2)} ms` : ''}${layout}; pagina-fps ${result.fps}; hoofdthread bezet ${(busy * 100).toFixed(0)} %`)
  await context.close()
}
await browser.close()
