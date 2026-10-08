import { expect, test, type Page } from '@playwright/test'

async function mockPlaces(page: Page): Promise<void> {
  const locations: Record<string, { label: string; lng: number; lat: number }> = {
    Utrecht: { label: 'Utrecht', lng: 5.12, lat: 52.09 },
    Groningen: { label: 'Groningen', lng: 6.57, lat: 53.22 },
    "'s-Hertogenbosch": { label: "'s-Hertogenbosch", lng: 5.3, lat: 51.69 },
  }
  await page.route('https://api.pdok.nl/**', (route) => {
    const url = new URL(route.request().url())
    const key = url.searchParams.get('q') ?? url.searchParams.get('id') ?? ''
    const place = locations[key]
    return route.fulfill({ json: { response: { docs: place ? [{ id: key, type: 'woonplaats', weergavenaam: place.label, centroide_ll: `POINT(${place.lng} ${place.lat})` }] : [] } } })
  })
  await page.route('https://geo.api.vlaanderen.be/**', (route) => route.fulfill({ json: { LocationResult: [] } }))
}

test('a wind preset pauses on the requested relative hour', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'gedrag: één profiel volstaat')
  await page.goto('/?modus=wind&t=+2u')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  await expect(page.locator('.forecast-table')).toHaveAttribute('data-mode', 'wind')
  await expect(page.locator('.scrubber')).not.toHaveAttribute('data-playing', '')
  await expect(page).toHaveURL(/\/wind\/de-bilt#t=\d{4}-\d{2}-\d{2}T\d{4}$/)

  const expectedTime = await page.evaluate(async () => {
    const manifest = await fetch('/data/manifest.json').then((response) => response.json() as Promise<{ now: string }>)
    return new Date(Date.parse(manifest.now) + 2 * 3_600_000).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  })
  await expect(page.locator('.freshness-trigger')).toHaveAttribute('aria-label', new RegExp(`^Kaart ${expectedTime}`))
})

test('a place path opens the selected mode before the first map image', async ({ page }) => {
  await mockPlaces(page)
  await page.goto('/wind/utrecht')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  await expect(page.locator('.forecast-table')).toHaveAttribute('data-mode', 'wind')
  await expect(page.locator('.scrubber')).toHaveAttribute('aria-label', /voor Utrecht$/)
  await expect(page).toHaveURL(/\/wind\/utrecht$/)
  await expect(page).toHaveTitle('Wind Utrecht — motregen.nl')
})

test('query place wins over the path and moves time to a fragment while keeping flags', async ({ page }) => {
  await mockPlaces(page)
  await page.goto('/wind/utrecht?modus=gevoel&plaats=Groningen&t=+2u&tg=1&dev')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  await expect(page.locator('.scrubber')).toHaveAttribute('aria-label', /voor Groningen$/)
  await expect(page.locator('.forecast-table')).toHaveAttribute('data-mode', 'temperature')
  const url = new URL(page.url())
  expect(url.pathname).toBe('/gevoel/groningen')
  expect([...url.searchParams.keys()].sort()).toEqual(['dev', 'tg'])
  expect(url.hash).toMatch(/^#t=\d{4}-\d{2}-\d{2}T\d{4}$/)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://motregen.nl/gevoel/groningen')
  await page.locator('.freshness-dialog .about-close').click()
  await expect.poll(() => new URL(page.url()).hash).toBe('')
})

test('coordinates win over a place path and normalize before the map becomes ready', async ({ page }) => {
  await page.route('**/data/manifest.json*', async (route) => {
    const response = await route.fetch()
    await new Promise((resolve) => setTimeout(resolve, 500))
    await route.fulfill({ response })
  })
  await page.addInitScript(() => {
    const replace = history.replaceState.bind(history)
    history.replaceState = (...args) => {
      const root = document.documentElement
      if (!document.querySelector('.map-splash.ready')) root.dataset.urlBeforeMap = String(args[2])
      if (!document.querySelector('.maplibregl-canvas')) root.dataset.urlBeforeCanvas = String(args[2])
      replace(...args)
    }
  })
  await page.goto('/wind/groningen?lat=52.09&lon=5.12&t=-1u')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  await expect(page).toHaveURL(/\/wind\/utrecht#t=/)
  await expect(page.locator('html')).toHaveAttribute('data-url-before-map', /\/wind\/utrecht#t=/)
  await expect(page.locator('html')).toHaveAttribute('data-url-before-canvas', /\/wind\/utrecht#t=/)
  await expect(page.locator('.scrubber')).toHaveAttribute('aria-label', /voor Utrecht$/)
})

test('browser back and forward apply the mode, place and time on the visited entry', async ({ page }) => {
  await mockPlaces(page)
  await page.goto('/wind/utrecht')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  await page.evaluate(() => {
    history.pushState(null, '', '/gevoel/groningen#t=2026-10-07T1200')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page).toHaveTitle('Gevoelstemperatuur Groningen — motregen.nl')
  await expect(page.locator('.scrubber')).toHaveAttribute('aria-label', /voor Groningen$/)
  await page.goBack()
  await expect(page).toHaveTitle('Wind Utrecht — motregen.nl')
  await expect(page.locator('.forecast-table')).toHaveAttribute('data-mode', 'wind')
  await expect(page.locator('.scrubber')).toHaveAttribute('aria-label', /voor Utrecht$/)
  expect(new URL(page.url()).hash).toBe('')
  await page.goForward()
  await expect(page).toHaveTitle('Gevoelstemperatuur Groningen — motregen.nl')
  await expect(page.locator('.forecast-table')).toHaveAttribute('data-mode', 'temperature')
  await expect(page.locator('.scrubber')).toHaveAttribute('aria-label', /voor Groningen$/)
  await expect(page.locator('.scrubber')).not.toHaveAttribute('data-playing', '')
})

test('a compact fragment time opens the clock and disappears when it closes', async ({ page }) => {
  await mockPlaces(page)
  await page.goto('/weer/utrecht#t=2026-10-07T1200')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  await expect(page.locator('.freshness-dialog')).toBeVisible()
  await expect(page.locator('.scrubber')).not.toHaveAttribute('data-playing', '')
  await page.locator('.freshness-dialog .about-close').click()
  await expect(page).toHaveURL(/\/weer\/utrecht$/)
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
