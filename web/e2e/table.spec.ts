import { expect, test, type Page } from '@playwright/test'

const nowOffset = (page: Page) => page.evaluate(() => {
  const scroller = document.querySelector('.table-scroll')!
  const head = document.querySelector('.forecast-table thead')!.getBoundingClientRect().height
  return Math.round(document.querySelector('tr.current-hour')!.getBoundingClientRect().top - scroller.getBoundingClientRect().top - head)
})
const previewOffset = (page: Page) => page.evaluate(() => {
  const scroller = document.querySelector('.table-scroll')!
  const head = document.querySelector('.forecast-table thead')!.getBoundingClientRect().height
  const cursor = Number(document.querySelector<HTMLElement>('.app-shell')!.dataset.epoch)
  const epoch = Math.round(cursor / 3_600_000) * 3_600_000
  const row = document.querySelector<HTMLElement>(`tr[data-epoch="${epoch}"]`)!
  return Math.round(row.getBoundingClientRect().top - scroller.getBoundingClientRect().top - head)
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

test('the heading row takes the sky of the top visible table row while scrolling (U62)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'De open tabel op mobiel heeft een eigen test; hier het desktoppaneel')
  await page.goto('/')
  await expect(page.locator('tr.current-hour')).toBeAttached()
  const heading = page.locator('.forecast-table thead tr')
  const scrollRowUnderHeading = (rowClass: string) => page.evaluate((wanted) => {
    const scroller = document.querySelector<HTMLElement>('.table-scroll')!
    // De cellen zijn sticky; de koprij zelf scrolt mee.
    const headBottom = document.querySelector('.forecast-table thead th')!.getBoundingClientRect().bottom
    const rows = [...document.querySelectorAll<HTMLElement>(`tbody tr.${wanted}[data-epoch]`)].filter((row) => row.getBoundingClientRect().height > 0)
    const row = rows[Math.min(rows.length - 1, 2)]!
    scroller.scrollTop += row.getBoundingClientRect().top - headBottom
  }, rowClass)

  // Desktop houdt de nu-rij vastgepind tot de gebruiker de tabel aanraakt; een wieltik laat hem los.
  const tableBox = (await page.locator('.table-scroll').boundingBox())!
  await page.mouse.move(tableBox.x + tableBox.width / 2, tableBox.y + tableBox.height / 2)
  await page.mouse.wheel(0, 40)
  await scrollRowUnderHeading('night-hour')
  await expect(heading).toHaveClass(/sky-head/)
  await expect(heading).toHaveClass(/night-hour/)
  await scrollRowUnderHeading('day-hour')
  await expect(heading).toHaveClass(/day-hour/)
  await expect(heading).not.toHaveClass(/night-hour/)
})

test('portrait mobile keeps history mounted and unlocks the same table offset', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-4g', 'portrait-scrollroute op het mobiele profiel')
  await page.goto('/')
  const scroller = page.locator('.table-scroll')
  await expect(page.locator('tr.past-hour').first()).toBeAttached()
  await expect.poll(() => previewOffset(page)).toBe(0)
  const offset = await scroller.evaluate((element) => element.scrollTop)
  expect(offset).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Tabel' }).tap()
  await expect(page.locator('.app-shell')).toHaveClass(/table-view-open/)
  await expect(page.locator('.app-shell')).toHaveClass(/table-scroll-open/)
  await expect(page.locator('.map-shell')).toHaveAttribute('data-rendering', 'false')
  await expect(page.locator('.history-toggle')).toHaveCount(0)
  await expect.poll(async () => Math.abs(await scroller.evaluate((element) => element.scrollTop) - offset)).toBeLessThanOrEqual(1)
  await scroller.evaluate((element) => { element.scrollTop = 0 })
  await expect(page.locator('tr.past-hour').first()).toBeVisible()

  const tablePageOffset = await page.evaluate(() => window.scrollY)
  await page.evaluate(async (acceptedOffset) => {
    document.documentElement.style.scrollSnapType = 'none'
    window.scrollTo(0, acceptedOffset - 48)
    window.dispatchEvent(new Event('scrollend'))
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    window.scrollTo(0, acceptedOffset)
    document.documentElement.style.scrollSnapType = ''
    window.dispatchEvent(new Event('scrollend'))
  }, tablePageOffset)
  await expect(page.locator('.app-shell')).toHaveClass(/table-scroll-open/)
  await expect.poll(() => scroller.evaluate((element) => Math.round(element.scrollTop))).toBe(0)
})

