// U62 stap 3c-rig: de koppenrij wisselt van nacht naar dag op het moment dat de zonsopkomstrij de bovenste
// zichtbare rij wordt. Schermbeelden vlak vóór (van de laatste nachtrij steekt nog 6 px onder de kop uit) en
// vlak ná (de nachtrij is weg, de zon-rij staat bovenaan), op 390 px (open tabel) en desktop.
// Gebruik: pnpm exec tsx tmp/u62/head-transition.ts <baseURL> <label>
import { chromium, devices } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const [baseURL = 'http://127.0.0.1:4320', label = 'kopwissel'] = process.argv.slice(2)
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
for (const device of ['390', 'desktop'] as const) {
  const context = await browser.newContext(device === '390' ? { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } : { viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  await page.goto(`${baseURL}/weer`)
  await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
  await page.locator('tr.current-hour').waitFor({ state: 'attached', timeout: 60_000 })
  const scrubber = page.locator('.scrub-surface')
  if (await scrubber.getAttribute('data-playing') !== null) await scrubber.press(' ')
  if (device === '390') await page.getByRole('button', { name: 'Tabel' }).click()
  else {
    // Desktop houdt de nu-rij vastgepind tot de tabel wordt aangeraakt.
    const tableBox = (await page.locator('.table-scroll').boundingBox())!
    await page.mouse.move(tableBox.x + tableBox.width / 2, tableBox.y + tableBox.height / 2)
    await page.mouse.wheel(0, 30)
  }
  await page.waitForTimeout(6_000)
  // `remaining` = hoeveel px van de nachtrij ervoor onder de kop blijft.
  const placeNightRow = (remaining: number) => page.evaluate((visiblePx) => {
    const scroller = document.querySelector<HTMLElement>('.table-scroll')!
    const headBottom = document.querySelector('.forecast-table thead th')!.getBoundingClientRect().bottom
    // De eerste zonsopkomst ná de nu-rij: een latere staat te dicht bij het einde van de tabel om onder de kop te komen.
    const now = document.querySelector('tbody tr.current-hour')!
    const sunrise = [...document.querySelectorAll<HTMLElement>('tbody tr.sunrise-row')].find((row) => Boolean(now.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING))!
    scroller.scrollTop += sunrise.getBoundingClientRect().top - headBottom - visiblePx
    return sunrise.textContent?.trim() ?? ''
  }, remaining)
  for (const [name, remaining] of [['voor', 6], ['na', -2]] as const) {
    const sunrise = await placeNightRow(remaining)
    await page.waitForTimeout(900)
    const head = await page.locator('.forecast-table thead tr').getAttribute('class')
    await page.screenshot({ path: `${outputDir}${label}-${device}-${name}.png` })
    console.log(`${device} ${name} (${remaining} px van de nachtrij boven "${sunrise}"): kop "${head}"`)
  }
  await context.close()
}
await browser.close()
