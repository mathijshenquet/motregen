import { expect, test, type Page, type TestInfo } from '@playwright/test'

// Laatste rtcor-frame in het synth-manifest (scripts/synthgen.ts: now − 5 min).
const LATEST_RADAR = Date.parse('2026-08-28T14:55:00Z')
const minutes = (n: number) => n * 60_000

const pill = (page: Page) => page.locator('.map-clock')
const details = (page: Page) => page.getByRole('button', { name: /Details over dataversheid/ })

async function openAt(page: Page, epoch: number): Promise<void> {
  // Alleen Date staat vast; timers en rAF lopen door zodat de kaart gewoon rendert.
  await page.clock.setFixedTime(epoch)
  await page.goto('/')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
}

async function useTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  const html = page.locator('html')
  // Desktop (U9): segmented control met Licht/Systeem/Donker; mobiel: cyclusknop.
  const segment = page.locator('.sidebar-theme:visible button', { hasText: theme === 'dark' ? 'Donker' : 'Licht' })
  if (await segment.count()) await segment.first().dispatchEvent('click')
  else for (let clicks = 0; clicks < 3 && await html.getAttribute('data-theme') !== theme; clicks++) await page.locator('.theme-button:visible').dispatchEvent('click')
  await expect(html).toHaveAttribute('data-theme', theme)
  // dispatchEvent: onder SwiftShader haalt de themaknop soms nooit Playwrights
  // 'stable'-check terwijl de basemap herlaadt; die wissel is hier niet onder test.
  // De basemap wisselt asynchroon van stijl.
  await page.waitForTimeout(800)
}

// Op een smalle telefoon mag de pil het merk links niet raken (anders vangt hij diens tikken).
async function expectClearOfBrand(page: Page): Promise<void> {
  const pillBox = (await pill(page).boundingBox())!
  const brandBox = (await page.locator('.map-brand').boundingBox())!
  const apart = pillBox.x >= brandBox.x + brandBox.width || pillBox.y + pillBox.height <= brandBox.y
  expect(apart, `pil ${JSON.stringify(pillBox)} overlapt merk ${JSON.stringify(brandBox)}`).toBe(true)
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
  await expect(pill(page).locator('.freshness-trigger')).toContainText('Radar')
  await expect(pill(page).locator('.freshness-age')).toHaveText('3 min')
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
  await expectClearOfBrand(page)
})

test('radar that stopped arriving is marked aging, then stale', async ({ page }, testInfo) => {
  await openAt(page, LATEST_RADAR + minutes(14))
  await expect(pill(page)).toHaveAttribute('data-freshness', 'aging')
  await expect(pill(page).locator('.freshness-age')).toHaveText('14 min')
  await shoot(page, testInfo, 'verouderend')

  await openAt(page, LATEST_RADAR + minutes(95))
  await expect(pill(page)).toHaveAttribute('data-freshness', 'stale')
  await expect(pill(page).locator('.freshness-age')).toHaveText('1 u')
  await expectClearOfBrand(page)
  await shoot(page, testInfo, 'verouderd')

  // Weken stil (zoals het synth-manifest zonder vaste klok): geen datum in de pil, die blijft smal.
  await openAt(page, LATEST_RADAR + minutes(60 * 24 * 26))
  await expect(pill(page).locator('.freshness-age')).toHaveText('26 d')
  await expect(pill(page).locator('.freshness-trigger strong')).toHaveText('14:55')
  await page.locator('.scrub-surface').click({ position: { x: 30, y: 60 } })
  await expect(pill(page).locator('.map-clock-map')).toBeVisible()
  await expectClearOfBrand(page)
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
  await expect(pill(page).locator('.freshness-age')).toHaveText('offline')
  await expect(page.locator('.map-clock [aria-live="polite"]')).toHaveText('Offline')
  await shoot(page, testInfo, 'offline')

  await page.unroute('**/manifest.json')
  await details(page).click()
  await page.getByRole('button', { name: 'Nu verversen' }).click()
  await expect(pill(page)).toHaveAttribute('data-freshness', 'fresh')
})
