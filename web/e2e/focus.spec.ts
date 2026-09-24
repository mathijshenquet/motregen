import { expect, test, type Page } from '@playwright/test'
import { applyEmulation, performanceProfile } from './profiles'

const shell = (page: Page) => page.locator('.map-shell')
const heading = (page: Page) => page.locator('.temperature-focus')

async function ready(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  await expect(page.locator('.temperature-cell').first()).toBeVisible()
  await expect(shell(page)).toHaveAttribute('data-focus', '0.00')
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
  await page.keyboard.press('Tab')
  expect(await shell(page).getAttribute('data-focus')).toBe('0.00')
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

test('pinned focus at rest does no contour or worker work', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'structurele teller, één profiel volstaat')
  await ready(page)
  await page.getByRole('button', { name: 'Pauzeren' }).first().click({ force: true })
  await heading(page).click()
  await expect(shell(page)).toHaveAttribute('data-focus', '1.00')
  await expect.poll(() => page.locator('.isoline-label').count()).toBeGreaterThan(0)
  await page.waitForTimeout(1_000)
  const counters = () => page.evaluate(() => (window as typeof window & { __motregenIsolines: () => { passes: number; labelRounds: number } }).__motregenIsolines())
  const before = await counters()
  await page.waitForTimeout(2_000)
  const after = await counters()
  expect(after.passes).toBe(before.passes)
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