test('mobile previews the heading and current row, then scrolls smoothly between table and map', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-4g', 'mobiele scroll-switch')
  await page.goto('/')
  const panel = page.locator('.forecast-panel')
  // U42: Tabel staat in de koprij naast de kaartmodi; de losse openknop is vervallen.
  await expect(page.getByRole('button', { name: 'Tabel', exact: true })).toBeVisible()
  await expect.poll(() => previewOffset(page)).toBe(0)
  const preview = await page.evaluate(() => {
    const cursor = Number(document.querySelector<HTMLElement>('.app-shell')!.dataset.epoch)
    const epoch = Math.round(cursor / 3_600_000) * 3_600_000
    const row = document.querySelector<HTMLElement>(`tr[data-epoch="${epoch}"]`)!
    return { current: row.getBoundingClientRect().toJSON(), next: row.nextElementSibling!.getBoundingClientRect().toJSON() }
  })
  // U42: de preview toont circa 1,2 rij, dus de huidige rij heel en de volgende gedeeltelijk.
  expect(preview.current.top).toBeLessThan(page.viewportSize()!.height)
  expect(preview.current.bottom).toBeLessThanOrEqual(page.viewportSize()!.height)
  expect(preview.next.top).toBeLessThan(page.viewportSize()!.height)
  expect(preview.next.bottom).toBeGreaterThan(page.viewportSize()!.height)

  await page.getByRole('button', { name: 'Wind' }).tap()
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(0)

  await page.getByRole('button', { name: 'Tabel' }).tap()
  await expect(page.locator('.app-shell')).toHaveClass(/table-view-open/)
  await expect(page.getByRole('button', { name: 'Tabel' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => panel.evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBeLessThanOrEqual(1)
  await expect(page.locator('.map-shell')).toBeVisible()
  await expect(page.locator('.map-shell')).toHaveAttribute('data-rendering', 'false')
  await page.getByRole('button', { name: 'Weer' }).tap()
  await expect(page.locator('.app-shell')).not.toHaveClass(/table-view-open/)
  await expect(page.locator('.app-shell')).not.toHaveClass(/table-scroll-open/)
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBeLessThanOrEqual(1)
  await expect(page.locator('.map-shell')).toBeVisible()
  await expect(page.locator('.map-shell')).toHaveAttribute('data-rendering', 'true')
})

test('a constrained device loads the visible lazy table after it mounts', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 })
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 4 })
  })
  await page.goto('/weer')
  const current = page.locator('tr.current-hour')
  await expect(current.locator('.air-temperature')).toHaveText(/^\d+°$/, { timeout: 20_000 })
  await expect(current.locator('.wind-gust')).toHaveText(/^\d+ Bft$/)
  await expect(current.locator('.weather-icon')).toBeVisible()
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

test.describe('telefoon met ingeklapte adresbalk', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('scrolling (not tapping) to the table opens the table view even when the panel cannot reach the top', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('tr.current-hour')).toBeAttached()
    // Android Chrome met ingeklapte adresbalk: het scherm is hoger dan het paneel, dus de pagina eindigt
    // voordat het paneel bovenaan staat (PO 2026-10-07: een strook histogram bleef in beeld, kaart bleef actief).
    await page.addStyleTag({ content: '.forecast-panel { height: calc(100vh - 56px) !important; min-height: 0 !important; }' })
    await page.mouse.move(195, 400)
    await page.mouse.wheel(0, 2_000)
    await expect(page.locator('.app-shell')).toHaveClass(/table-view-open/)
    await expect(page.locator('.app-shell')).toHaveClass(/table-scroll-open/)
    await expect(page.getByRole('button', { name: 'Tabel' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.map-shell')).toHaveAttribute('data-rendering', 'false')
    expect(await page.locator('.forecast-panel').evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBeGreaterThan(2)

    // Terug via de pagina zelf: het wiel boven de open tabel scrolt de rijen.
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(page.locator('.app-shell')).not.toHaveClass(/table-view-open/)
    await expect(page.locator('.map-shell')).toHaveAttribute('data-rendering', 'true')
  })

  test('the table preview tweens to the cursor hour while a finger drags the scrubber (U62)', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('tr.current-hour')).toBeAttached()
    await expect(page.locator('.map-splash.ready')).toBeAttached()
    const slider = page.getByRole('slider', { name: 'Tijd' })
    if (await slider.getAttribute('data-playing') !== null) await slider.press(' ')
    await expect.poll(() => previewOffset(page)).toBe(0)

    // Firefox voor Android voert een native smooth scroll niet uit zolang er een vinger op het scherm ligt
    // (PO 2026-10-08); de piep mag er dus niet van afhangen. Leg elke native aanroep en elke positie vast.
    await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>('.table-scroll')!
      const trace = { smoothCalls: 0, tops: [] as number[], running: true }
      ;(window as unknown as { tableTrace: typeof trace }).tableTrace = trace
      const nativeScrollTo = scroller.scrollTo.bind(scroller)
      scroller.scrollTo = ((options?: ScrollToOptions | number, y?: number) => {
        if (typeof options === 'object' && options.behavior === 'smooth') trace.smoothCalls++
        if (typeof options === 'number') nativeScrollTo(options, y ?? 0)
        else nativeScrollTo(options)
      }) as typeof scroller.scrollTo
      const sample = () => {
        trace.tops.push(Math.round(scroller.scrollTop))
        if (trace.running) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })

    const box = (await page.locator('.scrub-surface').boundingBox())!
    const touchY = box.y + box.height / 2
    const startX = box.x + box.width - 30
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y: touchY }] })
    // Anderhalf uur naar links slepen: de cursor passeert minstens één uurgrens.
    const dragPx = -box.width / 8 * 1.5
    for (let step = 1; step <= 20; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: startX + dragPx * step / 20, y: touchY }] })
      await page.waitForTimeout(30)
    }
    // De vinger ligt er nog op: de rij van het nieuwe cursoruur moet nu al op zijn plek komen.
    await expect.poll(() => previewOffset(page)).toBe(0)
    const trace = await page.evaluate(() => {
      const recorded = (window as unknown as { tableTrace: { smoothCalls: number; tops: number[]; running: boolean } }).tableTrace
      recorded.running = false
      return recorded
    })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

    expect(trace.smoothCalls).toBe(0)
    const distinctPositions = new Set(trace.tops)
    expect(Math.max(...trace.tops) - Math.min(...trace.tops)).toBeGreaterThan(20)
    // Een sprong geeft twee posities; een tween een reeks.
    expect(distinctPositions.size).toBeGreaterThan(4)
  })
})
