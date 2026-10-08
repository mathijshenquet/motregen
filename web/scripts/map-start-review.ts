import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { chromium } from '@playwright/test'

const [origin, prefix, mode] = process.argv.slice(2)
if (!origin || !prefix || mode !== 'tegel') throw new Error('Gebruik: map-start-review.ts ORIGIN PREFIX tegel')
mkdirSync(dirname(prefix), { recursive: true })
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
try {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block', colorScheme: theme as 'light' | 'dark' })
    try {
      const page = await context.newPage()
      await page.addInitScript({ content: `
        const NativeDate = Date;
        const fixedEpoch = NativeDate.parse('2026-08-28T15:00:00Z');
        globalThis.Date = new Proxy(NativeDate, {
          construct: (target, args) => Reflect.construct(target, args.length ? args : [fixedEpoch]),
          apply: () => new NativeDate(fixedEpoch).toString(),
          get: (target, property, receiver) => property === 'now' ? () => fixedEpoch : Reflect.get(target, property, receiver),
        });
        localStorage.setItem('motregen-theme', '${theme}');
      ` })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      let releaseTiles!: () => void
      const tilesReady = new Promise<void>((resolve) => { releaseTiles = resolve })
      await page.route('**/*.pmtiles', async (route) => { await tilesReady; await route.continue() })
      await page.goto(`${origin}/weer?perf=1&dev&kaartstart=${mode}`, { waitUntil: 'domcontentloaded' })
      await page.locator('.dev-group > summary', { hasText: 'Diagnose' }).click()
      await page.getByTestId('dev-panel').getByRole('checkbox', { name: /Perf-HUD/ }).uncheck()
      await page.locator('.dev-panel > summary').click()
      await page.waitForFunction(() => window.__motregenPerf?.snapshot().firstRainMs != null)
      await page.waitForTimeout(300)
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
