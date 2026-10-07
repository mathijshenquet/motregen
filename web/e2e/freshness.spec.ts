import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import { pausePlayback, startPlayback } from './playback'

// Laatste rtcor-frame in het synth-manifest (scripts/synthgen.ts: now − 5 min).
const LATEST_RADAR = Date.parse('2026-08-28T14:55:00Z')
const radarClock = (page: Page) => page.evaluate((epoch) => new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' }).format(epoch), LATEST_RADAR)
const minutes = (n: number) => n * 60_000

const pill = (page: Page) => page.locator('.map-clock')
// Sinds U56 is de klokpil ook een tijdschuif (slepen = scrubben); een tik opent nog steeds het paneel.
const details = (page: Page) => page.getByRole('slider', { name: /Details over dataversheid/ })
const scrubber = (page: Page) => page.getByRole('slider', { name: 'Tijd', exact: true })

// PO 2026-09-25: actueel = alleen de tijd; achterlopend/verouderd = stip links van de tijd + leeftijd eronder.
async function expectDot(page: Page, token: '--fresh' | '--aging' | '--stale'): Promise<void> {
  const dot = pill(page).locator('.freshness-dot')
  if (token === '--fresh') {
    await expect(dot).toHaveCount(0)
    await expect(pill(page).locator('.clock-age')).toHaveCount(0)
    await expect(pill(page)).not.toHaveAttribute('data-source')
    return
  }
  await expect.poll(() => dot.evaluate((element, name) => {
    const probe = document.createElement('i')
    probe.style.background = `var(${name})`
    document.body.append(probe)
    const expected = getComputedStyle(probe).backgroundColor
    probe.remove()
    return getComputedStyle(element).backgroundColor === expected
  }, token)).toBe(true)
  const time = (await pill(page).locator('.clock-map-time').boundingBox())!
  const box = (await dot.boundingBox())!
  expect(box.width).toBeLessThanOrEqual(7)
  expect(box.x + box.width, 'stip links van de tijd').toBeLessThanOrEqual(time.x)
  expect(time.x - (box.x + box.width)).toBeLessThan(10)
  await expect(pill(page).locator('.clock-age')).toHaveText(/oud|offline|geen radar/)
  expect(box.y, 'stip binnen de tijdregel').toBeGreaterThan(time.y)
  expect(box.y + box.height).toBeLessThan(time.y + time.height)
  await expect(pill(page)).not.toHaveAttribute('data-source')
}

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

// Het paneel rolt in 0,42 s uit; een still halverwege toont een afgesneden paneel.
async function unrolled(dialog: Locator): Promise<void> {
  await dialog.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)))
}

