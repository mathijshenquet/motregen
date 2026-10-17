import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Beelden van de lijst "Komende dagen" (U91) op 1280 en 390 px, licht en donker thema, plus console-fouten en
// mislukte verzoeken. De worker bekijkt deze zelf vóór elk "klaar". SHOT_CLOCK (ISO) zet de browserklok, bijv. 's nachts.
const [origin, outDir, label = 'dagen'] = process.argv.slice(2)
if (!origin || !outDir) throw new Error('usage: pnpm exec tsx scripts/days-shot.ts ORIGIN OUT_DIR [LABEL]')
mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const viewports = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } }
const problems: string[] = []
for (const theme of (process.env.SHOT_THEMES ?? 'light,dark').split(',')) {
  for (const [name, viewport] of Object.entries(viewports)) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: name === 'mobile', isMobile: name === 'mobile', colorScheme: theme === 'dark' ? 'dark' : 'light' })
    const page = await context.newPage()
    if (process.env.SHOT_CLOCK) await page.clock.install({ time: new Date(process.env.SHOT_CLOCK) })
    page.on('console', (message) => { if (message.type() === 'error') problems.push(`${theme}/${name} console: ${message.text()}`) })
    page.on('pageerror', (error) => problems.push(`${theme}/${name} pageerror: ${error.message}`))
    page.on('requestfailed', (request) => problems.push(`${theme}/${name} requestfailed: ${request.url()} ${request.failure()?.errorText}`))
    page.on('response', (response) => { if (response.status() >= 400) problems.push(`${theme}/${name} HTTP ${response.status()}: ${response.url()}`) })
    await page.addInitScript((choice) => localStorage.setItem('motregen-theme', choice), theme)
    await page.goto(new URL(`/${process.env.SHOT_QUERY ? `?${process.env.SHOT_QUERY}` : ''}`, origin).href)
    await page.waitForTimeout(6_000)
    await page.screenshot({ path: join(outDir, `${label}-${theme}-${name}-boven.png`) })
    const list = page.locator('.day-list')
    if (await list.count()) {
      await list.scrollIntoViewIfNeeded()
      await page.waitForTimeout(4_000)
      await list.screenshot({ path: join(outDir, `${label}-${theme}-${name}-lijst.png`) })
      await page.screenshot({ path: join(outDir, `${label}-${theme}-${name}-scherm.png`) })
    }
    await context.close()
  }
}
await browser.close()
console.log(problems.length ? problems.join('\n') : 'geen fouten')
console.log(`Beelden: ${outDir}/${label}-*.png`)
