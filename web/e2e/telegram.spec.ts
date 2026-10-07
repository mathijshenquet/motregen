import { expect, test } from '@playwright/test'

test('Telegram launch applies presets and follows the host theme', async ({ page }) => {
  await page.route('https://telegram.org/js/telegram-web-app.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `window.Telegram = { WebApp: {
      colorScheme: 'dark', themeParams: { bg_color: '#112233', text_color: '#ddeeff' },
      initData: 'test-init-data', initDataUnsafe: { start_param: 'wind_1791382200' },
      expand() { window.telegramExpanded = true }, ready() { window.telegramReady = true },
      setHeaderColor() {}, setBackgroundColor() {},
      onEvent(event, callback) { window.telegramThemeChanged = callback }, offEvent() {}
    } }`,
  }))
  await page.route('**/telegram/validate', (route) => route.fulfill({ json: { valid: true } }))
  await page.goto('/?tg=1')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  await expect(page.locator('.forecast-table')).toHaveAttribute('data-mode', 'wind')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('html')).toHaveAttribute('data-telegram-verified', 'true')
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--page'))).toBe('#112233')
  expect(await page.evaluate(() => localStorage.getItem('motregen-theme'))).toBeNull()
  await page.evaluate(() => {
    const webApp = window.Telegram!.WebApp!
    webApp.colorScheme = 'light'
    webApp.themeParams.bg_color = '#aabbcc'
    const telegramWindow = window as unknown as { telegramThemeChanged(): void }
    telegramWindow.telegramThemeChanged()
  })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--page'))).toBe('#aabbcc')
})

test('ordinary visits never load the Telegram SDK', async ({ page }) => {
  const telegramRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('telegram.org/js/')) telegramRequests.push(request.url())
  })
  await page.goto('/')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  expect(telegramRequests).toEqual([])
})

for (const mode of ['weer', 'lucht', 'gevoel', 'wind']) {
  test(`national ${mode} still waits for its layers, has no controls and sends no usage beacon`, async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 1200 })
    const usageRequests: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('?s=1') || request.url().endsWith('/hit')) usageRequests.push(request.url())
    })
    await page.goto(`/?modus=${mode}&t=+2u&still=1`)
    await expect(page.locator('.map')).toHaveAttribute('data-still-ready', 'true', { timeout: 45_000 })
    await expect(page.locator('.dashboard')).toHaveCount(0)
    await expect(page.locator('.search-field')).toHaveCount(0)
    await expect(page.locator('.map-clock')).toHaveCount(0)
    await expect(page.locator('.maplibregl-marker:not(.isoline-label)')).toHaveCount(0)
    expect(await page.locator('.map').boundingBox()).toMatchObject({ width: 900, height: 1200 })
    const epoch = await page.locator('.app-shell').getAttribute('data-epoch')
    await page.waitForTimeout(200)
    await expect(page.locator('.app-shell')).toHaveAttribute('data-epoch', epoch!)
    await page.goto('about:blank')
    expect(usageRequests).toEqual([])
  })
}
