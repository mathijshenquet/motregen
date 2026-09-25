import { expect, test, type Page, type TestInfo } from '@playwright/test'

// Laatste rtcor-frame in het synth-manifest (scripts/synthgen.ts: now − 5 min).
const LATEST_RADAR = Date.parse('2026-08-28T14:55:00Z')
const minutes = (n: number) => n * 60_000

const pill = (page: Page) => page.locator('.map-clock')
const details = (page: Page) => page.getByRole('button', { name: /Details over dataversheid/ })
const badge = (page: Page) => page.getByRole('button', { name: /^Dataversheid:/ })

async function openAt(page: Page, epoch: number): Promise<void> {
  // Alleen Date staat vast; timers en rAF lopen door zodat de kaart gewoon rendert.
  await page.clock.setFixedTime(epoch)
  await page.goto('/')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
}

async function useTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  const html = page.locator('html')
  // U22: het thema staat in de modal achter de druppelknop (sectie Weergave).
  await page.getByRole('button', { name: 'Over motregen en instellingen' }).press('Enter')
  const dialog = page.getByRole('dialog', { name: 'motregen.nl' })
  await dialog.getByRole('group', { name: 'Weergave' }).getByRole('button', { name: theme === 'dark' ? 'Donker' : 'Licht' }).dispatchEvent('click')
  await expect(html).toHaveAttribute('data-theme', theme)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  // dispatchEvent: onder SwiftShader haalt de knop soms nooit Playwrights 'stable'-check
  // terwijl de basemap herlaadt; die wissel is hier niet onder test.
  // De basemap wisselt asynchroon van stijl.
  await page.waitForTimeout(800)
}

// U22: de klok hangt midden aan de bovenrand van de kaart en raakt geen andere bediening (zoekpil
// links, merk rechts; anders vangt hij hun tikken of verdwijnt hij eronder).
const NEIGHBOURS = ['.search-box', '.map-brand', '.sidebar-uv-chip']

async function expectTopCenter(page: Page): Promise<void> {
  const pillBox = (await pill(page).boundingBox())!
  const map = (await page.locator('.map-shell').boundingBox())!
  expect(Math.abs(pillBox.x + pillBox.width / 2 - (map.x + map.width / 2)), 'pil horizontaal gecentreerd op de kaart').toBeLessThanOrEqual(8)
  expect(Math.abs(pillBox.y - map.y), 'klok vast aan de bovenrand').toBeLessThanOrEqual(1)
  for (const selector of NEIGHBOURS) {
    const other = page.locator(selector).first()
    if (!await other.count() || !await other.isVisible()) continue
    const box = (await other.boundingBox())!
    const apart = pillBox.x >= box.x + box.width || box.x >= pillBox.x + pillBox.width || pillBox.y >= box.y + box.height || box.y >= pillBox.y + pillBox.height
    expect(apart, `pil ${JSON.stringify(pillBox)} overlapt ${selector} ${JSON.stringify(box)}`).toBe(true)
  }
  // Contain-fit (U14): het vrije kaartdeel begint onder de pil.
  expect(Number(await page.locator('.map').getAttribute('data-inset-top'))).toBeGreaterThanOrEqual(Math.round(pillBox.y + pillBox.height - map.y))
}

// Per thema: optioneel het paneel openen, vastleggen en weer sluiten.
async function shoot(page: Page, testInfo: TestInfo, name: string, withPanel = false): Promise<void> {
  for (const theme of ['light', 'dark'] as const) {
    await useTheme(page, theme)
    if (withPanel) await details(page).click()
    const dialog = page.getByRole('dialog', { name: 'Hoe vers is de data?' })
    if (withPanel) await expect(dialog).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`${testInfo.project.name}-${name}-${theme}.png`) })
    if (withPanel) {
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
    }
  }
  await useTheme(page, 'light')
}