// Per thema: optioneel het paneel openen, vastleggen en weer sluiten.
async function shoot(page: Page, testInfo: TestInfo, name: string, withPanel = false): Promise<void> {
  for (const theme of ['light', 'dark'] as const) {
    await useTheme(page, theme)
    if (withPanel) await details(page).click()
    const dialog = page.getByRole('dialog', { name: 'Hoe actueel is de data?' })
    if (withPanel) {
      await expect(dialog).toBeVisible()
      await unrolled(dialog)
    }
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
  await expectDot(page, '--fresh')
  // Alleen de kaarttijd als tekst; status, radartijd en leeftijd in de aria-label en het paneel.
  await expect(details(page)).toHaveText(/^\d\d:\d\d$/)
  await expect(details(page)).toHaveAttribute('aria-label', new RegExp(`\\. Actueel: Radar ${await radarClock(page)}, 3 min geleden\\. Details over dataversheid$`))
  await expect(page.locator('.map-clock [aria-live="polite"]')).toHaveText('Actueel')
  await shoot(page, testInfo, 'vers')

  await details(page).click()
  const dialog = page.getByRole('dialog', { name: 'Hoe actueel is de data?' })
  await expect(dialog).toBeVisible()
  for (const source of ['Radar', 'Nowcast', 'Blend', 'HARMONIE', 'UV']) await expect(dialog.locator('.freshness-sources').getByText(source, { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(details(page)).toBeFocused()
  await shoot(page, testInfo, 'paneel', true)
  await expectTopCenter(page)

  // U34 (PO 2026-09-25 live): de pil rolt uit tot het paneel; het paneel sluit bovenaan aan op de pil,
  // gecentreerd, met de klok bovenin op de plek van de pil.
  await details(page).click()
  const pillBox = (await pill(page).boundingBox())!
  const panel = (await dialog.boundingBox())!
  expect(Math.abs(panel.y - pillBox.y)).toBeLessThanOrEqual(1)
  const panelClock = (await dialog.locator('.freshness-clock .clock-main').boundingBox())!
  expect(Math.abs(panelClock.x + panelClock.width / 2 - (pillBox.x + pillBox.width / 2))).toBeLessThanOrEqual(2)
  const viewport = page.viewportSize()!
  const centred = Math.min(Math.max(pillBox.x + pillBox.width / 2, 16 + panel.width / 2), viewport.width - 16 - panel.width / 2)
  expect(Math.abs(panel.x + panel.width / 2 - centred)).toBeLessThanOrEqual(8)
  await page.keyboard.press('Escape')

  // U34/U58: in rust staat alleen het zoekicoon; het uitgevouwen veld vult de smalle kaartbreedte.
  if (testInfo.project.use.hasTouch) {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.reload()
    await expect(page.locator('.map-splash.ready')).toBeAttached()
    await expectTopCenter(page)
    await expect(page.getByRole('textbox', { name: 'Zoek plaats' })).toHaveAttribute('aria-expanded', 'false')
    await page.getByRole('textbox', { name: 'Zoek plaats' }).tap()
    await page.getByRole('textbox', { name: 'Zoek plaats' }).fill('De Bilt')
    await expect.poll(() => page.locator('.search-field').evaluate((field: HTMLInputElement) => field.scrollWidth <= field.clientWidth)).toBe(true)
    await page.keyboard.press('Escape')
    await shoot(page, testInfo, '320')
  }
})

test('radar that stopped arriving is marked aging, then stale', async ({ page }, testInfo) => {
  await openAt(page, LATEST_RADAR + minutes(14))
  await expect(pill(page)).toHaveAttribute('data-freshness', 'aging')
  await expectDot(page, '--aging')
  await expect(details(page)).toHaveAttribute('aria-label', new RegExp(`Loopt achter: Radar ${await radarClock(page)}, 14 min geleden`))
  await shoot(page, testInfo, 'verouderend')

  await openAt(page, LATEST_RADAR + minutes(95))
  await expect(pill(page)).toHaveAttribute('data-freshness', 'stale')
  await expectDot(page, '--stale')
  await expect(details(page)).toHaveAttribute('aria-label', new RegExp(`Verouderd: Radar ${await radarClock(page)}, 1 u 35 min geleden`))
  await expectTopCenter(page)
  await shoot(page, testInfo, 'verouderd')

  // Weken stil (zoals het synth-manifest zonder vaste klok).
  await openAt(page, LATEST_RADAR + minutes(60 * 24 * 26))
  await expect(details(page)).toHaveAttribute('aria-label', /Verouderd: Radar /)
  // Het regime volgt de scrubber (alleen voor de schermlezer). Een tik links van de cursor (op ⅓)
  // gaat naar het verleden, helemaal rechts naar de verwachting (U34).
  const surface = (await page.locator('.scrub-surface').boundingBox())!
  await page.locator('.scrub-surface').click({ position: { x: 30, y: surface.height * 0.75 } })
  await expect(details(page)).toHaveAttribute('aria-label', /, observatie\. /)
  // Zelfde moment uitlezen: op trage profielen glijdt de cursor nog na.
  await expect.poll(() => page.evaluate(() => {
    const clock = document.querySelector('.map-clock .clock-map-time')?.textContent?.trim()
    const cursor = /\d\d:\d\d/.exec(document.querySelector('.scrub-surface')?.getAttribute('aria-valuetext') ?? '')?.[0]
    return clock !== undefined && clock === cursor
  })).toBe(true)
  await expectTopCenter(page)
  const trigger = (await pill(page).locator('.freshness-trigger').boundingBox())!
  if (testInfo.project.use.hasTouch) expect(trigger.height).toBeGreaterThanOrEqual(44)
  expect((await pill(page).boundingBox())!.height).toBeLessThan(56)
  await page.locator('.scrub-surface').click({ position: { x: surface.width - 12, y: surface.height * 0.75 } })
  // Nowcast en HARMONIE: één regime (PO-aanvulling U22).
  await expect(details(page)).toHaveAttribute('aria-label', /, voorspelling\. /)
  // Geen regimemarkering meer onder het histogram (PO U22b): de nu-lijn scheidt ze.
  await expect(page.locator('.regimes, .scrubber-source')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath(`${testInfo.project.name}-weken-oud-kaart-light.png`) })
})

// U56 (feedback Maarten): slepen op de klokpil scrubt, en het uitgerolde paneel toont de tijdlijn per bron.
test('dragging the clock scrubs the time and the unrolled panel shows the source strip', async ({ page }, testInfo) => {
  await openAt(page, LATEST_RADAR + minutes(3))
  await expect(scrubber(page)).toHaveAttribute('data-load-stage', /window|complete/, { timeout: 20_000 })
  await pausePlayback(page)
  const cursorOf = async (slider: ReturnType<typeof scrubber>) => Number(await slider.getAttribute('aria-valuenow'))
  const dialog = page.getByRole('dialog', { name: 'Hoe actueel is de data?' })
  const dragClock = async (deltaPx: number, release = true) => {
    const box = (await details(page).boundingBox())!
    const startX = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(startX, y)
    await page.mouse.down()
    await page.mouse.move(startX + deltaPx, y, { steps: 6 })
    if (release) await page.mouse.up()
  }

  await expect(details(page)).toHaveCSS('cursor', 'ew-resize')
  await expect(details(page)).toHaveCSS('touch-action', 'pan-y')
  const before = await cursorOf(scrubber(page))
  // 30 px naar rechts = een uur later: twaalf nowcast-frames van vijf minuten.
  await dragClock(30)
  await expect(scrubber(page)).toHaveAttribute('aria-valuenow', String(before + 12))
  await expect(details(page)).toHaveAttribute('aria-valuenow', String(before + 12))
  await expect(dialog).toBeHidden()
  await dragClock(-45)
  await expect(scrubber(page)).toHaveAttribute('aria-valuenow', String(before - 6))
  await expect(dialog).toBeHidden()

  // Toetsen op de pil: dezelfde stappen als de scrubber.
  await details(page).press('ArrowRight')
  await expect(scrubber(page)).toHaveAttribute('aria-valuenow', String(before - 5))
  await details(page).press('PageUp')
  await expect(scrubber(page)).toHaveAttribute('aria-valuenow', String(before + 1))

  // Tijdens slepen pauzeert het afspelen, zonder ▶ in de pil, en het hervat na een seconde rust.
  await startPlayback(page)
  await dragClock(-20, false)
  await expect(scrubber(page)).not.toHaveAttribute('data-playing', '')
  await expect(pill(page).getByRole('button', { name: 'Afspelen' })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath(`${testInfo.project.name}-klok-slepen-light.png`) })
  await page.mouse.up()
  await expect(dialog).toBeHidden()
  await expect(scrubber(page)).toHaveAttribute('data-playing', '', { timeout: 3_000 })
  await pausePlayback(page)

  // Een tik opent het paneel met de strook: drie bronzones, elk met de leeftijd van de laatste run.
  await details(page).click()
  await expect(dialog).toBeVisible()
  const strip = dialog.getByTestId('freshness-strip')
  const zones = strip.locator('.freshness-strip-zone')
  await expect(zones.locator('span')).toHaveText(['Radar', 'Nowcast', 'HARMONIE'])
  await expect(zones.locator('small')).toHaveText(['3 min', 'zojuist', '2 u'])
  await expect(strip.locator('.freshness-strip-now')).toHaveText('Nu')
  const stripBox = (await strip.boundingBox())!
  const zoneBoxes = await zones.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().width))
  for (const width of zoneBoxes) expect(width / stripBox.width, 'elke zone leesbaar breed').toBeGreaterThan(0.15)
  const markerX = async () => (await strip.locator('.freshness-strip-marker').boundingBox())!.x
  await unrolled(dialog)
  await page.screenshot({ path: testInfo.outputPath(`${testInfo.project.name}-strook-light.png`) })

  // Tik in de strook springt de cursor: links het begin van de radar, rechts het einde van HARMONIE.
  // De strook is continu: op mobiel ligt 1 px al voorbij een halve radarstap. Raak de rand zelf.
  await strip.click({ position: { x: 0, y: 22 } })
  await expect(scrubber(page)).toHaveAttribute('aria-valuenow', '0')
  const leftMarker = await markerX()
  await strip.click({ position: { x: stripBox.width - 1, y: 22 } })
  await expect(scrubber(page)).toHaveAttribute('aria-valuenow', await scrubber(page).getAttribute('aria-valuemax') ?? '')
  expect(await markerX() - leftMarker).toBeGreaterThan(stripBox.width * 0.9)
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
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
  await expectDot(page, '--stale')
  await expect(details(page)).toHaveAttribute('aria-label', new RegExp(`\\. Offline: Radar ${await radarClock(page)}`))
  await expect(page.locator('.map-clock [aria-live="polite"]')).toHaveText('Offline')
  await shoot(page, testInfo, 'offline')

  await page.unroute('**/manifest.json')
  await details(page).click()
  await page.getByRole('button', { name: 'Nu verversen' }).click()
  await expect(pill(page)).toHaveAttribute('data-freshness', 'fresh')
})
