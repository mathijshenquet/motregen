import { readFileSync } from 'node:fs'
import { expect, test, type Page, type TestInfo } from '@playwright/test'

// MIP-13: exact deze velden mogen in het baken staan (docs/analytics.md, core/usage.ts).
const FEATURES = ['pinFeel', 'pinWind', 'hover', 'search', 'geo', 'fav', 'pin', 'play', 'scrub', 'history', 'fresh', 'about']
const REQUIRED = ['v', 'range', 'theme', 'coarse', 'width', 'dur']

// De preview-server schrijft elke ontvangen /hit-body als regel weg (vite.config.ts, playwright.config.ts).
// Serverkant tellen, want een baken van een sluitende tab ziet Playwrights routering niet meer.
function receivedBeacons(testInfo: TestInfo): () => Array<Record<string, unknown>> {
  const log = `tmp/hits-${new URL(testInfo.project.use.baseURL!).port}.jsonl`
  const read = () => {
    try {
      return readFileSync(log, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>)
    } catch {
      return []
    }
  }
  const before = read().length
  return () => read().slice(before)
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

test('the beacon waits for hidden visibility, is sent once and carries only whitelisted fields', async ({ page }, testInfo) => {
  const beacons = receivedBeacons(testInfo)
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
  expect(beacons()).toEqual([])
  expect(manifests.length).toBeGreaterThanOrEqual(1)
  expect(new URL(manifests[0]!).search).toBe('?s=1')
  for (const url of manifests.slice(1)) expect(new URL(url).search).toBe('')

  const setVisibility = (state: 'hidden' | 'visible') => page.evaluate((next) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => next })
    document.dispatchEvent(new Event('visibilitychange'))
  }, state)
  await setVisibility('hidden')
  await expect.poll(() => beacons().length).toBe(1)
  const body = beacons()[0]!
  expectWhitelisted(body)
  expect(body).toMatchObject({ v: 1, about: true, range: '24', theme: 'light', dur: '<1' })
  const mobile = testInfo.project.name !== 'desktop'
  expect(body.coarse).toBe(mobile)
  expect(body.width).toBe(mobile ? '<430' : '>=960')

  // Terug naar zichtbaar en weer weg, daarna sluiten: geen tweede sessie.
  await setVisibility('visible')
  await setVisibility('hidden')
  await page.close({ runBeforeUnload: true })
  await new Promise((resolve) => setTimeout(resolve, 500))
  expect(beacons()).toHaveLength(1)
})

test('closing the tab sends the beacon', async ({ page }, testInfo) => {
  const beacons = receivedBeacons(testInfo)
  await openApp(page)
  expect(beacons()).toEqual([])
  await page.close({ runBeforeUnload: true })
  await expect.poll(() => beacons().length).toBe(1)
  expectWhitelisted(beacons()[0]!)
})

test('dragging the pin and double-clicking it both count as pin use', async ({ page }, testInfo) => {
  test.skip(testInfo.project.use.hasTouch === true, 'muis; slepen en dubbeltik van de U26-pin')
  const beacons = receivedBeacons(testInfo)
  const pinTip = async () => {
    const box = (await page.locator('.location-pin svg').boundingBox())!
    return { x: box.x + box.width / 2, y: box.y + box.height }
  }
  const hide = () => page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })

  await openApp(page)
  await expect(page.locator('.location-pin')).toHaveCount(1)
  const tip = await pinTip(page)
  await page.mouse.move(tip.x, tip.y - 20)
  await page.mouse.down()
  await page.mouse.move(tip.x - 120, tip.y + 40, { steps: 10 })
  await page.mouse.up()
  await expect(page.locator('.location-pin.dragging')).toHaveCount(0)
  await hide()
  await expect.poll(() => beacons().length).toBe(1)
  expect(beacons()[0]).toMatchObject({ pin: true })
  expect(beacons()[0]).not.toHaveProperty('scrub')

  await openApp(page)
  await expect(page.locator('.location-pin')).toHaveCount(1)
  await page.waitForTimeout(300)
  const again = await pinTip(page)
  await page.mouse.dblclick(again.x, again.y - 20)
  await hide()
  await expect.poll(() => beacons().length).toBe(2)
  expect(beacons()[1]).toMatchObject({ pin: true })
})