test('fresh radar reads as current, with the scan time and its age', async ({ page }, testInfo) => {
  await openAt(page, LATEST_RADAR + minutes(3))
  await expect(pill(page)).toHaveAttribute('data-freshness', 'fresh')
  await expect(badge(page)).toHaveAttribute('aria-label', 'Dataversheid: actueel, radar 14:55, 3 min oud')
  // Alleen kaarttijd en regimewoord als tekst; de radartijd zit in de knop en het paneel.
  await expect(pill(page).locator('.clock-data')).toHaveText(/^(observatie|voorspelling)$/)
  await expect(page.locator('.map-clock [aria-live="polite"]')).toHaveText('Actueel')
  await shoot(page, testInfo, 'vers')

  await details(page).click()
  const dialog = page.getByRole('dialog', { name: 'Hoe vers is de data?' })
  await expect(dialog).toBeVisible()
  for (const source of ['Radar', 'Nowcast', 'Blend', 'HARMONIE', 'UV']) await expect(dialog.getByText(source, { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(details(page)).toBeFocused()
  await shoot(page, testInfo, 'paneel', true)
  await expectTopCenter(page)

  // De amber knop opent hetzelfde paneel.
  await badge(page).click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  // Het paneel opent gecentreerd onder de pil.
  await details(page).click()
  const pillBox = (await pill(page).boundingBox())!
  const panel = (await dialog.boundingBox())!
  expect(panel.y).toBeGreaterThanOrEqual(pillBox.y + pillBox.height)
  expect(panel.y - (pillBox.y + pillBox.height)).toBeLessThan(24)
  const viewport = page.viewportSize()!
  const centred = Math.min(Math.max(pillBox.x + pillBox.width / 2, 16 + panel.width / 2), viewport.width - 16 - panel.width / 2)
  expect(Math.abs(panel.x + panel.width / 2 - centred)).toBeLessThanOrEqual(8)
  await page.keyboard.press('Escape')

  // Kleinste telefoon: nog steeds midden boven en vrij van zoekpil en merk; "De Bilt" heel.
  if (testInfo.project.use.hasTouch) {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.reload()
    await expect(page.locator('.map-splash.ready')).toBeAttached()
    await expectTopCenter(page)
    expect(await page.locator('.search-field').evaluate((field: HTMLInputElement) => field.scrollWidth <= field.clientWidth)).toBe(true)
    await shoot(page, testInfo, '320')
  }
})

test('radar that stopped arriving is marked aging, then stale', async ({ page }, testInfo) => {
  await openAt(page, LATEST_RADAR + minutes(14))
  await expect(pill(page)).toHaveAttribute('data-freshness', 'aging')
  await expect(badge(page)).toHaveAttribute('aria-label', /, 14 min oud$/)
  await shoot(page, testInfo, 'verouderend')

  await openAt(page, LATEST_RADAR + minutes(95))
  await expect(pill(page)).toHaveAttribute('data-freshness', 'stale')
  await expect(badge(page)).toHaveAttribute('aria-label', /, 1 u oud$/)
  await expectTopCenter(page)
  await shoot(page, testInfo, 'verouderd')

  // Weken stil (zoals het synth-manifest zonder vaste klok).
  await openAt(page, LATEST_RADAR + minutes(60 * 24 * 26))
  await expect(badge(page)).toHaveAttribute('aria-label', 'Dataversheid: verouderd, radar 14:55, 26 d oud')
  // Het regimewoord volgt de scrubber. Klik laag in het vlak: bovenin staat de cursorpil (afspeelknop).
  const surface = (await page.locator('.scrub-surface').boundingBox())!
  await page.locator('.scrub-surface').click({ position: { x: 30, y: surface.height * 0.75 } })
  await expect(pill(page)).toHaveAttribute('data-source', 'observations')
  await expect(pill(page).locator('.clock-source')).toHaveText('observatie')
  // Zelfde moment uitlezen: op trage profielen glijdt de cursor nog na.
  await expect.poll(() => page.evaluate(() => {
    const clock = document.querySelector('.map-clock .clock-map-time')?.textContent?.trim()
    return clock !== undefined && clock === document.querySelector('.cursor-time')?.textContent?.trim()
  })).toBe(true)
  await expectTopCenter(page)
  const trigger = (await pill(page).locator('.freshness-trigger').boundingBox())!
  if (testInfo.project.use.hasTouch) expect(trigger.height).toBeGreaterThanOrEqual(44)
  expect((await pill(page).boundingBox())!.height).toBeLessThan(56)
  await page.locator('.scrub-surface').click({ position: { x: surface.width - 12, y: surface.height * 0.75 } })
  // Nowcast en HARMONIE: één regime (PO-aanvulling U22).
  await expect(pill(page)).toHaveAttribute('data-source', 'forecast')
  await expect(pill(page).locator('.clock-source')).toHaveText('voorspelling')
  await page.screenshot({ path: testInfo.outputPath(`${testInfo.project.name}-weken-oud-kaart-light.png`) })
})

test('a failed manifest refresh shows offline instead of silently stale data', async ({ page }, testInfo) => {
  await openAt(page, LATEST_RADAR + minutes(3))
  await expect(pill(page)).toHaveAttribute('data-freshness', 'fresh')
  await page.route('**/manifest.json', (route) => route.abort('internetdisconnected'))
  await details(page).click()
  await page.getByRole('button', { name: 'Nu verversen' }).click()
  await expect(pill(page)).toHaveAttribute('data-freshness', 'offline')
  await expect(page.getByText(/verversen mislukt om/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await shoot(page, testInfo, 'offline-paneel', true)
  await expect(badge(page)).toHaveAttribute('aria-label', 'Dataversheid: offline, radar 14:55, verversen mislukt')
  await expect(page.locator('.map-clock [aria-live="polite"]')).toHaveText('Offline')
  await shoot(page, testInfo, 'offline')

  await page.unroute('**/manifest.json')
  await details(page).click()
  await page.getByRole('button', { name: 'Nu verversen' }).click()
  await expect(pill(page)).toHaveAttribute('data-freshness', 'fresh')
})
