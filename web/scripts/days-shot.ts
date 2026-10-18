import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Beelden van de lijst "Komende dagen" (U91) en de glijdende tabel (U91b) op 1280 en 390 px, licht en donker thema, plus console-fouten en
// mislukte verzoeken. De worker bekijkt deze zelf vóór elk "klaar".
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
    page.on('console', (message) => { if (message.type() === 'error') problems.push(`${theme}/${name} console: ${message.text()}`) })
    page.on('pageerror', (error) => problems.push(`${theme}/${name} pageerror: ${error.message}`))
    page.on('requestfailed', (request) => problems.push(`${theme}/${name} requestfailed: ${request.url()} ${request.failure()?.errorText}`))
    page.on('response', (response) => { if (response.status() >= 400) problems.push(`${theme}/${name} HTTP ${response.status()}: ${response.url()}`) })
    await page.addInitScript((choice) => localStorage.setItem('motregen-theme', choice), theme)
    // SHOT_CONTRAST=breed|smal|sterk (met SHOT_QUERY=dev): de ?dev-keuze Dag/nacht-contrast.
    if (process.env.SHOT_CONTRAST) await page.addInitScript((choice) => localStorage.setItem('motregen-dagnacht-contrast', choice), process.env.SHOT_CONTRAST)
    // SHOT_NOW (ISO): manifest-"nu" en browserklok verschoven, bijv. naar de avond, om de tabel 's nachts te zien.
    if (process.env.SHOT_NOW) {
      const shifted = process.env.SHOT_NOW
      await page.clock.install({ time: new Date(shifted) })
      await page.route('**/data/manifest.json*', async (route) => {
        const response = await route.fetch()
        await route.fulfill({ response, json: { ...await response.json(), now: shifted } })
      })
    }
    await page.goto(new URL(`/${process.env.SHOT_QUERY ? `?${process.env.SHOT_QUERY}` : ''}`, origin).href)
    await page.waitForTimeout(6_000)
    await page.screenshot({ path: join(outDir, `${label}-${theme}-${name}-boven.png`) })
    // Glijdende tabel (U91b): elke overgang naar een grovere rij bovenaan in beeld.
    for (const grain of ['3h', 'part', 'day']) {
      const row = page.locator(`tr[data-grain="${grain}"]`).first()
      if (!await row.count()) continue
      await row.evaluate((element) => element.scrollIntoView({ block: 'center' }))
      await page.waitForTimeout(grain === '3h' ? 6_000 : 1_000)
      await page.screenshot({ path: join(outDir, `${label}-${theme}-${name}-${grain}.png`) })
    }
    // SHOT_MODES=weather,air,temperature,wind: elke tabelmodus vastzetten, met de dagdelen in beeld.
    for (const mode of (process.env.SHOT_MODES ?? '').split(',').filter(Boolean)) {
      await page.locator(`.${mode}-focus`).first().click()
      await page.locator('tr[data-grain="part"]').first().evaluate((element) => element.scrollIntoView({ block: 'center' }))
      await page.waitForTimeout(1_500)
      await page.screenshot({ path: join(outDir, `${label}-${theme}-${name}-modus-${mode}.png`) })
    }
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
