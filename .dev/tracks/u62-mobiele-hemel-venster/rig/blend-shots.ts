// U62 blending-proef: regen in Wind (alfa / vermenigvuldigen / gedempt) en in Lucht (nu / voorstel), dag en nacht,
// 390 px en 1280 px. Per modus, tijdstip en schermmaat één beeld met de varianten naast elkaar.
// Gebruik: pnpm exec tsx tmp/u62/blend-shots.ts <baseURL> <label> [dag HH:MM] [nacht HH:MM]
import { chromium, devices } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import sharp from 'sharp'

const [baseURL = 'http://127.0.0.1:4320', label = 'blend', dayTime = '13:00', nightTime = '23:00'] = process.argv.slice(2)
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })
const MODES = [
  { path: 'wind', key: 'motregen-dev-regen-wind', variants: ['alfa', 'vermenigvuldigen', 'gedempt'] },
  { path: 'lucht', key: 'motregen-dev-regen-lucht', variants: ['nu', 'voorstel'] },
] as const
const dayOf = (offsetDays: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date(Date.now() + offsetDays * 86_400_000))
const nowClock = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit' }).format(new Date())
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
for (const device of ['390', '1280'] as const) {
  for (const mode of MODES) {
    for (const [scene, time] of [['dag', dayTime], ['nacht', nightTime]] as const) {
      const cells: Buffer[] = []
      const states: string[] = []
      for (const variant of mode.variants) {
        const context = await browser.newContext(device === '390' ? { ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 } })
        await context.addInitScript(([key, value]) => {
          localStorage.setItem(key!, value!)
          addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.textContent = '.dev-panel { display: none !important; }'; document.head.append(style) })
        }, [mode.key, variant])
        const page = await context.newPage()
        await page.goto(`${baseURL}/${mode.path}?dev#t=${dayOf(time < nowClock ? 1 : 0)}T${time.replace(':', '')}`)
        await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
        await page.waitForTimeout(2_500)
        // Sinds U57 opent een adres met een tijd de dataversheid; sluiten laat de tijd staan.
        if (await page.locator('.freshness-dialog[open]').count()) {
          await page.keyboard.press('Escape')
          await page.locator('.freshness-dialog[open]').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => undefined)
        }
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
        await page.waitForTimeout(8_000)
        const shell = page.locator('.map-shell')
        states.push(`${variant}: dekking ${await shell.getAttribute('data-rain-opacity')}, ${await shell.getAttribute('data-rain-blend')}`)
        const cellWidth = device === '390' ? 390 : 560
        const cellHeight = device === '390' ? 470 : 560
        cells.push(await sharp(await shell.screenshot()).resize({ width: cellWidth, height: cellHeight, fit: 'cover', position: device === '390' ? 'top' : 'right top' }).png().toBuffer())
        await context.close()
      }
      const cellWidth = device === '390' ? 390 : 560
      const cellHeight = device === '390' ? 470 : 560
      await sharp({ create: { width: (cellWidth + 8) * cells.length - 8, height: cellHeight, channels: 3, background: '#ff00ff' } })
        .composite(cells.map((input, index) => ({ input, left: index * (cellWidth + 8), top: 0 }))).png().toFile(`${outputDir}${label}-${mode.path}-${scene}-${device}.png`)
      console.log(`${device} ${mode.path} ${scene} (${time}) → ${states.join(' | ')}`)
    }
  }
}
await browser.close()
