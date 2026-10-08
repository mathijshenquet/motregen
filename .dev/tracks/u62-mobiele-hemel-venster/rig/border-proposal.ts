// U62-voorstel (PO: "wat nog mist zijn borders tussen kaart en sidebar, maybe"): twee varianten voor een
// scheiding tussen kaart en zijpaneel op desktop, als CSS ingespoten in de rig — er verandert niets aan het
// product. Per scène (dag, nacht; 1280 px) één beeld met nu | A | B naast elkaar, plus een vergrote uitsnede
// van de naad op een plek waar kaart en paneel dezelfde toon hebben (daar ontbreekt de rand).
// Gebruik: pnpm exec tsx tmp/u62/border-proposal.ts <baseURL>
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import sharp from 'sharp'

const [baseURL = 'http://127.0.0.1:4320'] = process.argv.slice(2)
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })
// De lijnkleur volgt de hemel van het cursoruur (klassen op de kaartschil), zodat hij dag en nacht zichtbaar is.
const VARIANTS: Array<{ name: string; css: string }> = [
  { name: 'nu', css: '' },
  { name: 'A: lijn van 1 px', css: `
    .dashboard { position: relative; z-index: 2; box-shadow: -1px 0 0 rgba(16, 38, 48, .2); }
    .app-shell:has(.map-shell.sky-night) .dashboard { box-shadow: -1px 0 0 rgba(237, 248, 252, .22); }` },
  { name: 'B: zachte schaduw', css: `
    .dashboard { position: relative; z-index: 2; box-shadow: -16px 0 30px -18px rgba(6, 20, 28, .5); }
    .app-shell:has(.map-shell.sky-night) .dashboard { box-shadow: -18px 0 32px -16px rgba(0, 0, 0, .85), -1px 0 0 rgba(237, 248, 252, .1); }` },
]
const SCALE = 2
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const dayOf = (offsetDays: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date(Date.now() + offsetDays * 86_400_000))
const nowClock = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit' }).format(new Date())
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: SCALE })).newPage()
for (const [scene, time, rowClass] of [['dag', '13:00', 'day-hour'], ['nacht', '23:00', 'night-hour']] as const) {
  await page.goto(`${baseURL}/weer#t=${dayOf(time < nowClock ? 1 : 0)}T${time.replace(':', '')}`)
  await page.reload()
  await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
  await page.waitForTimeout(2_500)
  if (await page.locator('.freshness-dialog[open]').count()) {
    await page.keyboard.press('Escape')
    await page.locator('.freshness-dialog[open]').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => undefined)
  }
  // De tabel naar rijen van dezelfde toon als de kaart: een wieltik laat de nu-rij-pin los.
  const tableBox = (await page.locator('.table-scroll').boundingBox())!
  await page.mouse.move(tableBox.x + tableBox.width / 2, tableBox.y + tableBox.height / 2)
  await page.mouse.wheel(0, 30)
  await page.evaluate((wanted) => {
    const scroller = document.querySelector<HTMLElement>('.table-scroll')!
    const headBottom = document.querySelector('.forecast-table thead th')!.getBoundingClientRect().bottom
    const rows = [...document.querySelectorAll<HTMLElement>(`tbody tr.${wanted}[data-epoch]:not(.past-hour)`)].filter((row) => row.getBoundingClientRect().height > 0)
    const row = rows[Math.min(rows.length - 1, 2)]
    if (row) scroller.scrollTop += row.getBoundingClientRect().top - headBottom
  }, rowClass)
  await page.mouse.move(400, 500)
  await page.waitForTimeout(7_000)
  const seamX = Math.round((await page.locator('.dashboard').boundingBox())!.x)
  const full: Buffer[] = []
  const seam: Buffer[] = []
  for (const variant of VARIANTS) {
    const style = variant.css ? await page.addStyleTag({ content: variant.css }) : undefined
    await page.waitForTimeout(300)
    const shot = await page.screenshot()
    await style?.evaluate((element) => element.remove())
    // Uit het volle beeld de strook rond de naad (kaart links, paneel rechts), op halve grootte voor het overzicht.
    full.push(await sharp(shot).extract({ left: (seamX - 330) * SCALE, top: 0, width: 660 * SCALE, height: 800 * SCALE }).resize({ width: 660 }).png().toBuffer())
    seam.push(await sharp(shot).extract({ left: (seamX - 90) * SCALE, top: 420 * SCALE, width: 180 * SCALE, height: 200 * SCALE }).resize({ width: 540, kernel: 'nearest' }).png().toBuffer())
  }
  const sideBySide = async (parts: Buffer[], width: number, height: number, path: string) => {
    const gap = 12
    await sharp({ create: { width: width * parts.length + gap * (parts.length - 1), height, channels: 3, background: '#ff00ff' } })
      .composite(parts.map((input, index) => ({ input, left: index * (width + gap), top: 0 })))
      .png().toFile(path)
  }
  await sideBySide(full, 660, 800, `${outputDir}rand-${scene}-overzicht.png`)
  await sideBySide(seam, 540, 600, `${outputDir}rand-${scene}-naad.png`)
  console.log(`${scene}: naad op x=${seamX}; volgorde ${VARIANTS.map((variant) => variant.name).join(' | ')}`)
}
await browser.close()
