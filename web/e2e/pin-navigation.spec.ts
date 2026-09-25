import { expect, test, type CDPSession, type Page } from '@playwright/test'

interface Camera {
  lng: number
  lat: number
  zoom: number
  bearing: number
  pitch: number
  location: { lng: number; lat: number }
}

const zoomedView = { lng: 5.18, lat: 52.1, zoom: 9 }

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-fast-3g', 'gedrag: desktop en één mobiel profiel')
})

test('desktop: dragging the pin moves the location, the map only follows at the edge, a double click centres', async ({ page }, testInfo) => {
  test.skip(testInfo.project.use.hasTouch === true, 'muis')
  const centre = await openZoomed(page)
  const map = (await page.locator('.map').boundingBox())!
  const before = await camera(page)

  // Midden in beeld slepen: locatie volgt, kaart staat stil.
  let tip = await pinTip(page)
  await page.mouse.move(tip.x, tip.y - 20)
  await page.mouse.down()
  await page.mouse.move(tip.x - 160, tip.y - 20 + 70, { steps: 12 })
  await expect(page.locator('.location-pin.dragging')).toHaveCount(1)
  await page.mouse.up()
  await expect(page.locator('.location-pin.dragging')).toHaveCount(0)
  await expectLocationMoved(page, before.location)
  const moved = await settledPinTip(page)
  expect(moved.x).toBeCloseTo(tip.x - 160, -1)
  expect(moved.y).toBeCloseTo(tip.y + 70, -1)
  expectSameCenter(await camera(page), before)

  // Dubbelklik op de pin: kaart centreert op de pin.
  await page.mouse.dblclick(moved.x, moved.y - 20)
  await expectPinAt(page, centre)
  const centred = await camera(page)

  // Tegen de rechterrand aan houden: de kaart pant oostwaarts mee, de pin blijft onder de muis.
  tip = await pinTip(page)
  await page.mouse.move(tip.x, tip.y - 20)
  await page.mouse.down()
  await page.mouse.move(map.x + map.width - 12, tip.y - 20, { steps: 10 })
  await page.waitForTimeout(700)
  await page.mouse.up()
  const panned = await camera(page)
  expect(panned.lng).toBeGreaterThan(centred.lng + 0.05)
  expect(Math.abs(panned.lat - centred.lat)).toBeLessThan(0.02)
  expect((await settledPinTip(page)).x).toBeCloseTo(map.x + map.width - 12, -1)
  await expectLocationMoved(page, centred.location)

  // Een tik op de kaart zet de pin er nog steeds heen.
  await page.mouse.click(map.x + map.width * 0.35, map.y + map.height * 0.6)
  await expect.poll(async () => Math.abs((await pinTip(page)).x - (map.x + map.width * 0.35))).toBeLessThan(2)
})

test('desktop: rotate and tilt gestures leave bearing and pitch at 0', async ({ page }, testInfo) => {
  test.skip(testInfo.project.use.hasTouch === true, 'muis en toetsenbord')
  await openZoomed(page)
  const map = (await page.locator('.map').boundingBox())!
  const x = map.x + map.width * 0.3
  const y = map.y + map.height * 0.4
  // Rechtsslepen (rotatie + tilt) en ctrl-slepen.
  await page.mouse.move(x, y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(x + 150, y - 120, { steps: 10 })
  await page.mouse.up({ button: 'right' })
  await page.keyboard.down('Control')
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 150, y - 120, { steps: 10 })
  await page.mouse.up()
  await page.keyboard.up('Control')
  // Toetsenbord: shift+pijlen roteren/tilten in MapLibre.
  await page.locator('.maplibregl-canvas').focus()
  for (const key of ['Shift+ArrowLeft', 'Shift+ArrowRight', 'Shift+ArrowUp', 'Shift+ArrowUp']) await page.keyboard.press(key)
  await page.waitForTimeout(600)
  const view = await camera(page)
  expect(view.bearing).toBe(0)
  expect(view.pitch).toBe(0)
})

