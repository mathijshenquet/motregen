// U62: desktop-controlebeeld van de scrubber. Gebruik: pnpm exec tsx tmp/u62/desktop-shot.ts <baseURL> <label>
import { chromium } from '@playwright/test'
const [baseURL = 'http://127.0.0.1:4320', label = 'desktop'] = process.argv.slice(2)
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto(baseURL)
await page.getByTestId('sky').waitFor({ state: 'attached', timeout: 60_000 })
await page.waitForTimeout(8_000)
await page.screenshot({ path: new URL(`./out/${label}.png`, import.meta.url).pathname })
await browser.close()
