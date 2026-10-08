// U62: de vastgezette regen-blending zonder dev-knoppen — Wind en Lucht, dag en nacht, 390 px en 1280 px.
import { chromium, devices } from '@playwright/test'
import sharp from 'sharp'
const [baseURL = 'http://127.0.0.1:4320'] = process.argv.slice(2)
const outputDir = new URL('./out/', import.meta.url).pathname
const dayOf = (offsetDays: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date(Date.now() + offsetDays * 86_400_000))
const nowClock = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit' }).format(new Date())
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
for (const device of ['390', '1280'] as const) {
  const cells: Buffer[] = []
  for (const mode of ['wind', 'lucht']) for (const time of ['13:00', '23:00']) {
    const page = await (await browser.newContext(device === '390' ? { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } : { viewport: { width: 1280, height: 800 } })).newPage()
    await page.goto(`${baseURL}/${mode}#t=${dayOf(time < nowClock ? 1 : 0)}T${time.replace(':', '')}`)
    await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
    await page.waitForTimeout(2_500)
    if (await page.locator('.freshness-dialog[open]').count()) { await page.keyboard.press('Escape'); await page.locator('.freshness-dialog[open]').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => undefined) }
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.waitForTimeout(8_000)
    const shell = page.locator('.map-shell')
    console.log(`${device} ${mode} ${time}: dekking ${await shell.getAttribute('data-rain-opacity')}, ${await shell.getAttribute('data-rain-blend')}`)
    cells.push(await sharp(await shell.screenshot()).resize({ width: 400, height: 440, fit: 'cover', position: 'right top' }).png().toBuffer())
    await page.close()
  }
  await sharp({ create: { width: 408 * 4 - 8, height: 440, channels: 3, background: '#ff00ff' } }).composite(cells.map((input, index) => ({ input, left: index * 408, top: 0 }))).png().toFile(`${outputDir}blend-vast-${device}.png`)
}
await browser.close()
