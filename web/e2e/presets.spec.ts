import { expect, test } from '@playwright/test'

test('a wind preset pauses on the requested relative hour', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'gedrag: één profiel volstaat')
  await page.goto('/?modus=wind&t=+2u')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  await expect(page.locator('.forecast-table')).toHaveAttribute('data-mode', 'wind')
  await expect(page.locator('.scrubber')).not.toHaveAttribute('data-playing', '')

  const expectedTime = await page.evaluate(async () => {
    const manifest = await fetch('/data/manifest.json').then((response) => response.json() as Promise<{ now: string }>)
    return new Date(Date.parse(manifest.now) + 2 * 3_600_000).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  })
  await expect(page.locator('.freshness-trigger')).toHaveAttribute('aria-label', new RegExp(`^Kaart ${expectedTime}`))
})

test('the preview build registers its service worker', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'installability: één Chromium-profiel volstaat')
  await page.goto('/')
  const registration = await page.evaluate(async () => {
    const serviceWorker = await navigator.serviceWorker.ready
    return { scope: serviceWorker.scope, script: serviceWorker.active?.scriptURL }
  })
  expect(registration.scope).toBe(`${new URL(page.url()).origin}/`)
  expect(registration.script).toBe(`${new URL(page.url()).origin}/sw.js`)
})
