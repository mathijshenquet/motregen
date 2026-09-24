import { expect, test, type Page } from '@playwright/test'
import type { MapView } from '../src/core/location-memory'
import { containZoom, MAP_CONTAIN_BOUNDS, type Viewport } from '../src/core/map-constraint'

test('the map zooms out to contain the Netherlands and keeps it in view', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-fast-3g', 'gedrag, geen performance: desktop en één mobiel profiel volstaan')
  // Op telefoonbreedte is de zoomknop verborgen, maar zijn disabled-staat volgt minZoom nog steeds.
  const zoomOut = page.locator('.maplibregl-ctrl-zoom-out')

  await page.goto('/')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  const viewport = await mapViewport(page)
  await expect(zoomOut).toBeDisabled()

  await dragMap(page, viewport, -viewport.width, -viewport.height)
  const dragged = await storedView(page)
  expect(dragged.zoom).toBeCloseTo(containZoom(MAP_CONTAIN_BOUNDS, viewport), 1)
  expectBoundsInView(dragged, viewport)

  await page.evaluate(() => localStorage.setItem('motregen-map-view', JSON.stringify({ lng: -20, lat: 40, zoom: 3 })))
  await page.reload()
  await expect(zoomOut).toBeDisabled()
  await dragMap(page, viewport, 5, 5)
  expectBoundsInView(await storedView(page), viewport)

  await page.evaluate(() => localStorage.setItem('motregen-map-view', JSON.stringify({ lng: 5.12, lat: 52.09, zoom: 10 })))
  await page.reload()
  await expect(zoomOut).toBeEnabled()
  await page.evaluate(() => localStorage.removeItem('motregen-map-view'))
  await pointAtMap(page, viewport)
  for (let step = 0; step < 20; step++) {
    await page.mouse.wheel(0, 600)
    await page.waitForTimeout(50)
  }
  // Tussenliggende moveends (gethrottelde CPU) mogen eerst landen; het eindpunt is minZoom.
  await expect.poll(async () => (await storedView(page)).zoom).toBeCloseTo(containZoom(MAP_CONTAIN_BOUNDS, viewport), 1)
  expectBoundsInView(await storedView(page), viewport)
  await expect(zoomOut).toBeDisabled()
})

// Links boven het midden: het midden is de locatiemarker (De Bilt), en daarop start geen pan.
async function pointAtMap(page: Page, viewport: Viewport): Promise<{ x: number; y: number }> {
  const box = (await page.locator('.map').boundingBox())!
  const point = { x: box.x + viewport.width * 0.3, y: box.y + viewport.height * 0.35 }
  await page.mouse.move(point.x, point.y)
  return point
}

async function mapViewport(page: Page): Promise<Viewport> {
  // Op telefoonbreedte houdt de contain-fit Nederland onder de zoekbalk (data-inset-top).
  return page.locator('.map').evaluate((element: HTMLElement) => ({
    width: element.clientWidth,
    height: element.clientHeight,
    insets: { top: Number(element.dataset.insetTop ?? 0), right: 0, bottom: 0, left: 0 },
  }))
}

async function dragMap(page: Page, viewport: Viewport, dx: number, dy: number): Promise<void> {
  await page.evaluate(() => localStorage.removeItem('motregen-map-view'))
  const { x, y } = await pointAtMap(page, viewport)
  await page.mouse.down()
  // Binnen de viewport blijven: een mouseup buiten het venster komt in Playwright niet aan.
  const box = (await page.locator('.map').boundingBox())!
  const target = { x: clamp(x + dx, box.x + 5, box.x + viewport.width - 5), y: clamp(y + dy, box.y + 5, box.y + viewport.height - 5) }
  await page.mouse.move(target.x, target.y, { steps: 12 })
  await page.mouse.up()
}

async function storedView(page: Page): Promise<MapView> {
  await expect.poll(() => page.evaluate(() => localStorage.getItem('motregen-map-view'))).not.toBeNull()
  return JSON.parse((await page.evaluate(() => localStorage.getItem('motregen-map-view')))!) as MapView
}

function expectBoundsInView(view: MapView, viewport: Viewport): void {
  const worldSize = 512 * 2 ** view.zoom
  const x = (lng: number) => (lng - view.lng) / 360 * worldSize + viewport.width / 2
  const y = (lat: number) => (mercatorY(lat) - mercatorY(view.lat)) * worldSize + viewport.height / 2
  // Opgeslagen views zijn afgerond (5 decimalen, zoom 2), vandaar een paar pixels speling.
  const slack = 3
  expect(x(MAP_CONTAIN_BOUNDS.west)).toBeGreaterThanOrEqual(-slack)
  expect(x(MAP_CONTAIN_BOUNDS.east)).toBeLessThanOrEqual(viewport.width + slack)
  expect(y(MAP_CONTAIN_BOUNDS.north)).toBeGreaterThanOrEqual((viewport.insets?.top ?? 0) - slack)
  expect(y(MAP_CONTAIN_BOUNDS.south)).toBeLessThanOrEqual(viewport.height + slack)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function mercatorY(lat: number): number {
  const phi = lat * Math.PI / 180
  return (1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2
}
