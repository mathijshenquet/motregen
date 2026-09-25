import { expect, test, type Page } from '@playwright/test'
import { applyEmulation, performanceProfile } from './profiles'

const shell = (page: Page) => page.locator('.map-shell')
const heading = (page: Page) => page.locator('.temperature-focus')
const windHeading = (page: Page) => page.locator('.wind-focus')
const weatherHeading = (page: Page) => page.getByRole('button', { name: 'Weer' })
const windIntensity = async (page: Page) => Number(await shell(page).getAttribute('data-wind-intensity'))

async function ready(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  await expect(page.locator('.temperature-cell').first()).toBeVisible()
  await expect(shell(page)).toHaveAttribute('data-focus', '0.00')
  await expect(shell(page)).toHaveAttribute('data-wind-focus', '0.00')
}

async function fps(page: Page): Promise<number | null> {
  await page.waitForTimeout(2_200)
  return page.evaluate(() => (window as typeof window & { __motregenPerf: { snapshot: () => { fps: number | null } } }).__motregenPerf.snapshot().fps)
}

test('hovering the feels-like column fades isolines in and the context out, and back', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'muishover is een desktopgedrag; touch heeft een eigen test')
  await page.emulateMedia({ colorScheme: 'light' })
  await ready(page)
  await heading(page).hover()
  // Halverwege de 250 ms-tween hoort de waarde strikt tussen 0 en 1 te liggen.
  await expect.poll(async () => Number(await shell(page).getAttribute('data-focus'))).toBeGreaterThan(0)
  await expect(shell(page)).toHaveAttribute('data-focus', '1.00')
  await expect.poll(async () => Number(await shell(page).getAttribute('data-isolines'))).toBeGreaterThan(0)
  await expect.poll(() => page.locator('.isoline-label').count()).toBeGreaterThan(0)
  await page.screenshot({ path: testInfo.outputPath('focus-light.png') })

  await page.mouse.move(5, 5)
  await expect(shell(page)).toHaveAttribute('data-focus', '0.00')
  // Na de uitfade wordt de bron geleegd: een volgende hover laat geen verouderde lijnen invaden.
  await expect(shell(page)).toHaveAttribute('data-isolines', '0')
  await expect(page.locator('.isoline-label')).toHaveCount(0)

  await page.locator('.temperature-cell').nth(5).hover()
  await expect(shell(page)).toHaveAttribute('data-focus', '1.00')
  await page.mouse.move(5, 5)
  await expect(shell(page)).toHaveAttribute('data-focus', '0.00')
})

test('keyboard focus on the column heading counts as hover; reduced motion jumps', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'één profiel volstaat voor toetsenbord en reduced motion')
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await ready(page)
  await heading(page).focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(heading(page)).toBeFocused()
  // Onder reduced motion is er geen tussenwaarde: meteen 1.
  expect(await shell(page).getAttribute('data-focus')).toBe('1.00')
  await expect.poll(async () => Number(await shell(page).getAttribute('data-isolines'))).toBeGreaterThan(0)
  await page.screenshot({ path: testInfo.outputPath('focus-dark.png') })
  // De volgende kop met focusmodus is Wind: toetsenbordfocus wisselt direct van modus.
  await page.keyboard.press('Tab')
  await expect(windHeading(page)).toBeFocused()
  expect(await shell(page).getAttribute('data-focus')).toBe('0.00')
  expect(await shell(page).getAttribute('data-wind-focus')).toBe('1.00')
  await page.keyboard.press('Tab')
  expect(await shell(page).getAttribute('data-wind-focus')).toBe('0.00')
})

