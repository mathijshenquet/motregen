import { expect, test, type Page } from '@playwright/test'

// De synthetische dataset heeft geen ECMWF; het manifest krijgt hier een sectie met één dagchunk die niet bestaat.
// Waar het om gaat: geen ECMWF-verzoek bij de start, wel zodra de lange termijn in beeld komt (U91/U91b, MIP-36).
async function withEcmwf(page: Page): Promise<string[]> {
  const ecmwf: string[] = []
  page.on('request', (request) => { if (request.url().includes('ecmwf-day_')) ecmwf.push(request.url()) })
  await page.route('**/ecmwf-day_*', (route) => route.fulfill({ status: 404 }))
  await page.route('**/data/manifest.json*', async (route) => {
    const response = await route.fetch()
    const manifest = await response.json()
    const run = new Date(Math.floor(Date.parse(manifest.now) / 86_400_000) * 86_400_000).toISOString()
    const days = Array.from({ length: 9 }, (_, index) => {
      const date = new Date(Date.parse(run) + (index + 1) * 86_400_000).toISOString().slice(0, 10)
      return { date, start: `${date}T00:00:00Z`, end: `${date}T23:59:59Z` }
    })
    manifest.ecmwf = { run, license: 'ECMWF IFS open data (CC BY 4.0), door motregen omgerekend naar dagwaarden', days }
    manifest.chunks.push({ url: 'chunks/ecmwf-day_tmax_c-test.mrf', source: 'ecmwf', field: 'day_tmax_c', run, header_len: 100, times: days.map((day) => `${day.date}T10:00:00Z`) })
    await route.fulfill({ response, json: manifest })
  })
  return ecmwf
}

async function settled(page: Page): Promise<void> {
  await expect(page.getByRole('slider', { name: 'Tijd' })).toHaveAttribute('data-load-stage', /window|complete/, { timeout: 20_000 })
  await page.waitForLoadState('networkidle')
}

test('the sliding table turns coarser after the hourly rows and loads the long range only near it (U91b)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const ecmwf = await withEcmwf(page)
  await page.goto('/')
  await settled(page)
  await expect(page.locator('.day-list')).toHaveCount(0)
  await expect(page.locator('tr[data-grain="3h"]').first()).toBeAttached()
  expect(ecmwf).toEqual([])

  // Na HARMONIE alleen dag-rijen uit de dagvelden (er zijn geen stappen); die liggen voorbij de tijdlijn.
  const dayRow = page.locator('tr[data-grain="day"]').first()
  await dayRow.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await expect.poll(() => ecmwf.length).toBeGreaterThan(0)
  // De dag staat in de rij zelf, geen losse kopbalk (PO 2026-10-17).
  await expect(page.locator('tr.day-heading-row')).toHaveCount(0)
  await expect(dayRow.locator('.time-label span')).toHaveText(/^[a-z]{2} \d{1,2}$/i)
  await expect(dayRow).toHaveClass(/beyond-timeline/)
  // Een ontbrekende chunk is geen laadtoestand: een streep, geen puntjes.
  await expect(dayRow.locator('.temperature-cell')).toHaveText('—')
  // Het afspelen schuift de cursor intussen een paar minuten door; een sprong naar het tijdlijneinde is uren.
  const cursor = Number(await page.locator('.app-shell').getAttribute('data-epoch'))
  await dayRow.locator('.time-cell').click()
  await page.waitForTimeout(300)
  expect(Math.abs(Number(await page.locator('.app-shell').getAttribute('data-epoch')) - cursor)).toBeLessThan(10 * 60_000)

  // Een 3-uursrij binnen de tijdlijn zet de cursor op zijn begin.
  const threeHours = page.locator('tr[data-grain="3h"]:not(.beyond-timeline)').first()
  const start = await threeHours.getAttribute('data-epoch')
  await threeHours.locator('.time-label').click()
  await expect.poll(async () => Math.round(Number(await page.locator('.app-shell').getAttribute('data-epoch')) / 60_000)).toBe(Math.round(Number(start) / 60_000))
  expect(errors).toEqual([])
})

test('under ?dev the hourly table keeps all hours with the day list below it, filling today from HARMONIE', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('motregen-dagenlijst', 'lijst'))
  const ecmwf = await withEcmwf(page)
  await page.goto('/?dev')
  await settled(page)
  await expect(page.locator('tr[data-grain]')).toHaveCount(0)
  const list = page.locator('.day-list')
  await expect(list.locator('.day-row')).toHaveCount(10)
  expect(ecmwf).toEqual([])

  await list.scrollIntoViewIfNeeded()
  await expect.poll(() => ecmwf.length).toBeGreaterThan(0)
  const today = list.locator('.day-row').first()
  await expect(today.locator('.day-name')).toHaveText('Vandaag')
  await expect(today.locator('.day-max')).toHaveText(/^-?\d+°$/, { timeout: 20_000 })
  await expect(list.locator('.day-row').nth(3).locator('.day-max')).toHaveText('—')
})
