// U104: welke uurrijen van de tabel hebben na 8/20/40 s een weericoon, en welke cellen staan er?
// Desktop 1440×900, Utrecht, modus Gevoel, koud. Gebruik:
//   pnpm exec tsx scripts/measure-history-icons.ts <basis-url> [seconden…]
// bv. https://motregen.nl of http://127.0.0.1:4398 (vite preview met MOTREGEN_DATA_ORIGIN=https://motregen.nl/data).
// MEASURE_SCREENSHOTS=<pad-prefix> legt bij elk meetpunt ook een screenshot vast.
import { chromium } from '@playwright/test'

const base = process.argv[2] ?? 'https://motregen.nl'
const marks = process.argv.slice(3).map(Number).filter(Number.isFinite)
const seconds = marks.length ? marks : [8, 20, 40]

const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam' })
const page = await context.newPage()
const harmonie: string[] = []
const start = Date.now()
page.on('requestfinished', (request) => {
  const name = request.url().split('/').pop()!.split('?')[0]!
  if (/cloud_frac|^rtcor|^harmonie-2/.test(name)) harmonie.push(`${((Date.now() - start) / 1000).toFixed(1)} s ${name}`)
})
await page.goto(`${base}/gevoel/utrecht`)
const rows = () => page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.forecast-table tbody tr[data-epoch]'))
  .filter((row) => Number(row.dataset.epoch) <= Date.now())
  .map((row) => {
    const time = new Date(Number(row.dataset.epoch)).toLocaleTimeString('nl-NL', { hour: '2-digit', timeZone: 'Europe/Amsterdam' })
    const icon = row.querySelector('.weather-cell svg.weather-icon') ? 'icoon' : '-'
    const temperature = row.querySelector('.temperature-cell')?.textContent?.trim() ?? ''
    return `${time}u ${icon.padEnd(5)} ${row.classList.contains('past-hour') ? 'verleden' : 'nu'} ${temperature}`
  }))
for (const mark of seconds) {
  await page.waitForTimeout(Math.max(0, mark * 1000 - (Date.now() - start)))
  console.log(`--- na ${mark} s`)
  if (process.env.MEASURE_SCREENSHOTS) await page.screenshot({ path: `${process.env.MEASURE_SCREENSHOTS}-${mark}s.png` })
  for (const row of await rows()) console.log(row)
}
console.log('--- requests (bewolking, radar, HARMONIE-regen)')
for (const line of harmonie) console.log(line)
await browser.close()
