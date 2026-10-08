// U62: het lege scrubber-kader tijdens het laden (Kaderhemel vast aan). De data komt vertraagd binnen, zodat
// het kader zonder wolkenlagen in beeld is. Gebruik: pnpm exec tsx tmp/u62/frame-sky-shot.ts <baseURL>
import { chromium, devices } from '@playwright/test'
const [baseURL = 'http://127.0.0.1:4320'] = process.argv.slice(2)
const outputDir = new URL('./out/', import.meta.url).pathname
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
for (const [name, options] of [['390', { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } }], ['desktop', { viewport: { width: 1280, height: 800 } }]] as const) {
  const page = await (await browser.newContext(options)).newPage()
  // Alleen de chunks vertragen: het manifest komt door, de reeksen nog niet.
  await page.route('**/data/**/*.mrf*', async (route) => { await new Promise((resolve) => setTimeout(resolve, 8_000)); await route.continue() })
  await page.goto(`${baseURL}/weer`)
  await page.locator('.scrub-surface').waitFor({ state: 'attached', timeout: 60_000 })
  await page.waitForTimeout(4_000)
  const state = await page.evaluate(() => ({ sky: Boolean(document.querySelector('[data-testid=sky]')), loading: document.querySelector('.scrubber-placeholder')?.textContent ?? '', bars: document.querySelectorAll('.rain-bar:not(.pending)').length }))
  await page.locator('.scrubber').screenshot({ path: `${outputDir}kaderhemel-${name}.png` })
  console.log(`${name}: hemel ${state.sky}, melding "${state.loading}", geladen regenbalken ${state.bars}`)
  await page.close()
}
await browser.close()
