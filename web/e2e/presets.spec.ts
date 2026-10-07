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
  const manifest = await page.evaluate(async () => fetch('/manifest.webmanifest').then((response) => response.json() as Promise<{
    name: string
    short_name: string
    display: string
    icons: Array<{ sizes: string; purpose?: string }>
  }>))
  expect(manifest.name).toBe('motregen.nl')
  expect(manifest.short_name).toBe('motregen.nl')
  expect(manifest.display).toBe('standalone')
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: '192x192' }),
    expect.objectContaining({ sizes: '512x512' }),
    expect.objectContaining({ purpose: 'maskable' }),
  ]))
})
