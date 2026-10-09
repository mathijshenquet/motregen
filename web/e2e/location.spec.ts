import { expect, test, type Locator, type Page } from '@playwright/test'
import { placesUrl } from '../src/core/places-asset'

test.use({ serviceWorkers: 'block' })

const home = { id: 'home', name: 'Thuis', sourceLabel: 'Groningen', lng: 6.5665, lat: 53.2194 }
const work = { id: 'work', name: 'Werk', sourceLabel: 'Maastricht', lng: 5.6909, lat: 50.8514 }

test('a dropped Amsterdam-Noord pin survives its city path, while Haarlem selects its centre', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('u65-initialized')) return
    localStorage.setItem('u65-initialized', 'yes')
    localStorage.setItem('motregen-map-view', JSON.stringify({ lng: 4.9, lat: 52.39, zoom: 9 }))
    localStorage.setItem('motregen-last-location', JSON.stringify({ lng: 4.9, lat: 52.372, label: 'Amsterdam' }))
  })
  await page.route('https://api.pdok.nl/**', () => { throw new Error('De volledige plaatsenlijst bevat deze plaats') })
  await page.route('https://geo.api.vlaanderen.be/**', () => { throw new Error('De volledige plaatsenlijst bevat deze plaats') })
  await page.goto('/weer/amsterdam')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  await expect.poll(() => page.evaluate((url) => performance.getEntriesByName(new URL(url, location.href).href).length, placesUrl)).toBeGreaterThan(0)
  const map = (await page.locator('.map').boundingBox())!
  const positions = await page.evaluate(() => {
    const project = (window as unknown as { __motregenProject: (lng: number, lat: number) => { x: number; y: number } }).__motregenProject
    return { start: project(4.9, 52.372), noord: project(4.92, 52.405) }
  })
  await page.mouse.move(map.x + positions.start.x, map.y + positions.start.y - 20)
  await page.mouse.down()
  await page.mouse.move(map.x + positions.noord.x, map.y + positions.noord.y - 20, { steps: 12 })
  await expect(page.locator('.location-pin.dragging')).toHaveCount(1)
  await page.mouse.up()
  await expect.poll(async () => (await pickedPoint(page)).lat).toBeCloseTo(52.405, 4)
  const dropped = await pickedPoint(page)
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('motregen-last-location') ?? 'null'))
  expect(stored.lng).toBe(dropped.lng)
  expect(stored.lat).toBe(dropped.lat)
  expect(stored.place.zones.some((zone: { slug: string }) => zone.slug === 'amsterdam')).toBe(true)

  // Houd de catalogus onafgemaakt: splash en zonebesluit moeten zonder de response klaar zijn.
  let pendingPlaces = 0
  await page.route(`**${placesUrl}`, () => { pendingPlaces++ })

  await page.goto('/weer/amsterdam')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  expect(await pickedPoint(page)).toEqual(dropped)
  await expect(page).toHaveURL(/\/weer\/amsterdam$/)
  await expect.poll(() => pendingPlaces).toBeGreaterThan(0)
  await page.reload()
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  expect(await pickedPoint(page)).toEqual(dropped)
  await expect(page).toHaveURL(/\/weer\/amsterdam$/)

  await page.goto('/weer/haarlem')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  const haarlem = await pickedPoint(page)
  expect(haarlem.lng).toBeCloseTo(4.64, 4)
  expect(haarlem.lat).toBeCloseTo(52.38, 4)
  await expect(page).toHaveURL(/\/weer\/haarlem$/)
  const remembered = await page.evaluate(() => JSON.parse(localStorage.getItem('motregen-last-location') ?? 'null'))
  expect(remembered).toMatchObject({ ...haarlem, label: 'Haarlem', place: { name: 'Haarlem', slug: 'haarlem' } })
})

test('an unlisted village reloads its exact pin from local zones while the catalogue is blocked', async ({ page }) => {
  const pin = { lng: 4.89321, lat: 52.08234 }
  await page.addInitScript((point) => {
    localStorage.setItem('motregen-last-location', JSON.stringify({
      ...point, label: 'Bij oma', place: { name: 'Woerden', slug: 'woerden', zones: [{ name: 'Woerden', slug: 'woerden' }] },
    }))
  }, pin)
  await page.route(`**${placesUrl}`, () => {})
  await page.route('https://api.pdok.nl/**', () => { throw new Error('De lokale zone heeft de plaatsnaam al') })
  await page.route('https://geo.api.vlaanderen.be/**', () => { throw new Error('De lokale zone heeft de plaatsnaam al') })
  await page.goto('/weer/woerden')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  expect(await pickedPoint(page)).toEqual(pin)
  await expect(page).toHaveURL(/\/weer\/woerden$/)
  await page.reload()
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  expect(await pickedPoint(page)).toEqual(pin)
  await expect(page).toHaveURL(/\/weer\/woerden$/)
})

