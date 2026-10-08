import { expect, test, type Page } from '@playwright/test'
import { pausePlayback } from './playback'

// U62: de hemel achter de scrubber hoort bij de tijdas, niet bij de cursor. Op een krap apparaat volgde
// de straling die de hemel voedt de tabelrijen bij de cursor, waardoor dezelfde uurstop na een sleep een
// andere donkerte kreeg.

interface SkyReading {
  trackOffsetPx: number
  hourTickXs: number[]
  stops: Array<{ x: number; dark: number; day: number }>
  sunTurnXs: number[]
}

async function readSky(page: Page): Promise<SkyReading> {
  return page.evaluate(() => {
    const track = document.querySelector<HTMLElement>('.chart-track')!
    const gradient = document.querySelector<SVGLinearGradientElement>('.sky-gradient')!
    const gradientWidth = Number(gradient.getAttribute('x2'))
    const trackLeft = track.getBoundingClientRect().left
    return {
      trackOffsetPx: new DOMMatrix(getComputedStyle(track).transform).m41,
      hourTickXs: [...track.querySelectorAll<HTMLElement>('.hour-grid i')].map((tick) => parseFloat(tick.style.left)),
      stops: [...gradient.querySelectorAll<SVGStopElement>('stop')].map((stop) => ({
        x: Number(stop.getAttribute('offset')) * gradientWidth,
        dark: Number(stop.style.getPropertyValue('--dark')),
        day: Number(stop.style.getPropertyValue('--day')),
      })),
      sunTurnXs: [...track.querySelectorAll<SVGGElement>('.dusk')].map((glow) => {
        const bounds = glow.getBoundingClientRect()
        // Schermcoördinaten dragen subpixelruis van de baan-transform mee.
        return Math.round((bounds.left + bounds.width / 2 - trackLeft) * 10) / 10
      }),
    }
  })
}

/** Wacht tot de hemel niet meer verandert: de reeksen die hem voeden komen per frame binnen. */
async function settledSky(page: Page): Promise<SkyReading> {
  let previous = await readSky(page)
  await expect.poll(async () => {
    await page.waitForTimeout(700)
    const current = await readSky(page)
    const same = JSON.stringify(current) === JSON.stringify(previous)
    previous = current
    return same
  }, { timeout: 30_000, intervals: [0] }).toBe(true)
  return previous
}

/** De as-x waar het daglicht in het verloop door de helft gaat (zon op de horizon). */
function daylightHalfwayXs(stops: SkyReading['stops']): number[] {
  const crossings: number[] = []
  for (let index = 1; index < stops.length; index++) {
    const from = stops[index - 1]!
    const to = stops[index]!
    if ((from.day - 0.5) * (to.day - 0.5) < 0) crossings.push(from.x + (to.x - from.x) * (0.5 - from.day) / (to.day - from.day))
  }
  return crossings
}

async function dragScrubber(page: Page, deltaX: number, touch: boolean): Promise<void> {
  const box = (await page.locator('.scrub-surface').boundingBox())!
  const y = box.y + box.height / 2
  const startX = box.x + box.width / 2
  const steps = 12
  if (touch) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y }] })
    for (let step = 1; step <= steps; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: startX + deltaX * step / steps, y }] })
      await page.waitForTimeout(30)
    }
    // Stilhouden vóór het loslaten: zonder snelheid volgt er geen fling.
    await page.waitForTimeout(200)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    return
  }
  await page.mouse.move(startX, y)
  await page.mouse.down()
  for (let step = 1; step <= steps; step++) {
    await page.mouse.move(startX + deltaX * step / steps, y)
    await page.waitForTimeout(30)
  }
  await page.waitForTimeout(200)
  await page.mouse.up()
}

test('the sky behind the scrubber stays tied to the time axis when the cursor is dragged', async ({ page, hasTouch }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // Een plek onder het front van de synthetische dag: daar wijkt de wolkenlaagschatting af van de
  // straling, zodat een uurstop die van bron wisselt ook van donkerte wisselt.
  await page.goto('/?lat=52.1&lon=3.7')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  await expect(page.getByTestId('sky')).toBeAttached()
  await pausePlayback(page)
  const before = await settledSky(page)
  await page.locator('.scrubber').screenshot({ path: testInfo.outputPath('u62-hemel-voor.png') })

  const plotWidth = (await page.locator('.chart-plot').boundingBox())!.width
  // Ruim twee uur verder: het venster van een krap apparaat schuift mee en de tabel toont andere uren.
  await dragScrubber(page, -plotWidth * 0.3, hasTouch)
  await pausePlayback(page)
  const after = await settledSky(page)
  await page.locator('.scrubber').screenshot({ path: testInfo.outputPath('u62-hemel-na.png') })

  expect(Math.abs(after.trackOffsetPx - before.trackOffsetPx), 'de baan is verschoven').toBeGreaterThan(plotWidth * 0.2)
  expect(after.hourTickXs).toEqual(before.hourTickXs)
  expect(after.sunTurnXs).toEqual(before.sunTurnXs)
  expect(after.sunTurnXs.length).toBeGreaterThan(0)

  // De zon op de horizon staat in het verloop op dezelfde as-x als de schemergloed; het verloop kent
  // alleen uurstops, dus binnen een half uur.
  const pxPerHour = before.hourTickXs[1]! - before.hourTickXs[0]!
  const halfway = daylightHalfwayXs(after.stops)
  for (const sunTurnX of after.sunTurnXs) {
    expect(Math.min(...halfway.map((x) => Math.abs(x - sunTurnX))), `zon op de horizon bij x=${sunTurnX.toFixed(1)}`).toBeLessThan(pxPerHour / 2)
  }

  // Dezelfde uurstop houdt dezelfde hemel, waar de cursor ook staat. Alleen wat vóór de sleep al in
  // beeld was telt: daarbuiten komen de reeksen nog binnen.
  const visibleBefore = (x: number) => x + before.trackOffsetPx >= 0 && x + before.trackOffsetPx <= plotWidth
  const afterByX = new Map(after.stops.map((stop) => [stop.x.toFixed(1), stop]))
  const compared = before.stops.filter((stop) => visibleBefore(stop.x))
  expect(compared.length).toBeGreaterThan(3)
  expect(compared.some((stop) => stop.dark > 0), 'de plek ligt onder bewolking').toBe(true)
  for (const stop of compared) expect(afterByX.get(stop.x.toFixed(1)), `uurstop op x=${stop.x.toFixed(1)}`).toEqual(stop)
})
