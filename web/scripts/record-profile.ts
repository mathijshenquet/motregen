import { chromium } from '@playwright/test'

const origin = process.argv[2] ?? 'http://127.0.0.1:4330'
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })

try {
  await page.goto(`${origin}/?perf`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.waitForFunction(() => {
    const state = window as typeof window & { __motregenPerf?: { snapshot: () => { ttfrMs: number | null } } }
    return state.__motregenPerf?.snapshot().ttfrMs != null
  }, undefined, { timeout: 120_000 })
  const profilerAvailable = await page.evaluate(() => 'Profiler' in globalThis)
  await page.getByRole('button', { name: 'Opname 30 s' }).click()

  const wind = page.getByRole('button', { name: 'Wind' })
  if (await wind.isVisible()) await wind.click({ force: true })
  await page.waitForTimeout(2_000)
  const feelsLike = page.getByRole('button', { name: 'Gevoel' })
  if (await feelsLike.isVisible()) await feelsLike.click({ force: true })
  await page.waitForTimeout(2_000)
  const map = page.locator('.maplibregl-canvas')
  if (await map.isVisible()) {
    await map.hover({ position: { x: 320, y: 240 } })
    await page.mouse.wheel(0, -400)
  }
  const scrubber = page.getByRole('slider', { name: 'Tijd' })
  await scrubber.focus()
  await scrubber.press('Home')
  for (let step = 0; step < 20; step++) await scrubber.press('ArrowRight')

  await page.locator('.perf-recording').getByText(/Opname gereed/).waitFor({ timeout: 45_000 })
  await page.getByRole('button', { name: 'Stuur' }).click()
  await page.locator('.perf-recording').getByText(/Verstuurd als/).waitFor({ timeout: 15_000 })
  const result = await page.evaluate((apiAvailable) => {
    const snapshot = (window as typeof window & { __motregenPerf: { snapshot: () => unknown } }).__motregenPerf.snapshot()
    return { profilerAvailable: apiAvailable, snapshot }
  }, profilerAvailable)
  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser.close()
}
