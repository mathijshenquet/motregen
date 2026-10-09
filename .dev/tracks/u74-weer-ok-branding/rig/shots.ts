/// <reference lib="dom" />
// Screenshots van splash, kaartbeeld en About voor de PO-blik (U74).
// Gebruik (vanuit web/, rig gekopieerd naar tmp/u74/): pnpm exec tsx tmp/u74/shots.ts [url]
// De PNG's uit tmp/u74/out/ gaan als WebP (kwaliteit 92) naar beelden/.
import { chromium } from '@playwright/test'

const url = process.argv[2] ?? 'http://127.0.0.1:4320/'
const outputDirectory = new URL('./out/', import.meta.url).pathname
const viewports = [
  { label: '1280', width: 1280, height: 800, mobile: false },
  { label: '390', width: 390, height: 844, mobile: true },
]
const themes = [
  { label: 'dag', colorScheme: 'light' as const },
  { label: 'nacht', colorScheme: 'dark' as const },
]

const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
for (const viewport of viewports) {
  for (const theme of themes) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      colorScheme: theme.colorScheme,
      deviceScaleFactor: viewport.mobile ? 2 : 1,
      isMobile: viewport.mobile,
      hasTouch: viewport.mobile,
    })
    const page = await context.newPage()
    // De app start standaard in Licht, los van het systeemthema; nacht gaat via de opgeslagen keuze.
    await page.addInitScript((choice) => localStorage.setItem('motregen-theme', choice), theme.colorScheme)
    const name = (subject: string) => `${outputDirectory}${subject}-${theme.label}-${viewport.label}.png`

    // Splash: de data vasthouden zodat de kaart niet "ready" wordt terwijl we kijken.
    let releaseData: () => void = () => {}
    const dataHeld = new Promise<void>((resolve) => { releaseData = resolve })
    await page.route('**/data/**', async (route) => { await dataHeld; await route.continue() })
    await page.goto(url)
    await page.locator('.map-splash-mark strong').waitFor({ state: 'visible' })
    await page.waitForTimeout(800)
    await page.screenshot({ path: name('splash') })
    console.log(`${name('splash')} title=${JSON.stringify(await page.title())}`)

    releaseData()
    await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 90_000 })
    await page.waitForTimeout(4_000)
    await page.screenshot({ path: name('kaart') })

    await page.getByRole('button', { name: 'Over weer ok? en instellingen' }).click()
    await page.getByRole('dialog', { name: 'weer ok?' }).waitFor({ state: 'visible' })
    await page.waitForTimeout(600)
    await page.screenshot({ path: name('about') })
    await context.close()
  }
}
await browser.close()
