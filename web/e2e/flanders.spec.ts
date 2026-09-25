import { expect, test } from '@playwright/test'
import type { MapView } from '../src/core/location-memory'

const gent = { lng: 3.7254525688821025, lat: 51.07443065791977 }

test('searching "Gent" offers the Belgian city and puts the pin there', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'gedrag, geen performance: één profiel volstaat')
  // Beide geocoders gemockt: e2e mag niet van externe diensten afhangen.
  await page.route('https://api.pdok.nl/**', (route) => route.fulfill({ json: { response: { docs: [
    { id: 'wpl-sas', weergavenaam: 'Sas van Gent, Terneuzen, Zeeland', type: 'woonplaats' },
  ] } } }))
  await page.route('https://geo.api.vlaanderen.be/**', (route) => route.fulfill({ json: { LocationResult: [
    { ID: 188, FormattedAddress: 'Gent', LocationType: 'basisregisters_gemeente', Location: { Lat_WGS84: gent.lat, Lon_WGS84: gent.lng } },
    { ID: 1, FormattedAddress: 'Gentbruggeplein, Gent', LocationType: 'basisregisters_straat', Location: { Lat_WGS84: 51.045, Lon_WGS84: 3.759 } },
  ] } }))
  const scrubber = page.locator('.scrubber')
  await page.goto('/')
  await expect(scrubber).toHaveAttribute('aria-label', /voor De Bilt$/)

  const input = page.getByRole('textbox', { name: 'Zoek plaats' })
  await input.click()
  await input.fill('Gent')
  const options = page.locator('#location-results [id^="location-"]')
  await expect(options).toHaveCount(2)
  await expect(options.nth(0)).toHaveText(/^Gent\s*BE$/)
  await expect(options.nth(1)).toHaveText(/Sas van Gent\s*Terneuzen · Zeeland/)
  await options.nth(0).click()

  await expect(scrubber).toHaveAttribute('aria-label', /voor Gent$/)
  await expect(input).toHaveValue('Gent')
  // De pin staat op Gent: marker-punt (onderkant midden) tegen de projectie van de opgeslagen kaartview.
  await page.waitForTimeout(800)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('motregen-map-view'))).not.toBeNull()
  const view = await page.evaluate(() => JSON.parse(localStorage.getItem('motregen-map-view')!) as MapView)
  const map = (await page.locator('.map').boundingBox())!
  const marker = (await page.locator('.maplibregl-marker').first().boundingBox())!
  const worldSize = 512 * 2 ** view.zoom
  const expected = {
    x: map.x + map.width / 2 + (gent.lng - view.lng) / 360 * worldSize,
    y: map.y + map.height / 2 + (mercatorY(gent.lat) - mercatorY(view.lat)) * worldSize,
  }
  // Opgeslagen views zijn afgerond (5 decimalen, zoom 2): een paar pixels speling.
  expect(Math.abs(marker.x + marker.width / 2 - expected.x)).toBeLessThan(6)
  expect(Math.abs(marker.y + marker.height - expected.y)).toBeLessThan(6)
})

function mercatorY(lat: number): number {
  const phi = lat * Math.PI / 180
  return (1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2
}
