import { expect, test, type Page } from '@playwright/test'

import { PROVINCE_STEPS, provincePlaces } from '../src/core/map-places'

// U114 (MIP-43, PO 2026-11-10): in de plekkenorde staat een plek altijd op dezelfde plek. De pin duwt en verbergt
// geen plek (ook het dev-paneel niet), en inzoomen voegt alleen toe, ook door de provincietrede heen.
const D = 'dev&plekken=orde&namen=samen'

interface Camera { lng: number; lat: number; zoom: number }

async function open(page: Page, mode: 'gevoel' | 'wind', { path = '', query = '', devPanel = false } = {}): Promise<void> {
  await page.goto(`/${mode}${path}?${D}${query}`)
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  if (!devPanel) await page.addStyleTag({ content: '.dev-panel { display: none !important; }' })
}

async function jump(page: Page, lng: number, lat: number, zoom: number): Promise<void> {
  await page.evaluate(([lng, lat, zoom]) => (window as unknown as { __motregenJumpTo: (lng: number, lat: number, zoom: number) => void }).__motregenJumpTo(lng!, lat!, zoom!), [lng, lat, zoom])
  await page.mouse.move(5, 5)
}

const camera = (page: Page) => page.evaluate(() => {
  const { lng, lat, zoom } = (window as unknown as { __motregenCamera: () => Camera }).__motregenCamera()
  return { lng, lat, zoom }
})

/** Getallen in Gevoel: naam (met waarde) en middelpunt op het scherm, afgerond op hele px. */
async function numbers(page: Page): Promise<string[]> {
  return page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.temperature-number'), (element) => {
    const box = element.getBoundingClientRect()
    return `${element.querySelector('.temperature-number-name')?.textContent}@${Math.round(box.left + box.width / 2)},${Math.round(box.top + box.height / 2)}`
  }).sort())
}

/** Wacht tot twee lezingen na elkaar gelijk zijn (indeling en fade klaar). */
async function settled<T>(read: () => Promise<T>): Promise<T> {
  let previous = JSON.stringify(await read())
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 600))
    const next = await read()
    if (JSON.stringify(next) === previous) return next
    previous = JSON.stringify(next)
  }
  throw new Error('indeling kwam niet tot rust')
}

test('plekkenorde: de pin verplaatsen verandert de getallen en zakken niet; inzoomen voegt alleen toe', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'één profiel volstaat')
  await open(page, 'gevoel')
  // Voorbij de provincietrede (landing ≈ overzicht + 1,5): hier wisselen geen provincienamen meer.
  await jump(page, 5.3, 52.0, 9.2)
  await expect.poll(async () => (await numbers(page)).length, { timeout: 30_000 }).toBeGreaterThan(5)
  const before = await settled(() => numbers(page))
  const view = await camera(page)

  // Pin precies op een plek (het eerste getal) en daarna ergens anders.
  const target = await page.locator('.temperature-number').first().boundingBox()
  await page.mouse.click(target!.x + target!.width / 2, target!.y + target!.height / 2)
  expect(await camera(page)).toEqual(view)
  expect(await settled(() => numbers(page))).toEqual(before)
  const shell = await page.locator('.map-shell').boundingBox()
  await page.mouse.click(shell!.x + shell!.width * 0.6, shell!.y + shell!.height * 0.55)
  expect(await settled(() => numbers(page))).toEqual(before)

  // Inzoomen om het midden: wat er stond en nog in beeld ligt, blijft staan.
  const names = (list: string[]) => new Set(list.map((entry) => entry.split('@')[0]))
  await jump(page, view.lng, view.lat, view.zoom + 0.5)
  const after = names(await settled(() => numbers(page)))
  const map = await page.locator('.maplibregl-map').boundingBox()
  for (const entry of before) {
    const [name, at] = entry.split('@')
    const [x, y] = at!.split(',').map(Number)
    const centreX = map!.x + map!.width / 2, centreY = map!.y + map!.height / 2
    const nextX = (x! - centreX) * 2 ** 0.5 + centreX, nextY = (y! - centreY) * 2 ** 0.5 + centreY
    // Onder de klok (bovenrand, 47 px) of tegen de rand telt als buiten beeld.
    if (nextX < map!.x + 40 || nextY < map!.y + 70 || nextX > map!.x + map!.width - 40 || nextY > map!.y + map!.height - 40) continue
    expect(after.has(name!), `${name} na inzoomen`).toBe(true)
  }

  await open(page, 'wind')
  await jump(page, 5.3, 52.0, 9.2)
  const socks = () => page.locator('.map-overlay-windsocks').evaluate((canvas) => (canvas as HTMLElement).dataset.placed ?? '')
  await expect.poll(socks, { timeout: 30_000 }).not.toBe('')
  const placed = await settled(socks)
  await page.mouse.click(shell!.x + shell!.width * 0.4, shell!.y + shell!.height * 0.45)
  expect(await settled(socks)).toBe(placed)
})

test('provincietrede in Wind: geen provincieplek valt weg terwijl zijn anker in beeld ligt, ook met open dev-paneel en de pin erbij', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'één profiel volstaat')
  test.setTimeout(180_000)
  for (const pin of ['/hoorn', '/middelburg']) {
    await open(page, 'wind', { path: pin, query: '&windtrede=provincies', devPanel: true })
    await expect(page.locator('.dev-panel')).toBeVisible()
    await jump(page, 4.75, 51.95, 0)
    await page.waitForTimeout(1_500)
    const overviewZoom = (await camera(page)).zoom
    const map = (await page.locator('.maplibregl-map').boundingBox())!
    for (let steps = 0; steps < PROVINCE_STEPS.cities; steps += 0.05) {
      const zoom = overviewZoom + steps
      await jump(page, 4.75, 51.95, zoom)
      const expected: string[] = []
      for (const place of provincePlaces({ zoom, overviewZoom })!) {
        const at = await page.evaluate(([lng, lat]) => (window as unknown as { __motregenProject: (lng: number, lat: number) => { x: number; y: number } }).__motregenProject(lng!, lat!), [place.lng, place.lat])
        // Ruim binnen beeld en niet onder klok, zoekknop of legenda.
        if (at.x > 60 && at.y > 60 && at.x < map.width - 60 && at.y < map.height - 40) expected.push(place.name)
      }
      await expect.poll(async () => {
        const placed = new Set(((await page.locator('.map-overlay-windsocks').evaluate((canvas) => (canvas as HTMLElement).dataset.placed)) ?? '').split('|'))
        return expected.filter((name) => !placed.has(name))
      }, { message: `pin ${pin}, +${steps.toFixed(2)}`, timeout: 5_000 }).toEqual([])
    }
  }
})