test('hovering the city temperature labels on the map does not trigger focus', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'muishover is een desktopgedrag')
  // Elke mousemove laat MapLibre de symbolen bevragen; op een drukke host kost de veeg ~40 s.
  test.setTimeout(120_000)
  await ready(page)
  await expect.poll(async () => Number(await shell(page).getAttribute('data-focus'))).toBe(0)
  // Veeg de muis in een fijn raster over al het zichtbare kaartcanvas, zodat hij over elk stadslabel komt.
  // Per rij één move met tussenstappen: een roundtrip per punt kost bijna een minuut.
  const runs = await page.evaluate(() => {
    const shellElement = document.querySelector<HTMLElement>('.map-shell')!
    const canvas = document.querySelector('.maplibregl-canvas')!
    const box = canvas.getBoundingClientRect()
    const found: Array<{ y: number; from: number; to: number; points: number }> = []
    for (let y = box.top + 4; y < box.bottom; y += 14) {
      let run: { y: number; from: number; to: number; points: number } | undefined
      for (let x = box.left + 4; x < box.right; x += 22) {
        if (document.elementFromPoint(x, y) !== canvas) { run = undefined; continue }
        if (run) { run.to = x; run.points++ } else found.push(run = { y, from: x, to: x, points: 1 })
      }
    }
    const state = window as typeof window & { __maxFocus: number }
    state.__maxFocus = 0
    new MutationObserver(() => { state.__maxFocus = Math.max(state.__maxFocus, Number(shellElement.dataset.focus)) })
      .observe(shellElement, { attributes: true, attributeFilter: ['data-focus'] })
    return found
  })
  expect(runs.reduce((sum, run) => sum + run.points, 0)).toBeGreaterThan(400)
  for (const run of runs) {
    await page.mouse.move(run.from, run.y)
    if (run.points > 1) await page.mouse.move(run.to, run.y, { steps: run.points - 1 })
  }
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => (window as typeof window & { __maxFocus: number }).__maxFocus)).toBe(0)
  await expect(shell(page)).toHaveAttribute('data-focus', '0.00')
})

test('hovering the wind column brings the damped wind to full strength and dims nothing', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'muishover is een desktopgedrag; touch heeft een eigen test')
  await ready(page)
  const damped = await windIntensity(page)
  expect(damped).toBeCloseTo(0.75, 2)
  await windHeading(page).hover()
  await expect.poll(async () => Number(await shell(page).getAttribute('data-wind-focus'))).toBeGreaterThan(0)
  await expect(shell(page)).toHaveAttribute('data-wind-focus', '1.00')
  expect(await windIntensity(page)).toBeCloseTo(1.905, 1)
  expect(await shell(page).getAttribute('data-focus')).toBe('0.00')
  await page.screenshot({ path: testInfo.outputPath('wind-focus.png') })
  await page.mouse.move(5, 5)
  await expect(shell(page)).toHaveAttribute('data-wind-focus', '0.00')
  expect(await windIntensity(page)).toBeCloseTo(damped, 2)

  await page.locator('.wind-cell').nth(5).hover()
  await expect(shell(page)).toHaveAttribute('data-wind-focus', '1.00')
  await page.mouse.move(5, 5)
  await expect(shell(page)).toHaveAttribute('data-wind-focus', '0.00')
})

test('the two focus modes exclude each other: the last one wins, a pin returns afterwards', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'één profiel volstaat voor de modusregel')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await ready(page)
  await heading(page).click()
  await heading(page).blur()
  await page.mouse.move(5, 5)
  await expect(shell(page)).toHaveAttribute('data-focus', '1.00')
  await page.locator('.wind-cell').nth(3).hover()
  await expect(shell(page)).toHaveAttribute('data-wind-focus', '1.00')
  await expect(shell(page)).toHaveAttribute('data-focus', '0.00')
  await page.mouse.move(5, 5)
  await expect(shell(page)).toHaveAttribute('data-wind-focus', '0.00')
  await expect(shell(page)).toHaveAttribute('data-focus', '1.00')
  // Wind vastzetten maakt de temperatuurpin los.
  await windHeading(page).click()
  await windHeading(page).blur()
  await page.mouse.move(5, 5)
  await expect(windHeading(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(heading(page)).toHaveAttribute('aria-pressed', 'false')
  await expect(shell(page)).toHaveAttribute('data-wind-focus', '1.00')
  await expect(shell(page)).toHaveAttribute('data-focus', '0.00')
  // Weer is de standaardmodus: geen toestand om aan te zetten, een klik haalt de pin weg.
  await expect(weatherHeading(page)).not.toHaveAttribute('aria-pressed')
  await weatherHeading(page).click()
  await page.mouse.move(5, 5)
  await expect(windHeading(page)).toHaveAttribute('aria-pressed', 'false')
  await expect(shell(page)).toHaveAttribute('data-wind-focus', '0.00')
  await expect(shell(page)).toHaveAttribute('data-focus', '0.00')
})