async function pickedPoint(page: Page): Promise<{ lng: number; lat: number }> {
  return page.evaluate(() => (window as unknown as {
    __motregenCamera: () => { location: { lng: number; lat: number } }
  }).__motregenCamera().location)
}

test('start location remembers saved places and the last map view', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'gedrag, geen performance: één profiel volstaat')
  const scrubber = page.locator('.scrubber')

  await page.goto('/')
  await expect(scrubber).toHaveAttribute('aria-label', /voor De Bilt$/)

  await setStorage(page, {
    'motregen-saved-places': JSON.stringify([home, work]),
    'motregen-map-view': JSON.stringify({ lng: 6.57, lat: 53.21, zoom: 7 }),
  })
  await page.goto('/') // verse navigatie: de live permalink (?plaats=) hoort bij de vorige pagina, de onthouden plaats wint
  await expect(scrubber).toHaveAttribute('aria-label', /voor Groningen$/)

  const viewBefore = await page.evaluate(() => localStorage.getItem('motregen-map-view'))
  await page.getByRole('textbox', { name: 'Zoek plaats' }).focus()
  await page.getByRole('option', { name: /Werk/ }).click()
  await expect(scrubber).toHaveAttribute('aria-label', /voor Werk$/)
  await page.waitForTimeout(1_000)
  await expect(page).toHaveURL(/\/weer\/maastricht$/)
  expect(await page.evaluate(() => localStorage.getItem('motregen-map-view'))).toBe(viewBefore)

  await page.goto('/') // verse navigatie: de live permalink (?plaats=) hoort bij de vorige pagina, de onthouden plaats wint
  await expect(scrubber).toHaveAttribute('aria-label', /voor Werk$/)
  await expect(page).toHaveURL(/\/weer\/maastricht$/)
  await page.route('https://api.pdok.nl/**', () => { throw new Error('De eigen permalink mag niet langs de geocoder') })
  await page.route('https://geo.api.vlaanderen.be/**', () => { throw new Error('De eigen permalink mag niet langs de geocoder') })
  await page.reload()
  await expect(scrubber).toHaveAttribute('aria-label', /voor Werk$/)
  await expect(page).toHaveURL(/\/weer\/maastricht$/)

  await setStorage(page, { 'motregen-last-saved-place': 'removed', 'motregen-map-view': '{', 'motregen-last-location': '{' })
  await page.goto('/') // verse navigatie: de live permalink (?plaats=) hoort bij de vorige pagina, de onthouden plaats wint
  await expect(scrubber).toHaveAttribute('aria-label', /voor De Bilt$/)
})

test('an old query for a saved label normalizes without a geocoder or exposing the label', async ({ page }) => {
  await page.addInitScript((places) => localStorage.setItem('motregen-saved-places', JSON.stringify(places)), [home, work])
  await page.route('https://api.pdok.nl/**', () => { throw new Error('Een opgeslagen plaats heeft al coördinaten') })
  await page.route('https://geo.api.vlaanderen.be/**', () => { throw new Error('Een opgeslagen plaats heeft al coördinaten') })
  await page.goto('/?modus=wind&plaats=Thuis')
  await expect(page.locator('.scrubber')).toHaveAttribute('aria-label', /voor Thuis$/)
  await expect(page).toHaveURL(/\/wind\/groningen$/)
})

test('removing a favorite asks inline and keeps the list open', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-fast-3g', 'gedrag: desktop en één mobiel profiel')
  // Echte klik/tik: Chromium meldt de focus van de verdwijnende prullenbak synchroon af (U17).
  const press = (locator: Locator) => testInfo.project.use.hasTouch ? locator.tap() : locator.click()
  await page.goto('/')
  await setStorage(page, { 'motregen-saved-places': JSON.stringify([home, work]) })
  await page.reload()
  await press(page.getByRole('textbox', { name: 'Zoek plaats' }))
  const trash = page.getByRole('button', { name: 'Werk verwijderen uit opgeslagen plaatsen' })

  await press(trash)
  const confirm = page.getByRole('group', { name: 'Werk verwijderen?' })
  await expect(confirm).toBeVisible()
  await page.waitForTimeout(300)
  await expect(confirm).toBeVisible()
  await press(confirm.getByRole('button', { name: 'Nee' }))
  await expect(trash).toBeFocused()
  await expect(page.getByRole('option', { name: /Werk/ })).toBeVisible()

  await press(trash)
  await press(confirm.getByRole('button', { name: 'Ja' }))
  await expect(page.getByRole('option', { name: /Werk/ })).toHaveCount(0)
  await expect(page.getByRole('option', { name: /Thuis/ })).toBeVisible()
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('motregen-saved-places') ?? '[]')).map((place: { id: string }) => place.id)).toEqual(['home'])
})

