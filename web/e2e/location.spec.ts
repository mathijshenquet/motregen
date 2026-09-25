import { expect, test, type Locator, type Page } from '@playwright/test'

const home = { id: 'home', name: 'Thuis', sourceLabel: 'Groningen', lng: 6.5665, lat: 53.2194 }
const work = { id: 'work', name: 'Werk', sourceLabel: 'Maastricht', lng: 5.6909, lat: 50.8514 }

test('start location remembers saved places and the last map view', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'gedrag, geen performance: één profiel volstaat')
  const scrubber = page.locator('.scrubber')

  await page.goto('/')
  await expect(scrubber).toHaveAttribute('aria-label', /voor De Bilt$/)

  await setStorage(page, {
    'motregen-saved-places': JSON.stringify([home, work]),
    'motregen-map-view': JSON.stringify({ lng: 6.57, lat: 53.21, zoom: 7 }),
  })
  await page.reload()
  await expect(scrubber).toHaveAttribute('aria-label', /voor Groningen$/)

  const viewBefore = await page.evaluate(() => localStorage.getItem('motregen-map-view'))
  await page.getByRole('textbox', { name: 'Zoek plaats' }).focus()
  await page.getByRole('option', { name: /Werk/ }).click()
  await expect(scrubber).toHaveAttribute('aria-label', /voor Werk$/)
  await page.waitForTimeout(1_000)
  expect(await page.evaluate(() => localStorage.getItem('motregen-map-view'))).toBe(viewBefore)

  await page.reload()
  await expect(scrubber).toHaveAttribute('aria-label', /voor Werk$/)

  await setStorage(page, { 'motregen-last-saved-place': 'removed', 'motregen-map-view': '{' })
  await page.reload()
  await expect(scrubber).toHaveAttribute('aria-label', /voor De Bilt$/)
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

  // In rust alleen icoon + plaatsnaam, zo breed als de naam (U22), maar op U17-maat (U22b):
  // 40 px hoog en 15 px (touch 44 px en 16 px: iOS-zoom), icoon 18 px.
  const box = page.locator('.search-box')
  const rest = (await box.boundingBox())!
  expect(rest.width).toBeLessThanOrEqual(125)
  await expect(page.locator('.search-field')).toHaveCSS('font-size', testInfo.project.use.hasTouch ? '16px' : '15px')
  await expect(page.getByRole('button', { name: 'Deze plaats opslaan' })).toHaveCount(0)
  expect(rest.height).toBeGreaterThanOrEqual(testInfo.project.use.hasTouch ? 44 : 38)
  expect(rest.height).toBeLessThanOrEqual(testInfo.project.use.hasTouch ? 46 : 40)
  expect((await page.locator('.search-icon').boundingBox())!.width).toBe(18)

  const input = page.getByRole('textbox', { name: 'Zoek plaats' })
  if (testInfo.project.use.hasTouch) await input.tap()
  else await input.click()
  const list = page.getByRole('listbox')
  await expect(list).toBeVisible()
  // De ster staat in het open paneel, naast het veld.
  await expect(page.getByRole('button', { name: 'Deze plaats opslaan' })).toBeVisible()
  // Veld en lijst in één paneel: de lijst sluit zonder gat aan op het veld.
  const field = (await input.boundingBox())!
  const listBox = (await list.boundingBox())!
  expect(Math.abs(listBox.y - (field.y + field.height))).toBeLessThanOrEqual(2)
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
