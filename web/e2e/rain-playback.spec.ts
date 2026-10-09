import { expect, test } from '@playwright/test'
import type { Manifest } from '../src/core/contract'
import { parseMrfHeader } from '../src/core/mrf'
import { buildTimeline } from '../src/core/time-model'

test('de klok wacht op het volgende regenframe, ook na de eerste regentekening', async ({ page }) => {
  const manifest = await (await page.request.get('/data/manifest.json')).json() as Manifest
  const frames = buildTimeline(manifest)
  const currentIndex = frames.findLastIndex((frame) => frame.epoch <= Date.parse(manifest.now))
  const nextFrame = frames[currentIndex + 1]!
  const response = await page.request.get(`/data/${nextFrame.chunk.url}`, { headers: { Range: `bytes=0-${nextFrame.chunk.header_len - 1}` } })
  const header = parseMrfHeader(new Uint8Array(await response.body()))
  const next = header.frames[nextFrame.frameIndex]!
  const start = nextFrame.chunk.header_len + next.offset
  const end = start + next.len - 1
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/*.mrf', async (route) => {
    const range = /^bytes=(\d+)-(\d+)$/.exec(route.request().headers().range ?? '')
    if (new URL(route.request().url()).pathname.endsWith(`/${nextFrame.chunk.url}`)
      && range && Number(range[1]) <= end && Number(range[2]) >= start) await gate
    await route.continue()
  })
  await page.goto('/?perf=1', { waitUntil: 'commit' })
  try {
    await page.waitForFunction(() => window.__motregenPerf?.snapshot().firstRainMs != null)
    await page.waitForTimeout(500)
    expect(await page.evaluate(() => window.__motregenPerf!.snapshot().firstCursorMs)).toBeNull()
    expect(await page.locator('.chart-track').evaluate((element) => element.getAnimations().length)).toBe(0)
  } finally {
    release()
  }
  await page.waitForFunction(() => window.__motregenPerf?.snapshot().firstCursorMs != null)
  const draws = await page.evaluate(() => window.__motregenPerf!.traceSlice(0, performance.now()).measures.filter((measure) => measure.phase === 'rain-frame-committed'))
  expect(draws.length).toBeGreaterThan(1)
  const firstMotion = draws.find((draw) => draw.detail!.epoch !== draws[0]!.detail!.epoch)!
  expect(firstMotion.detail!.cursor).toBeCloseTo(Number(firstMotion.detail!.left) + (Number(firstMotion.detail!.right) - Number(firstMotion.detail!.left)) * Number(firstMotion.detail!.mix), 8)
})

for (const fallback of [false, true]) {
  test(`elke afspeeltik toont dezelfde cursor en regenstand${fallback ? ' zonder overlay-WebGL' : ''}`, async ({ page }) => {
    if (fallback) await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (...args: Parameters<typeof getContext>) {
        if (this.classList.contains('map-overlay-motregen-rain')) return null
        return getContext.apply(this, args)
      } as typeof getContext
    })
    await page.goto('/?perf=1', { waitUntil: 'commit' })
    await page.waitForFunction(() => window.__motregenPerf?.snapshot().ttfpMs != null)
    await page.waitForTimeout(1_000)
    const draws = await page.evaluate(() => window.__motregenPerf!.traceSlice(0, performance.now()).measures.filter((measure) => measure.phase === 'rain-frame-committed'))
    expect(draws.length).toBeGreaterThan(2)
    for (const draw of draws) {
      const detail = draw.detail!
      expect(detail.cursor).toBeCloseTo(Number(detail.left) + (Number(detail.right) - Number(detail.left)) * Number(detail.mix), 8)
    }
    expect(await page.locator('.chart-track').evaluate((element) => element.getAnimations().length)).toBe(0)
    const firstMotion = draws.find((draw) => draw.detail!.epoch !== draws[0]!.detail!.epoch)!
    const snapshot = await page.evaluate(() => window.__motregenPerf!.snapshot())
    expect(firstMotion.startTime - snapshot.firstCursorMs!).toBeLessThan(50)
    if (fallback) await expect(page.locator('.map-overlay-motregen-rain')).toHaveCount(0)
  })
}