test('tapping the wind heading pins wind focus on touch', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-4g', 'touchroute op het mobiele profiel')
  await ready(page)
  await windHeading(page).tap()
  await expect(windHeading(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(shell(page)).toHaveAttribute('data-wind-focus', '1.00')
  expect(await shell(page).getAttribute('data-focus')).toBe('0.00')
  await windHeading(page).tap()
  await expect(windHeading(page)).toHaveAttribute('aria-pressed', 'false')
  await expect(shell(page)).toHaveAttribute('data-wind-focus', '0.00')
  await windHeading(page).tap()
  await weatherHeading(page).tap()
  await expect(windHeading(page)).toHaveAttribute('aria-pressed', 'false')
  await expect(shell(page)).toHaveAttribute('data-wind-focus', '0.00')
})

test('tapping the column heading pins focus on touch, and measures frame rate', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-4g', 'touchroute op het mobiele profiel')
  const cdp = await page.context().newCDPSession(page)
  await applyEmulation(cdp, performanceProfile(testInfo.project.name))
  await ready(page)
  const baseline = await fps(page)
  await heading(page).tap()
  await expect(heading(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(shell(page)).toHaveAttribute('data-focus', '1.00')
  await expect.poll(async () => Number(await shell(page).getAttribute('data-isolines')), { timeout: 20_000 }).toBeGreaterThan(0)
  const focused = await fps(page)
  await page.screenshot({ path: testInfo.outputPath('focus-mobile.png') })
  // Alleen loggen: headless SwiftShader is geen GPU-gate (docs/perf.md).
  console.log(`[focus] ${testInfo.project.name} fps buiten focus ${baseline}, in focus ${focused}`)
  testInfo.annotations.push({ type: 'fps', description: `buiten ${baseline}, in focus ${focused}` })
  await heading(page).tap()
  await expect(heading(page)).toHaveAttribute('aria-pressed', 'false')
  await expect(shell(page)).toHaveAttribute('data-focus', '0.00')
})

const saturation = (page: Page) => page.evaluate(() => Number(getComputedStyle(document.querySelector('.map-shell')!).getPropertyValue('--map-saturation') || 1))
const fillCoverage = (page: Page) => page.evaluate(() => (window as typeof window & { __motregenIsolines: () => { fillCoverage: () => number } }).__motregenIsolines().fillCoverage())

test('temperature focus desaturates only the basemap canvas and fills the bands, and both go away again', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'één profiel volstaat')
  await ready(page)
  expect(await saturation(page)).toBe(1)
  expect(await page.locator('.maplibregl-canvas').evaluate((canvas) => getComputedStyle(canvas).filter)).toBe('none')
  await page.getByRole('button', { name: 'Pauzeren' }).first().click({ force: true })
  await heading(page).click()
  await heading(page).blur()
  await page.mouse.move(5, 5)
  await expect(shell(page)).toHaveAttribute('data-focus', '1.00')
  await expect.poll(() => saturation(page)).toBeCloseTo(0.55, 2)
  expect(await page.locator('.maplibregl-canvas').evaluate((canvas) => getComputedStyle(canvas).filter)).toMatch(/^saturate\(0\.\d+\)$/)
  // De overlays (regen, wind, isolijnen) zijn eigen canvassen en blijven verzadigd.
  for (const filter of await page.locator('.map-overlay').evaluateAll((canvases) => canvases.map((canvas) => getComputedStyle(canvas).filter))) expect(filter).toBe('none')
  await expect.poll(() => fillCoverage(page)).toBeGreaterThan(0.005)
  // Legenda: het gerekte bereik (hele graden, ≥ 8 °C breed), een blok per band.
  const legend = page.locator('.temperature-legend')
  await expect(legend).toBeVisible()
  const range = await page.evaluate(() => (window as typeof window & { __motregenIsolines: () => { paletteRange?: { low: number; high: number } } }).__motregenIsolines().paletteRange)
  expect(range!.high - range!.low).toBeGreaterThanOrEqual(8)
  await expect(legend).toHaveAttribute('aria-label', `Kleurschaal gevoelstemperatuur ${range!.low} tot ${range!.high} graden`)
  await expect(legend.locator('.temperature-legend-bar i')).toHaveCount(range!.high - range!.low)
  await page.screenshot({ path: testInfo.outputPath('focus-fill.png') })

  await heading(page).click()
  await heading(page).blur()
  await page.mouse.move(5, 5)
  await expect(shell(page)).toHaveAttribute('data-focus', '0.00')
  // data-focus rondt af; de tween loopt nog een paar frames door.
  await expect.poll(() => saturation(page)).toBe(1)
  expect(await page.locator('.maplibregl-canvas').evaluate((canvas) => getComputedStyle(canvas).filter)).toBe('none')
  await expect.poll(() => fillCoverage(page)).toBe(0)
  await expect(page.locator('.temperature-legend')).toHaveCount(0)
})

