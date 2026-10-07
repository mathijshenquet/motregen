import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const basemap = process.env.MOTREGEN_MOBILE_BASEMAP ?? 'own'
const label = process.env.MOTREGEN_BASEMAP_VARIANT?.split('/').at(-1) ?? basemap
if (basemap !== 'fixture') {
  for (const width of [390, 1280]) {
    test(`MapLibre zonder netwerk ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 })
      await page.goto('/?t=%2B0u&modus=weer')
      await expect(page.locator('.map-splash.ready')).toBeAttached()
      const camera = await page.evaluate(() => (window as unknown as { __motregenCamera: () => { lng: number; lat: number; zoom: number } }).__motregenCamera())
      const viewport = await page.locator('.map').evaluate((element: HTMLElement) => ({ width: element.clientWidth, height: element.clientHeight }))
      await page.goto(`http://127.0.0.1:${process.env.MOTREGEN_E2E_DATA_PORT ?? 8392}/parse/index.html`)
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: width === 390 ? 4 : 1 })
      const results = []
      const views = [['start', camera]]
      if (basemap === 'own') views.push(['max', { lng: 4.12, lat: 51.9, zoom: Math.log2(40_075.017 * Math.cos(51.9 * Math.PI / 180) * viewport.width / (512 * 20)) }])
      for (const [view, measuredCamera] of views as Array<[string, typeof camera]>) {
        const result = await page.evaluate(async ({ camera, viewport }) => {
          const measure = (window as unknown as { measureBasemap: (camera: object, viewport: object) => Promise<{ runs: number[][] }> }).measureBasemap
          return measure(camera, viewport)
        }, { camera: measuredCamera, viewport })
        expect(result.runs.every(run => run.length > 0)).toBe(true)
        const durations = result.runs.flat().sort((left, right) => left - right)
        const totals = result.runs.map(run => run.reduce((sum, value) => sum + value, 0)).sort((left, right) => left - right)
        results.push({ view, ...result, p50Ms: durations[Math.ceil(durations.length / 2) - 1], p95Ms: durations[Math.ceil(durations.length * 0.95) - 1], medianTotalMs: totals[Math.floor(totals.length / 2)] })
      }
      mkdirSync('tmp/basemap', { recursive: true })
      writeFileSync(`tmp/basemap/${label}-parse-${width}.json`, `${JSON.stringify(results, null, 2)}\n`)
      console.log(`${label}/${width}: ${JSON.stringify(results.map(({ view, p50Ms, p95Ms, medianTotalMs }) => ({ view, p50Ms, p95Ms, medianTotalMs })))}`)
    })
  }
}
