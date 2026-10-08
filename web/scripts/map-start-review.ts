import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { chromium } from '@playwright/test'

const [origin, prefix, mode] = process.argv.slice(2)
if (!origin || !prefix || !['svg', 'tegel'].includes(mode ?? '')) throw new Error('Gebruik: map-start-review.ts ORIGIN PREFIX svg|tegel')
mkdirSync(dirname(prefix), { recursive: true })
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
try {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block', colorScheme: theme as 'light' | 'dark' })
    try {
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      let releaseTiles!: () => void
      const tilesReady = new Promise<void>((resolve) => { releaseTiles = resolve })
      await page.route('**/*.pmtiles', async (route) => { await tilesReady; await route.continue() })
      await page.goto(`${origin}/weer?perf=1&dev&kaartstart=${mode}`, { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => window.__motregenPerf?.snapshot().firstRainMs != null)
      await page.screenshot({ path: `${prefix}-${theme}-voor-tegels.png` })
      releaseTiles()
      await page.waitForFunction(() => window.__motregenPerf?.snapshot().basemapReadyMs != null)
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${prefix}-${theme}-na-tegels.png` })
      if (errors.length) throw new Error(errors.join('\n'))
      console.log(`${mode}/${theme}: eerste regen vóór netwerkkaart; overgang gereed, geen pageerrors`)
    } finally {
      await context.close()
    }
  }
} finally {
  await browser.close()
}
