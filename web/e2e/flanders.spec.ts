import { expect, test } from '@playwright/test'
import { placesUrl } from '../src/core/places-asset'

// De plaatsencatalogus komt vóór de geocoders (U73): Gent krijgt het catalogusmiddelpunt.
const gent = { lng: 3.725, lat: 51.054 }

test('searching "Gent" offers the Belgian city and puts the pin there', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'gedrag, geen performance: één profiel volstaat')
  // Beide geocoders gemockt: e2e mag niet van externe diensten afhangen.
  await page.route('https://api.pdok.nl/**', (route) => route.fulfill({ json: { response: { docs: [
    { id: 'wpl-sas', weergavenaam: 'Sas van Gent, Terneuzen, Zeeland', type: 'woonplaats' },
  ] } } }))
  await page.route('https://geo.api.vlaanderen.be/**', (route) => route.fulfill({ json: { LocationResult: [
    { ID: 188, FormattedAddress: 'Gent', LocationType: 'basisregisters_gemeente', Location: { Lat_WGS84: 51.07443065791977, Lon_WGS84: 3.7254525688821025 } },
    { ID: 1, FormattedAddress: 'Gentbruggeplein, Gent', LocationType: 'basisregisters_straat', Location: { Lat_WGS84: 51.045, Lon_WGS84: 3.759 } },
  ] } }))
  const scrubber = page.locator('.scrubber')
  await page.goto('/')
  await expect(scrubber).toHaveAttribute('aria-label', /voor De Bilt$/)
  // De catalogus laadt pas na de start; een eerdere zoekopdracht krijgt alleen de geocoders.
  await expect.poll(() => page.evaluate((url) => performance.getEntriesByName(new URL(url, location.href).href).length, placesUrl)).toBeGreaterThan(0)

  const input = page.getByRole('textbox', { name: 'Zoek plaats' })
  await input.click()
  await input.fill('Gent')
  const options = page.locator('#location-results [id^="location-"]')
  // Catalogus (exact, dan prefix) en daarna de geocoders, zonder de dubbele Vlaamse "Gent".
  await expect(options).toHaveCount(4)
  await expect(options.nth(0)).toHaveText(/^Gent\s*BE$/)
  await expect(options.nth(1)).toHaveText(/^Gentbrugge\s*BE$/)
  await expect(options.nth(2)).toHaveText(/^Gentinnes\s*BE$/)
  await expect(options.nth(3)).toHaveText(/Sas van Gent\s*Terneuzen · Zeeland/)
  await options.nth(0).click()

  await expect(scrubber).toHaveAttribute('aria-label', /voor Gent$/)
  await expect(input).toHaveValue('Gent')
  await expect(page).toHaveURL(/\/weer\/gent$/)
  const remembered = await page.evaluate(() => JSON.parse(localStorage.getItem('motregen-last-location') ?? 'null'))
  expect(remembered.lng).toBe(gent.lng)
  expect(remembered.lat).toBe(gent.lat)
  expect(remembered.place.zones.some((zone: { slug: string }) => zone.slug === 'gent')).toBe(true)
  // De pin staat op Gent: marker-punt (onderkant midden) tegen de projectie van de kaart zelf.
  await page.waitForTimeout(800)
  const map = (await page.locator('.map').boundingBox())!
  const marker = (await page.locator('.maplibregl-marker').first().boundingBox())!
  const projected = (await page.evaluate(([lng, lat]) => (window as unknown as { __motregenProject: (lng: number, lat: number) => { x: number; y: number } }).__motregenProject(lng, lat), [gent.lng, gent.lat]))!
  expect(Math.abs(marker.x + marker.width / 2 - (map.x + projected.x))).toBeLessThan(3)
  // De standaard MapLibre-pin heeft ~7 px lege ruimte onder de punt in zijn SVG-box; de punt zelf zit op het punt.
  expect(Math.abs(marker.y + marker.height - (map.y + projected.y))).toBeLessThan(10)
})