test('a click on the about backdrop closes it without touching the map', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-fast-3g', 'gedrag: desktop en één mobiel profiel')
  const scrubber = page.locator('.scrubber')
  await page.goto('/')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  await expect(scrubber).toHaveAttribute('aria-label', /voor De Bilt$/)
  await page.getByRole('button', { name: 'Over motregen en instellingen' }).press('Enter')
  const dialog = page.getByRole('dialog', { name: 'motregen.nl' })
  await expect(dialog).toBeVisible()
  const map = (await page.locator('.map').boundingBox())!
  const body = (await dialog.boundingBox())!
  const x = map.x + map.width * 0.3
  const y = body.y > map.y + 60 ? (map.y + body.y) / 2 : body.y + body.height + 20
  if (testInfo.project.use.hasTouch) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
  await expect(dialog).toBeHidden()
  await page.waitForTimeout(600)
  await expect(scrubber).toHaveAttribute('aria-label', /voor De Bilt$/)
})

test('the search panel is one element; a tap outside closes it without touching the map', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-fast-3g', 'gedrag: desktop en één mobiel profiel')
  const scrubber = page.locator('.scrubber')
  await page.goto('/')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  await expect(scrubber).toHaveAttribute('aria-label', /voor De Bilt$/)
  await page.waitForTimeout(600)
  const viewBefore = await page.evaluate(() => localStorage.getItem('motregen-map-view'))
  const markerBefore = await page.locator('.maplibregl-marker').first().boundingBox()

  // In rust een ronde zoekknop van 44 px, gelijk aan de merkdruppel (U34, PO 2026-09-25 live): 16 px
  // tekst (iOS-zoom) en een icoon van 20 px, op elk apparaat.
  const box = page.locator('.search-box')
  const rest = (await box.boundingBox())!
  expect(rest.width).toBeLessThanOrEqual(125)
  // 16 px op elk apparaat sinds U34 (2026-09-25): voorkomt de iOS-zoom bij focus en houdt het veld gelijk aan de pil.
  await expect(page.locator('.search-field')).toHaveCSS('font-size', '16px')
  await expect(page.getByRole('button', { name: 'Deze plaats opslaan' })).toHaveCount(0)
  // 44 px op elk apparaat sinds U34 (2026-09-25): gelijk aan de merkdruppel rechtsboven.
  expect(rest.height).toBeGreaterThanOrEqual(42)
  expect(rest.height).toBeLessThanOrEqual(46)
  // Icoon 20 px sinds U34 (2026-09-25), gelijk met de 44 px-pil.
  expect((await page.locator('.search-icon').boundingBox())!.width).toBe(20)

  const input = page.getByRole('textbox', { name: 'Zoek plaats' })
  if (testInfo.project.use.hasTouch) await input.tap()
  else await input.click()
  const list = page.getByRole('listbox')
  await expect(list).toBeVisible()
  // De ster staat in het open paneel, naast het veld.
  await expect(page.getByRole('button', { name: 'Deze plaats opslaan' })).toBeVisible()
  // Veld en lijst in één paneel: de lijst sluit zonder gat aan op het veld.
  // Pas na de open-morph (180 ms): tot die tijd groeit de pil nog.
  await expect.poll(async () => {
    const field = (await input.boundingBox())!
    const listBox = (await list.boundingBox())!
    return Math.abs(listBox.y - (field.y + field.height))
  }).toBeLessThanOrEqual(2)
  await expect(list).toHaveCSS('opacity', '1')
  await page.screenshot({ path: testInfo.outputPath(`${testInfo.project.name}-zoekpaneel.png`) })

  // Tik/klik midden op de kaart: sluit het paneel, geen locatiekeuze, geen pan.
  const map = (await page.locator('.map').boundingBox())!
  const x = map.x + map.width * 0.6
  const y = map.y + map.height * 0.6
  if (testInfo.project.use.hasTouch) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
  await expect(list).toBeHidden()
  await page.waitForTimeout(600)
  await expect(scrubber).toHaveAttribute('aria-label', /voor De Bilt$/)
  expect(await page.evaluate(() => localStorage.getItem('motregen-map-view'))).toBe(viewBefore)
  expect(await page.locator('.maplibregl-marker').first().boundingBox()).toEqual(markerBefore)

  // Escape sluit ook; × wist eerst de tekst, daarna sluit hij.
  await input.focus()
  await expect(list).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(list).toBeHidden()
  await input.focus()
  // Openen begint met een leeg veld (U34, PO 2026-09-25): dan heet de × "Zoeken sluiten". Pas met tekst
  // erin wordt hij "Zoektekst wissen".
  await expect(input).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Zoeken sluiten' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Zoektekst wissen' })).toHaveCount(0)
  await input.fill('Utr')
  await page.getByRole('button', { name: 'Zoektekst wissen' }).click()
  await expect(input).toHaveValue('')
  await page.getByRole('button', { name: 'Zoeken sluiten' }).click()
  await expect(list).toBeHidden()
  await expect(input).toHaveValue('De Bilt')
  await expect(page.locator('.search-clear')).toHaveCount(0)
})

async function setStorage(page: Page, values: Record<string, string>): Promise<void> {
  await page.evaluate((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value)
  }, values)
}
