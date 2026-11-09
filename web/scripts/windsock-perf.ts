import { chromium } from '@playwright/test'

// Kosten van de windzakken (U101 ronde 3) op het telefoonprofiel: 402×844, dpr 3, 4× CPU-rem (zoals mobile-4g).
// Per scenario 10 s meten met de PerfHud-monitor (`?perf`): de fase `windsock-draw` en de fps van de pagina.
// usage: pnpm exec tsx scripts/windsock-perf.ts ORIGIN TIJD [EXTRA-DEV-QUERY]   (bv. zakstijl=gravure)
//   WINDSOCK_PERF_SOFTWARE_2D=1 rastert de 2D-canvas in software (swiftshader-GPU-2D is pathologisch traag, zie U101-LOG).
const [origin, time, extra] = process.argv.slice(2)
if (!origin || !time) throw new Error('usage: pnpm exec tsx scripts/windsock-perf.ts ORIGIN TIJD')
const scenarios = [
  { name: 'storm, trilling', query: 'windfactor=2.2' },
  { name: 'storm, fladder=uit', query: 'windfactor=2.2&fladder=uit' },
  { name: 'data (max ~5 Bft)', query: '' },
]
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
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const before = await page.evaluate(() => window.__motregenPerf.snapshot().phases['windsock-draw']?.count ?? 0)
  await page.waitForTimeout(10_000)
  const result = await page.evaluate(() => {
    const snapshot = window.__motregenPerf.snapshot()
    return { phase: snapshot.phases['windsock-draw'], fps: snapshot.fps, socks: document.querySelector<HTMLElement>('.map-overlay-windsocks')?.dataset.socks }
  })
  const phase = result.phase
  console.log(`${scenario.name}: zakken|max-Bft ${result.socks}; windsock-draw ${phase ? `${phase.count - before} tekeningen in 10 s (venster ${phase.count}), p50 ${phase.p50Ms.toFixed(2)} ms, p95 ${phase.p95Ms.toFixed(2)} ms` : '0 tekeningen'}; pagina-fps ${result.fps}`)
  await context.close()
}
await browser.close()
