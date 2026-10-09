import { expect, test } from '@playwright/test'
import { useOwnBasemap } from './basemap-fixture'

test('cursor en histogram wachten op de eerste regen', async ({ page }) => {
  await useOwnBasemap(page)
  let releaseHeader!: () => void
  const headerGate = new Promise<void>((resolve) => { releaseHeader = resolve })
  await page.route('**/*.mrf', async (route) => {
    if (route.request().headers().range?.startsWith('bytes=0-')) await headerGate
    await route.continue()
  })
  await page.goto('/?perf=1', { waitUntil: 'commit' })
  const slider = page.getByRole('slider', { name: 'Tijd' })
  try {
    await expect(slider).toHaveAttribute('aria-valuemax', /[1-9]\d*/)
    const cursor = await slider.getAttribute('aria-valuenow')
    await expect(slider).not.toHaveAttribute('data-playing', '')
    expect(await slider.evaluate((element) => element.querySelector('.chart-track')!.getAnimations().length)).toBe(0)
    await page.waitForTimeout(500)
    await expect(slider).toHaveAttribute('aria-valuenow', cursor!)
    expect(await page.evaluate(() => window.__motregenPerf?.snapshot().firstRainMs)).toBeNull()
  } finally {
    releaseHeader()
  }
  await page.waitForFunction(() => window.__motregenPerf?.snapshot().ttfpMs != null)
  const snapshot = await page.evaluate(() => window.__motregenPerf!.snapshot())
  expect(snapshot.firstRainMs).toBeGreaterThanOrEqual(snapshot.styleReadyMs!)
  expect(snapshot.firstCursorMs).toBeGreaterThanOrEqual(snapshot.firstRainMs!)
  expect(snapshot.ttfrMs).toBe(snapshot.firstCursorMs)
  expect(snapshot.ttfpMs).toBeGreaterThanOrEqual(snapshot.firstCursorMs!)
  await expect(page.locator('.map-splash')).toBeHidden()
})

test('de afspeelklok wacht niet op een langzame splash-onthulling', async ({ page }) => {
  await page.route('**/assets/index-*.css', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, body: `${await response.text()}\n.map-splash { --splash-reveal-duration: 5000ms; --splash-mark-duration: 5000ms; --splash-outer-delay: 0ms; --splash-outer-duration: 5000ms; }` })
  })
  await page.goto('/?perf=1', { waitUntil: 'commit' })
  await page.waitForFunction(() => window.__motregenPerf?.snapshot().ttfpMs != null)
  const snapshot = await page.evaluate(() => window.__motregenPerf!.snapshot())
  expect(snapshot.mapRevealedMs).toBeNull()
  expect(snapshot.ttfrMs).toBe(snapshot.firstCursorMs)
  await expect(page.getByRole('slider', { name: 'Tijd' })).toHaveAttribute('data-playing', '')
  await expect(page.locator('.map-splash.ready')).toBeVisible()
})

test('een pauzekeuze tijdens het laden blijft geldig zodra de kaart klaar is', async ({ page }) => {
  let releaseHeader!: () => void
  const headerGate = new Promise<void>((resolve) => { releaseHeader = resolve })
  await page.route('**/*.mrf', async (route) => {
    if (route.request().headers().range?.startsWith('bytes=0-')) await headerGate
    await route.continue()
  })
  await page.goto('/?perf=1', { waitUntil: 'commit' })
  const slider = page.getByRole('slider', { name: 'Tijd' })
  try {
    await expect(slider).toHaveAttribute('aria-valuemax', /[1-9]\d*/)
    await slider.press('Space')
  } finally {
    releaseHeader()
  }
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  const cursor = await slider.getAttribute('aria-valuenow')
  await page.waitForTimeout(500)
  await expect(slider).not.toHaveAttribute('data-playing', '')
  await expect(slider).toHaveAttribute('aria-valuenow', cursor!)
  expect(await page.evaluate(() => window.__motregenPerf!.snapshot().firstCursorMs)).toBeNull()
  await slider.press('Space')
  await page.waitForFunction(() => window.__motregenPerf?.snapshot().firstCursorMs != null)
})

test('een vertraagde eerste afspeeltik haalt de kaartopzet niet in als cursorsprong', async ({ page }) => {
  await page.addInitScript(() => {
    let initialEpoch: number | undefined
    let firstAdvance: number | undefined
    const observer = new MutationObserver(() => {
      const epoch = Number(document.querySelector<HTMLElement>('.app-shell')?.dataset.epoch)
      if (initialEpoch === undefined && document.querySelector('.map-splash.ready')) {
        initialEpoch = epoch
        const until = performance.now() + 500
        while (performance.now() < until) { /* vertraagde hoofddraad bij de kaartopzet */ }
      } else if (initialEpoch !== undefined && epoch > initialEpoch && firstAdvance === undefined) {
        firstAdvance = epoch - initialEpoch
        ;(window as unknown as { firstPlaybackAdvance: number }).firstPlaybackAdvance = firstAdvance
        observer.disconnect()
      }
    })
    document.addEventListener('DOMContentLoaded', () => observer.observe(document.documentElement, { attributes: true, subtree: true, childList: true }))
  })
  await page.goto('/?perf=1', { waitUntil: 'commit' })
  await page.waitForFunction(() => (window as unknown as { firstPlaybackAdvance?: number }).firstPlaybackAdvance !== undefined)
  const firstAdvance = await page.evaluate(() => (window as unknown as { firstPlaybackAdvance: number }).firstPlaybackAdvance)
  expect(firstAdvance).toBeLessThan(5 * 60_000)
})

test('de PMTiles-header begint vóór de HARMONIE-headerreeks', async ({ page }) => {
  await useOwnBasemap(page)
  const order: string[] = []
  page.on('request', (request) => {
    if (!request.headers().range?.startsWith('bytes=0-')) return
    const path = new URL(request.url()).pathname
    if (path.endsWith('.pmtiles') || path.includes('/harmonie-')) order.push(path)
  })
  await page.goto('/')
  await expect(page.locator('.map-splash')).toBeHidden()
  await expect.poll(() => order.some((path) => path.includes('/harmonie-'))).toBe(true)
  expect(order[0]).toMatch(/\.pmtiles$/)
})

test('de basiskaart begint met laden terwijl de regenheaders nog onderweg zijn', async ({ page }) => {
  await useOwnBasemap(page)
  let releaseHeaders!: () => void
  const headersGate = new Promise<void>((resolve) => { releaseHeaders = resolve })
  await page.route('**/*.mrf', async (route) => {
    if (route.request().headers().range?.startsWith('bytes=0-')) await headersGate
    await route.continue()
  })
  const firstBasemapRange = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith('.pmtiles'))
  await page.goto('/weer#t=%2B0u', { waitUntil: 'commit' })
  try {
    expect((await firstBasemapRange).headers().range).toMatch(/^bytes=/)
  } finally {
    releaseHeaders()
  }
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  await expect(page).toHaveURL(/\/weer\/de-bilt/)
})
