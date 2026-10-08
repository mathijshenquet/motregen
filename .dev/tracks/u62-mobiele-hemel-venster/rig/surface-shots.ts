// U62 regressies (PO 2026-10-08): tegelranden boven zee, cijferhalo, isobaren. Wind-modus (isobaren + cijfers),
// donker én licht app-thema, dag en nacht, 1280 px en 390 px. Per schermmaat één beeld met vier vakken:
// donker thema overdag · donker thema 's nachts · licht thema overdag · licht thema 's nachts.
// Gebruik: pnpm exec tsx tmp/u62/surface-shots.ts <baseURL> <label>
import { chromium, devices } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import sharp from 'sharp'
const [baseURL = 'http://127.0.0.1:4320', label = 'kaartstand'] = process.argv.slice(2)
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })
const dayOf = (offsetDays: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date(Date.now() + offsetDays * 86_400_000))
const nowClock = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit' }).format(new Date())
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
for (const device of ['1280', '390'] as const) {
  const cells: Buffer[] = []
  for (const theme of ['dark', 'light'] as const) for (const time of ['13:00', '02:00']) {
    const context = await browser.newContext(device === '390' ? { ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
    await context.addInitScript((choice) => localStorage.setItem('motregen-theme', choice), theme)
    const page = await context.newPage()
    await page.goto(`${baseURL}/wind#t=${dayOf(time < nowClock ? 1 : 0)}T${time.replace(':', '')}`)
    await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
    await page.waitForTimeout(2_500)
    if (await page.locator('.freshness-dialog[open]').count()) { await page.keyboard.press('Escape'); await page.locator('.freshness-dialog[open]').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => undefined) }
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.waitForTimeout(9_000)
    const state = await page.evaluate(() => ({ night: document.querySelector<HTMLElement>('.map')?.dataset.mapNight, isobarLabel: document.querySelector('.isobar-label')?.className ?? 'geen', isobars: document.querySelector('.map-shell')?.getAttribute('data-isobars') }))
    console.log(`${device} ${theme} ${time}: nacht ${state.night}, isobaren ${state.isobars}, label "${state.isobarLabel}"`)
    const shell = page.locator('.map-shell')
    cells.push(await sharp(await shell.screenshot()).resize({ width: 520, height: 520, fit: 'cover', position: 'left top' }).png().toBuffer())
    await context.close()
  }
  await sharp({ create: { width: 528 * 4 - 8, height: 520, channels: 3, background: '#ff00ff' } }).composite(cells.map((input, index) => ({ input, left: index * 528, top: 0 }))).png().toFile(`${outputDir}${label}-${device}.png`)
}
await browser.close()
