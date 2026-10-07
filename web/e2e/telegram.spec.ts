import { expect, test } from '@playwright/test'

test('Telegram launch applies presets and follows the host theme without sending identifiers', async ({ page }) => {
  const identifierRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/telegram/validate') || request.postData()?.includes('test-init-data')) {
      identifierRequests.push(request.url())
    }
  })
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
  await page.goto('/?tg=1')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  await expect(page.locator('.forecast-table')).toHaveAttribute('data-mode', 'wind')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
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
  await page.goto('about:blank')
  expect(identifierRequests).toEqual([])
})

test('skywatch rendering keeps its own route alongside the Telegram bootstrap', async ({ page }) => {
  const telegramRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('telegram.org/js/')) telegramRequests.push(request.url())
  })
  const query = new URLSearchParams({
    'skywatch-render': '', tg: '1', at: '2026-10-07T10:00:00Z', sample: 'route-regression',
    times: JSON.stringify(['2026-10-07T10:00:00Z', '2026-10-07T13:00:00Z']),
    high: '[20,30]', mid: '[40,50]', low: '[60,70]',
  })
  await page.goto(`/?${query}`)
  await expect(page.getByTestId('skywatch-render')).toBeVisible()
  await expect(page.getByText('route-regression')).toBeVisible()
  await expect(page.locator('.map')).toHaveCount(0)
  expect(telegramRequests).toEqual([])
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

for (const mode of ['weer', 'lucht', 'gevoel']) {
  test(`national ${mode} still waits for its layers, has no controls and sends no usage beacon`, async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 1200 })
    const usageRequests: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('?s=1') || request.url().endsWith('/hit')) usageRequests.push(request.url())
    })
    await page.goto(`/?modus=${mode}&t=+3u&still=1`)
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
