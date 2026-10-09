import { expect, test } from '@playwright/test'
import { useOwnBasemap } from './basemap-fixture'

test('cursor en histogram wachten op de eerste regen en de zichtbare onthulling', async ({ page }) => {
  await useOwnBasemap(page)
  let releaseHeader!: () => void
  const headerGate = new Promise<void>((resolve) => { releaseHeader = resolve })
  await page.route('**/*.pmtiles', async (route) => {
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
  expect(snapshot.mapRevealedMs).toBeGreaterThanOrEqual(snapshot.firstRainMs!)
  expect(snapshot.firstCursorMs).toBeGreaterThanOrEqual(snapshot.mapRevealedMs!)
  expect(snapshot.ttfpMs).toBeGreaterThanOrEqual(snapshot.firstCursorMs!)
  await expect(page.locator('.map-splash')).toBeHidden()
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