test('pinned focus at rest does no contour or worker work', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'structurele teller, één profiel volstaat')
  await ready(page)
  await page.getByRole('button', { name: 'Pauzeren' }).first().click({ force: true })
  await heading(page).click()
  await expect(shell(page)).toHaveAttribute('data-focus', '1.00')
  await expect.poll(() => page.locator('.isoline-label').count()).toBeGreaterThan(0)
  await page.waitForTimeout(1_000)
  const counters = () => page.evaluate(() => (window as typeof window & { __motregenIsolines: () => { passes: number; fillPasses: number; labelRounds: number } }).__motregenIsolines())
  const before = await counters()
  expect(before.fillPasses).toBeGreaterThan(0)
  await page.waitForTimeout(2_000)
  const after = await counters()
  expect(after.passes).toBe(before.passes)
  expect(after.fillPasses).toBe(before.fillPasses)
  expect(after.labelRounds).toBe(before.labelRounds)
})

type IsolineCounters = { passes?: number; uploads?: number; labelRounds: number; repaints: number }
const isolineCounters = (page: Page) => page.evaluate(() => (window as typeof window & { __motregenIsolines: () => IsolineCounters }).__motregenIsolines())

test('pinned isolines re-render after a manifest refresh with a new run and after a scroll-zoom, then rest again', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'structurele teller, één profiel volstaat')
  let newRun = false
  await page.route('**/manifest.json', async (route) => {
    const response = await route.fetch()
    const manifest = await response.json() as { generated: string; chunks: Array<{ url: string; field?: string }> }
    if (newRun) {
      // Een nieuwe run bij gelijke tijdlijnlengte: andere chunk-URL's, dezelfde frames.
      manifest.generated = new Date(Date.parse(manifest.generated) + 60_000).toISOString()
      for (const chunk of manifest.chunks) if (chunk.field === 'feels_like_c') chunk.url += '?run=2'
    }
    await route.fulfill({ response, json: manifest })
  })
  await ready(page)
  await page.getByRole('button', { name: 'Pauzeren' }).first().click({ force: true })
  await heading(page).click()
  await heading(page).blur()
  await page.mouse.move(5, 5)
  await expect(shell(page)).toHaveAttribute('data-focus', '1.00')
  await expect.poll(() => page.locator('.isoline-label').count()).toBeGreaterThan(0)
  await page.waitForTimeout(1_000)

  const rest = await isolineCounters(page)
  await page.waitForTimeout(1_500)
  expect((await isolineCounters(page)).passes).toBe(rest.passes)

  newRun = true
  await page.locator('.freshness-trigger').first().click()
  await page.locator('.freshness-refresh').click()
  await page.keyboard.press('Escape')
  await page.mouse.move(5, 5)
  // De uurlagen van de nieuwe run worden opnieuw geüpload en de snede opnieuw getekend.
  await expect.poll(async () => (await isolineCounters(page)).uploads ?? 0).toBeGreaterThan(rest.uploads ?? 0)
  await expect.poll(async () => (await isolineCounters(page)).passes ?? 0).toBeGreaterThan(rest.passes ?? 0)

  const refreshed = await isolineCounters(page)
  const map = page.locator('.maplibregl-canvas')
  const box = (await map.boundingBox())!
  // Scroll-zoom: op minimale zoom houdt de contain-grens (U6) de kaart vast, pannen verschuift niets.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -300)
  await page.mouse.move(5, 5)
  await expect.poll(async () => (await isolineCounters(page)).passes ?? 0).toBeGreaterThan(refreshed.passes ?? 0)

  await page.waitForTimeout(1_000)
  const settled = await isolineCounters(page)
  await page.waitForTimeout(1_500)
  const after = await isolineCounters(page)
  expect(after.passes).toBe(settled.passes)
  expect(after.labelRounds).toBe(settled.labelRounds)
  // Wind en regen tekenen op eigen canvassen: de kaart zelf rendert in rust niet.
  expect(after.repaints).toBe(settled.repaints)
})
