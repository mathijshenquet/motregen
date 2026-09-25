import { expect, test, type Page } from '@playwright/test'

const nowOffset = (page: Page) => page.evaluate(() => {
  const scroller = document.querySelector('.table-scroll')!
  const head = document.querySelector('.forecast-table thead')!.getBoundingClientRect().height
  return Math.round(document.querySelector('tr.current-hour')!.getBoundingClientRect().top - scroller.getBoundingClientRect().top - head)
})

test('desktop opens the table on the now-row and fetches history only when scrolled up to', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'inline historie is desktop (muis, ≥ 960 px); touch houdt de uitklaprij')
  const history: string[] = []
  page.on('request', (request) => { if (request.url().includes('-hist')) history.push(request.url()) })
  await page.goto('/')
  await expect(page.getByRole('slider', { name: 'Tijd' })).toHaveAttribute('data-load-stage', /window|complete/, { timeout: 20_000 })
  await page.waitForLoadState('networkidle')
  await expect(page.locator('.history-toggle')).toHaveCount(0)
  await expect(page.locator('tr.past-hour').first()).toBeAttached()
  await expect.poll(() => nowOffset(page)).toBe(0)
  await expect(page.locator('tr.past-hour.pending-hour')).toHaveCount(await page.locator('tr.past-hour').count())
  const passive = history.length

  const box = (await page.locator('.table-scroll').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -2_000)
  await expect(page.locator('tr.past-hour.pending-hour')).toHaveCount(0)
  expect(history.length).toBeGreaterThan(passive)
})

test('touch keeps the history behind a small toggle', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-4g', 'touchroute op het mobiele profiel')
  await page.goto('/')
  const toggle = page.locator('.history-toggle')
  await expect(toggle).toHaveText(/^Afgelopen \d+ uur tonen$/)
  await expect(page.locator('tr.past-hour')).toHaveCount(0)
  await toggle.tap()
  await expect(toggle).toHaveText('Afgelopen uren verbergen')
  await expect(page.locator('tr.past-hour').first()).toBeVisible()
})

test('wind column shows the gust and follows the unit setting across reloads', async ({ page }) => {
  await page.goto('/')
  const reading = page.locator('tr.current-hour .wind-reading')
  await expect(reading.locator('.wind-unit')).toHaveText('Bft', { timeout: 20_000 })
  await expect(reading.locator('.wind-gust')).toHaveText(/^\d+ Bft$/)
  await expect(reading).toHaveAttribute('aria-label', /, windstoten tot \d+ Bft$/)

  await page.getByRole('button', { name: 'Over motregen en instellingen' }).click()
  const units = page.getByRole('group', { name: 'Eenheid van de wind' })
  await units.getByRole('button', { name: 'km/u' }).click()
  await expect(units.getByRole('button', { name: 'km/u' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Sluiten' }).click()
  await expect(reading.locator('.wind-unit')).toHaveText('km/u')
  await expect(reading).toHaveAttribute('aria-label', /^Wind uit \S+, \d+ km\/u, windstoten tot \d+ km\/u$/)

  await page.reload()
  await expect(page.locator('tr.current-hour .wind-reading .wind-unit')).toHaveText('km/u', { timeout: 20_000 })
})
