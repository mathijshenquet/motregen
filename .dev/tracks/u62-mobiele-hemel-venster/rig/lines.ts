// U62 lijnensysteem: de tabel bij zonsondergang (dagrijen en nachtrijen in één beeld), 390 px (open tabel) en
// 1280 px, plus het GEMETEN contrast van elke lijn tegen het vlak ernaast (pixels uit het schermbeeld).
// Gebruik: pnpm exec tsx tmp/u62/lines.ts <baseURL> <label>
import { chromium, devices, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const [baseURL = 'http://127.0.0.1:4320', label = 'lijnen'] = process.argv.slice(2)
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })
function luminance(channels: number[]): number {
  const linear = channels.slice(0, 3).map((channel) => { const share = channel / 255; return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
}
const ratio = (first: number[], second: number[]) => Math.round((Math.max(luminance(first), luminance(second)) + 0.05) / (Math.min(luminance(first), luminance(second)) + 0.05) * 100) / 100

/** Lijnen als (x, y van de lijn, y van het vlak ernaast) in CSS-px. */
async function linePoints(page: Page) {
  return page.evaluate(() => {
    const points: Array<{ kind: string; x: number; lineY: number; groundY: number }> = []
    const headBottom = document.querySelector('.forecast-table thead th')!.getBoundingClientRect().bottom
    const rows = [...document.querySelectorAll<HTMLElement>('tbody tr[data-epoch]')].filter((row) => { const bounds = row.getBoundingClientRect(); return bounds.height > 0 && bounds.top > headBottom + 4 && bounds.bottom < innerHeight - 4 })
    for (const kind of ['day-hour', 'night-hour']) {
      // Een rij waarvan de volgende van hetzelfde soort is: de lijn ertussen, niet de zon-rij.
      const row = rows.find((candidate) => candidate.classList.contains(kind) && candidate.nextElementSibling?.classList.contains(kind))
      if (!row) continue
      const cell = row.querySelector('td')!.getBoundingClientRect()
      points.push({ kind: `rijlijn ${kind === 'day-hour' ? 'dag' : 'nacht'}`, x: cell.left + 8, lineY: cell.bottom - 0.5, groundY: cell.bottom - 6 })
    }
    const headCell = document.querySelector('.forecast-table thead th')!.getBoundingClientRect()
    points.push({ kind: 'onder de koppenrij', x: headCell.left + 6, lineY: headCell.bottom - 0.5, groundY: headCell.bottom - 6 })
    const sunRow = [...document.querySelectorAll<HTMLElement>('tbody tr.sun-row')].find((row) => { const bounds = row.getBoundingClientRect(); return bounds.top > headBottom + 4 && bounds.bottom < innerHeight - 4 })
    if (sunRow) { const cell = sunRow.querySelector('td')!.getBoundingClientRect(); points.push({ kind: 'zon-rij (bovenrand)', x: cell.left + 8, lineY: cell.top + 0.5, groundY: cell.top + 6 }) }
    return points
  })
}

const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const report: Record<string, Record<string, number>> = {}
for (const device of ['390', '1280'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    const context = await browser.newContext(device === '390' ? { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
    await context.addInitScript((choice) => localStorage.setItem('motregen-theme', choice), theme)
    const page = await context.newPage()
    await page.goto(`${baseURL}/weer`)
    await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
    await page.locator('tr.current-hour').waitFor({ state: 'attached', timeout: 60_000 })
    const scrubber = page.locator('.scrub-surface')
    if (await scrubber.getAttribute('data-playing') !== null) await scrubber.press(' ')
    if (device === '390') await page.getByRole('button', { name: 'Tabel' }).click()
    else {
      const tableBox = (await page.locator('.table-scroll').boundingBox())!
      await page.mouse.move(tableBox.x + tableBox.width / 2, tableBox.y + tableBox.height / 2)
      await page.mouse.wheel(0, 30)
    }
    await page.waitForTimeout(6_000)
    // De eerstvolgende zonsondergang na nu in het midden van de tabel: dagrijen erboven, nachtrijen eronder.
    await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>('.table-scroll')!
      const now = document.querySelector('tbody tr.current-hour')!
      const sunset = [...document.querySelectorAll<HTMLElement>('tbody tr.sunset-row')].find((row) => Boolean(now.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING))!
      const bounds = scroller.getBoundingClientRect()
      scroller.scrollTop += sunset.getBoundingClientRect().top - (bounds.top + bounds.height * 0.45)
    })
    await page.mouse.move(5, 5)
    await page.waitForTimeout(1_200)
    const name = `${device}-${theme}`
    const shot = await page.screenshot({ path: `${outputDir}${label}-${name}.png` })
    const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true })
    const scale = info.width / page.viewportSize()!.width
    const pixel = (x: number, y: number) => { const index = (Math.floor(y * scale) * info.width + Math.floor(x * scale)) * info.channels; return [data[index]!, data[index + 1]!, data[index + 2]!] }
    // Met samengevoegde tabelranden ligt een lijn soms een pixel hoger of lager dan de celrand: de sterkste
    // afwijking van het vlak binnen ±2 px telt als de lijn.
    report[name] = Object.fromEntries((await linePoints(page)).map((point) => {
      const ground = pixel(point.x, point.groundY)
      const offsets = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2]
      return [point.kind, Math.max(...offsets.map((offset) => ratio(pixel(point.x, point.lineY + offset), ground)))]
    }))
    console.log(name, JSON.stringify(report[name]))
    await context.close()
  }
}
await browser.close()
writeFileSync(`${outputDir}${label}-contrast.json`, JSON.stringify(report, null, 1))
