import { chromium } from '@playwright/test'

// Telefoonscreenshot van een willekeurige modus (DPR 3), gepauzeerd. Voor modi zonder windzakken, waar
// windsock-shot.ts op wacht.
// usage: xvfb-run -a pnpm exec tsx scripts/mode-shot.ts ORIGIN PAD UIT.png [--theme=licht|donker]
//   PAD bijv. '/lucht?dev&camera=4.95,52.3,8.4&t=%2B9u'
const [origin, path, output] = process.argv.slice(2)
if (!origin || !path || !output) throw new Error('usage: pnpm exec tsx scripts/mode-shot.ts ORIGIN PAD UIT.png [--theme=licht|donker]')
const theme = process.argv.find((argument) => argument.startsWith('--theme='))?.slice('--theme='.length) ?? 'licht'

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 402, height: 844 }, deviceScaleFactor: 3, hasTouch: true, reducedMotion: 'reduce',
  colorScheme: theme === 'donker' ? 'dark' : 'light', timezoneId: 'Europe/Amsterdam',
})
const page = await context.newPage()
await page.goto(new URL(path, origin).href)
await page.locator('details.dev-panel').evaluate((panel) => panel.removeAttribute('open')).catch(() => {})
await page.locator('.clock-play, .clock-pause').first().waitFor({ state: 'visible', timeout: 120_000 })
if (!await page.locator('.clock-play').isVisible()) await page.locator('.freshness-trigger').press(' ')
await page.locator('.freshness-close').click({ timeout: 1_000 }).catch(() => {})
// Kaarttegels, labels en de stadstemperaturen laden na de klok.
await page.waitForTimeout(8_000)
await page.screenshot({ path: output })
await browser.close()