test('touch: one finger scrolls past the map, two fingers pinch and pan, the pin drags', async ({ page }, testInfo) => {
  test.skip(testInfo.project.use.hasTouch !== true, 'Pixel 5')
  const centre = await openZoomed(page)
  const touch = await page.context().newCDPSession(page)
  const map = (await page.locator('.map').boundingBox())!
  const x = map.x + map.width * 0.3
  const y = map.y + map.height * 0.55
  const before = await camera(page)

  // Eén vinger op de kaart: geen pan (de pagina mag scrollen), geen locatiekeuze.
  await swipe(touch, [{ x, y }], [{ x: x + 140, y: y - 20 }])
  await page.waitForTimeout(400)
  const swiped = await camera(page)
  expectSameCenter(swiped, before)
  expect(swiped.location).toEqual(before.location)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(200)

  // Pin met de vinger slepen (vanaf het midden, weg van de randmarges): nieuwe locatie, kaart staat stil.
  const tip = await pinTip(page)
  await swipe(touch, [{ x: tip.x, y: tip.y - 18 }], [{ x: tip.x - 70, y: tip.y - 18 + 40 }])
  await expectLocationMoved(page, before.location)
  expectSameCenter(await camera(page), before)
  const dropped = await settledPinTip(page)
  expect(dropped.x).toBeCloseTo(tip.x - 70, -1)
  expect(dropped.y).toBeCloseTo(tip.y + 40, -1)

  // Dubbeltik op de pin centreert.
  for (let tap = 0; tap < 2; tap++) await swipe(touch, [{ x: dropped.x, y: dropped.y - 18 }], [{ x: dropped.x, y: dropped.y - 18 }], 1)
  await expectPinAt(page, centre)
  const centred = await camera(page)

  // Pinch uit elkaar: zoomt in; draaiende vingers roteren niet.
  const cx = map.x + map.width / 2
  const cy = map.y + map.height * 0.55
  await swipe(touch, [{ x: cx - 40, y: cy }, { x: cx + 40, y: cy }], [{ x: cx - 110, y: cy - 30 }, { x: cx + 110, y: cy + 30 }])
  await page.waitForTimeout(400)
  const pinched = await camera(page)
  expect(pinched.zoom).toBeGreaterThan(centred.zoom + 0.5)
  expect(pinched.bearing).toBe(0)
  expect(pinched.pitch).toBe(0)

  // Twee vingers samen omhoog (MapLibre's tilt-gebaar) of opzij: pant, tilt niet.
  await swipe(touch, [{ x: cx - 50, y: cy + 40 }, { x: cx + 50, y: cy + 40 }], [{ x: cx - 50 + 90, y: cy - 20 }, { x: cx + 50 + 90, y: cy - 20 }])
  await page.waitForTimeout(400)
  const panned = await camera(page)
  expect(Math.abs(panned.lng - pinched.lng) + Math.abs(panned.lat - pinched.lat)).toBeGreaterThan(0.005)
  expect(panned.bearing).toBe(0)
  expect(panned.pitch).toBe(0)
})

test('with geolocation already granted the current position is the start location, without a prompt', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'gedrag: één profiel volstaat')
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ longitude: 6.5665, latitude: 53.2194 })
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('motregen-map-view', JSON.stringify({ lng: 5.18, lat: 52.1, zoom: 10 })))
  await page.reload()
  await expect(page.locator('.scrubber')).toHaveAttribute('aria-label', /voor Mijn locatie$/)
  // Groningen valt buiten de ingezoomde view rond De Bilt: de kaart gaat mee naar de pin.
  const map = (await page.locator('.map').boundingBox())!
  await expect.poll(async () => Math.abs((await pinTip(page)).x - (map.x + map.width / 2))).toBeLessThan(3)
})

// Start op een ingezoomde view: de pin staat dan op het kaartmidden. Geeft dat midden terug in
// pin-svg-coördinaten (de svg-onderkant ligt niet exact op het anker), voor centreer-checks.
async function openZoomed(page: Page): Promise<{ x: number; y: number }> {
  await page.goto('/')
  await page.evaluate((view) => localStorage.setItem('motregen-map-view', JSON.stringify(view)), zoomedView)
  await page.reload()
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  await expect(page.locator('.location-pin')).toHaveCount(1)
  await page.waitForTimeout(300)
  return pinTip(page)
}

// Na loslaten zakt de pin in 120 ms terug uit zijn sleep-lift.
async function settledPinTip(page: Page): Promise<{ x: number; y: number }> {
  await expect(page.locator('.location-pin.dragging')).toHaveCount(0)
  await page.waitForTimeout(250)
  return pinTip(page)
}

async function expectPinAt(page: Page, target: { x: number; y: number }): Promise<void> {
  await expect.poll(async () => {
    const tip = await pinTip(page)
    return Math.max(Math.abs(tip.x - target.x), Math.abs(tip.y - target.y))
  }).toBeLessThan(2)
}

async function camera(page: Page): Promise<Camera> {
  return page.evaluate(() => (window as unknown as { __motregenCamera: () => Camera }).__motregenCamera())
}

// Punt van de pin (anker onderaan midden), in paginacoördinaten.
async function pinTip(page: Page): Promise<{ x: number; y: number }> {
  const box = (await page.locator('.location-pin svg').boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height }
}

async function expectLocationMoved(page: Page, from: { lng: number; lat: number }): Promise<void> {
  await expect.poll(async () => {
    const { location } = await camera(page)
    return Math.hypot(location.lng - from.lng, location.lat - from.lat)
  }).toBeGreaterThan(0.01)
}

function expectSameCenter(actual: Camera, expected: Camera): void {
  expect(Math.abs(actual.lng - expected.lng)).toBeLessThan(1e-6)
  expect(Math.abs(actual.lat - expected.lat)).toBeLessThan(1e-6)
}

async function swipe(cdp: CDPSession, from: Array<{ x: number; y: number }>, to: Array<{ x: number; y: number }>, steps = 12): Promise<void> {
  const at = (t: number) => from.map((start, index) => ({
    x: start.x + (to[index]!.x - start.x) * t,
    y: start.y + (to[index]!.y - start.y) * t,
    id: index,
  }))
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) })
  for (let step = 1; step <= steps; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(step / steps) })
    await new Promise((resolve) => setTimeout(resolve, 16))
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
