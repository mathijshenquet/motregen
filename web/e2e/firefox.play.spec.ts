import { expect, test } from '@playwright/test'

// Alleen de kaarttest heeft X/EGL nodig; de adresbalktests behouden hun bestaande headless-profiel.
test.use({ headless: false })

test('Firefox begint de gedeelde klok terwijl de splash nog onthult', async ({ page }) => {
  await page.route('**/assets/index-*.css', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, body: `${await response.text()}\n.map-splash { --splash-reveal-duration: 5000ms; --splash-mark-duration: 5000ms; --splash-outer-delay: 0ms; --splash-outer-duration: 5000ms; }` })
  })
  await page.goto('/?perf=1', { waitUntil: 'commit' })
  await page.waitForFunction(() => window.__motregenPerf?.snapshot().ttfpMs != null)
  const snapshot = await page.evaluate(() => window.__motregenPerf!.snapshot())
  expect(snapshot.mapRevealedMs).toBeNull()
  expect(snapshot.firstCursorMs).toBeGreaterThanOrEqual(snapshot.firstRainMs!)
  expect(snapshot.ttfrMs).toBe(snapshot.firstCursorMs)
  await expect(page.getByRole('slider', { name: 'Tijd' })).toHaveAttribute('data-playing', '')
  await expect(page.locator('.map-splash.ready')).toBeVisible()
})
