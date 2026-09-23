import { expect, test, type Page } from '@playwright/test'
import type { MapView } from '../src/core/location-memory'
import { containZoom, MAP_CONTAIN_BOUNDS, type Viewport } from '../src/core/map-constraint'

const screenshotDir = '../.dev/tracks/u6-kaart-zoom'

test('the map zooms out to contain the Netherlands and keeps it in view', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-fast-3g', 'gedrag, geen performance: desktop en één mobiel profiel volstaan')
  const zoomOut = page.getByRole('button', { name: 'Zoom out' })

  await page.goto('/')
  await expect(zoomOut).toBeVisible()
  const viewport = await mapViewport(page)
  await expect(zoomOut).toBeDisabled()
  await page.waitForTimeout(1_500)
  await page.screenshot({ path: `${screenshotDir}/minzoom-${testInfo.project.name}.png` })

  await dragMap(page, viewport, -viewport.width, -viewport.height)
  const dragged = await storedView(page)
  expect(dragged.zoom).toBeCloseTo(containZoom(MAP_CONTAIN_BOUNDS, viewport), 1)
  expectBoundsInView(dragged, viewport)

  await page.evaluate(() => localStorage.setItem('motregen-map-view', JSON.stringify({ lng: -20, lat: 40, zoom: 3 })))
  await page.reload()
  await expect(zoomOut).toBeDisabled()
  await dragMap(page, viewport, 5, 5)
  expectBoundsInView(await storedView(page), viewport)
})

async function mapViewport(page: Page): Promise<Viewport> {
  return page.locator('.map').evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight }))
}

async function dragMap(page: Page, viewport: Viewport, dx: number, dy: number): Promise<void> {
  await page.evaluate(() => localStorage.removeItem('motregen-map-view'))
  const box = (await page.locator('.map').boundingBox())!
  const x = box.x + viewport.width / 2
  const y = box.y + viewport.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 12 })
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
  expect(y(MAP_CONTAIN_BOUNDS.north)).toBeGreaterThanOrEqual(-slack)
  expect(y(MAP_CONTAIN_BOUNDS.south)).toBeLessThanOrEqual(viewport.height + slack)
}

function mercatorY(lat: number): number {
  const phi = lat * Math.PI / 180
  return (1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2
}
