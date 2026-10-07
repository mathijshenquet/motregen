import { expect, test } from '@playwright/test'

const label = process.env.MOTREGEN_BASEMAP_VARIANT?.split('/').at(-1) ?? (process.env.MOTREGEN_MOBILE_BASEMAP ?? 'own')

for (const width of [1280, 390]) {
  for (const theme of ['light', 'dark']) {
    test(`basiskaart ${width}px ${theme}`, async ({ page }, testInfo) => {
      const basemap = process.env.MOTREGEN_MOBILE_BASEMAP ?? 'own'
      const errors: string[] = []
      const basemapResponses: Array<{ status: number; range: string | undefined }> = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
      page.on('response', (response) => {
        if (response.url().endsWith('.pmtiles')) basemapResponses.push({ status: response.status(), range: response.headers()['content-range'] })
      })
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 })
      await page.addInitScript((theme) => localStorage.setItem('motregen-theme', theme), theme)
      await page.goto('/?t=%2B0u&modus=weer')
      await expect(page.locator('.map-splash.ready')).toBeAttached()
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      if (basemap === 'own') {
        await expect.poll(() => basemapResponses.length).toBeGreaterThan(1)
        expect(basemapResponses.every((response) => response.status === 206 && response.range?.startsWith('bytes '))).toBe(true)
      }
      await page.waitForTimeout(2_000)
      expect(errors).toEqual([])
      await page.screenshot({ path: `tmp/basemap/${label}-${width}-${theme}.png`, fullPage: true })
      await testInfo.attach('basiskaart', { path: `tmp/basemap/${label}-${width}-${theme}.png`, contentType: 'image/png' })
    })
  }
}

if (process.env.MOTREGEN_MOBILE_BASEMAP === 'own') {
  for (const width of [390, 1280, 3840]) {
    test(`maximale kaartzoom ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 })
      await page.addInitScript(() => {
        localStorage.setItem('motregen-theme', 'light')
        localStorage.setItem('motregen-map-view', JSON.stringify({ lng: 4.12, lat: 51.9, zoom: 20 }))
      })
      await page.goto('/?t=%2B0u&modus=weer')
      await expect(page.locator('.map-splash.ready')).toBeAttached()
      await page.waitForTimeout(2_000)
      const camera = await page.evaluate(() => (window as unknown as { __motregenCamera: () => { lng: number; lat: number; zoom: number } }).__motregenCamera())
      const viewport = await page.locator('.map').evaluate((element: HTMLElement) => ({ width: element.clientWidth, height: element.clientHeight }))
      const maxZoom = Math.log2(40_075.017 * Math.cos(camera.lat * Math.PI / 180) * viewport.width / (512 * 20))
      expect(camera.zoom).toBeCloseTo(maxZoom, 1)
      const path = `tmp/basemap/${label}-max-${width}.png`
      await page.screenshot({ path, fullPage: true })
      await testInfo.attach('maximale kaartzoom', { path, contentType: 'image/png' })
      await testInfo.attach('camera', { body: JSON.stringify({ camera, viewport }), contentType: 'application/json' })
    })
  }
}
