import { expect, test, type Page } from '@playwright/test'
import type { LoadTraceSnapshot } from '../src/core/perf'

// Een krap apparaat (U49) zonder UA-sniffing: vier kernen volstaat voor de budgetregel, en in het
// smalle venster liggen de tabelrijen onder de vouw, zoals op een telefoon.
test.use({ viewport: { width: 393, height: 727 } })

interface PerfWindow {
  __motregenPerf?: { snapshot: () => { ttfrMs: number | null }; loads: { snapshot: () => LoadTraceSnapshot } }
}

async function decodedFrames(page: Page): Promise<Array<{ chunk: string; frameIndex: number }>> {
  return page.evaluate(() => (window as unknown as PerfWindow).__motregenPerf!.loads.snapshot().frames
    .filter((frame) => frame.decodedMs !== undefined)
    .map((frame) => ({ chunk: new URL(frame.url).pathname.split('/').at(-1)!, frameIndex: frame.frameIndex })))
}

const ofField = (frames: Array<{ chunk: string }>, field: string) => frames.filter((frame) => frame.chunk.startsWith(`${field}-`))

test('a constrained device decodes only what the scrubber and the table show', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 }))
  await page.goto('/')
  await page.waitForFunction(() => (window as unknown as PerfWindow).__motregenPerf?.snapshot().ttfrMs != null)
  // Het zichtbare venster vult zich; daarna komt er zonder interactie alleen nog afspeelwerk bij.
  await expect.poll(async () => ofField(await decodedFrames(page), 'cloud_low').length, { timeout: 20_000 }).toBeGreaterThan(0)
  await page.waitForTimeout(3_000)

  const passive = await decodedFrames(page)
  // Tabelvelden: niets zolang de rijen onder de vouw liggen.
  expect(ofField(passive, 'rel_humidity')).toHaveLength(0)
  expect(ofField(passive, 'cloud_frac')).toHaveLength(0)
  expect(ofField(passive, 'radiation')).toHaveLength(0)
  // Wolkenlagen: het scrubbervenster (8 u + speling), niet alle 52 uurframes.
  expect(ofField(passive, 'cloud_low').length).toBeLessThan(20)
  // Vóór U49 decodeerde dezelfde passieve start hier ruim 400 frames.
  expect(passive.length).toBeLessThan(180)

  // De tabel in beeld: nu pas laden de rijen, en ze vullen zich.
  await page.locator('.forecast-table tbody tr.current-hour').scrollIntoViewIfNeeded()
  await expect.poll(async () => ofField(await decodedFrames(page), 'rel_humidity').length, { timeout: 20_000 }).toBeGreaterThan(0)
  await expect(page.locator('.forecast-table tbody tr.current-hour')).not.toHaveClass(/pending-hour/, { timeout: 20_000 })

  // Ver weg scrubben: het venster volgt de cursor en het laatste regenframe komt alsnog.
  const before = await decodedFrames(page)
  expect(before.some((frame) => frame.chunk === 'harmonie-20260828T1200.mrf' && frame.frameIndex === 47)).toBe(false)
  const scrubber = page.getByRole('slider', { name: 'Tijd' })
  await scrubber.focus()
  await scrubber.press('End')
  await expect.poll(async () => (await decodedFrames(page)).some((frame) => frame.chunk === 'harmonie-20260828T1200.mrf' && frame.frameIndex === 47), { timeout: 20_000 }).toBe(true)
  await expect.poll(async () => ofField(await decodedFrames(page), 'cloud_low').length, { timeout: 20_000 }).toBeGreaterThan(ofField(before, 'cloud_low').length)
})
