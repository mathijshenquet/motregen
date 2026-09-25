import { expect, test, type BrowserContext, type Page } from '@playwright/test'

// MIP-13: exact deze velden mogen in het baken staan (docs/analytics.md, core/usage.ts).
const FEATURES = ['pinFeel', 'pinWind', 'hover', 'search', 'geo', 'fav', 'pin', 'play', 'scrub', 'history', 'fresh', 'about']
const REQUIRED = ['range', 'theme', 'coarse', 'width', 'dur']

function captureBeacons(context: BrowserContext): Array<Record<string, unknown>> {
  const beacons: Array<Record<string, unknown>> = []
  void context.route('**/hit', async (route) => {
    const request = route.request()
    expect(request.method()).toBe('POST')
    beacons.push(JSON.parse(request.postData() ?? 'null') as Record<string, unknown>)
    await route.fulfill({ status: 204 })
  })
  return beacons
}

function manifestRequests(page: Page): string[] {
  const urls: string[] = []
  page.on('request', (request) => { if (new URL(request.url()).pathname.endsWith('/manifest.json')) urls.push(request.url()) })
  return urls
}

function expectWhitelisted(body: Record<string, unknown>): void {
  for (const key of Object.keys(body)) expect([...FEATURES, ...REQUIRED]).toContain(key)
  for (const key of REQUIRED) expect(body).toHaveProperty(key)
  for (const feature of FEATURES) if (feature in body) expect(body[feature]).toBe(true)
}

async function openApp(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
}

test('the beacon waits for hidden visibility, is sent once and carries only whitelisted fields', async ({ page, context }, testInfo) => {
  const beacons = captureBeacons(context)
  const manifests = manifestRequests(page)
  await openApp(page)

  await page.getByRole('group', { name: 'Tijdsbereik' }).getByRole('button', { name: '+24u' }).click()
  await page.getByRole('button', { name: 'Over motregen en instellingen' }).press('Enter')
  const about = page.getByRole('dialog', { name: 'motregen.nl' })
  await expect(about).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(about).toBeHidden()

  // Tijdens de sessie: geen baken, en alleen het eerste manifest draagt de sessievlag.
  await page.waitForTimeout(300)
  expect(beacons).toEqual([])
  expect(manifests.length).toBeGreaterThanOrEqual(1)
  expect(new URL(manifests[0]!).search).toBe('?s=1')
  for (const url of manifests.slice(1)) expect(new URL(url).search).toBe('')

  const setVisibility = (state: 'hidden' | 'visible') => page.evaluate((next) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => next })
    document.dispatchEvent(new Event('visibilitychange'))
  }, state)
  await setVisibility('hidden')
  await expect.poll(() => beacons.length).toBe(1)
  const body = beacons[0]!
  expectWhitelisted(body)
  expect(body).toMatchObject({ about: true, range: '24', theme: 'light', dur: '<1' })
  const mobile = testInfo.project.name !== 'desktop'
  expect(body.coarse).toBe(mobile)
  expect(body.width).toBe(mobile ? '<430' : '>=960')

  // Terug naar zichtbaar en weer weg: geen tweede sessie, ook niet bij pagehide.
  await setVisibility('visible')
  await setVisibility('hidden')
  await page.close({ runBeforeUnload: true })
  await page.waitForTimeout(300)
  expect(beacons).toHaveLength(1)
})

test('closing the tab sends the beacon', async ({ page, context }) => {
  const beacons = captureBeacons(context)
  await openApp(page)
  expect(beacons).toEqual([])
  await page.close({ runBeforeUnload: true })
  await expect.poll(() => beacons.length).toBe(1)
  expectWhitelisted(beacons[0]!)
})
