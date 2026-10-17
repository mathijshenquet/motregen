import { expect, test } from '@playwright/test'

// De synthetische dataset heeft geen ECMWF; het manifest krijgt hier een sectie met één dagchunk die niet bestaat.
// Waar het om gaat: geen ECMWF-verzoek bij de start, wel zodra de lijst in beeld komt (U91, MIP-36).
test('the day list fetches ECMWF only once it scrolls into view and fills today from HARMONIE', async ({ page }) => {
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
  await page.goto('/')
  await expect(page.getByRole('slider', { name: 'Tijd' })).toHaveAttribute('data-load-stage', /window|complete/, { timeout: 20_000 })
  await page.waitForLoadState('networkidle')
  const list = page.locator('.day-list')
  await expect(list.locator('.day-row')).toHaveCount(10)
  expect(ecmwf).toEqual([])

  await list.scrollIntoViewIfNeeded()
  await expect.poll(() => ecmwf.length).toBeGreaterThan(0)
  const today = list.locator('.day-row').first()
  await expect(today.locator('.day-name')).toHaveText('Vandaag')
  await expect(today.locator('.day-max')).toHaveText(/^-?\d+°$/, { timeout: 20_000 })
  // Een ontbrekende chunk is geen laadtoestand: de ECMWF-dagen tonen een streep, geen puntjes.
  await expect(list.locator('.day-row').nth(3).locator('.day-max')).toHaveText('—')
})
