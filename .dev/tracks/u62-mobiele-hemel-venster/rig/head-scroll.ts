// U62 stap 3b-rig: de koppenrij volgt de bovenste zichtbare tabelrij. Scrolt de tabel naar een nacht- en een
// dagrij en legt vast wat de kop doet, op 390 px (tabelweergave open) en desktop.
// Gebruik: pnpm exec tsx tmp/u62/head-scroll.ts <baseURL> <label>
import { chromium, devices } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const [baseURL = 'http://127.0.0.1:4320', label = 'kop'] = process.argv.slice(2)
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
  await page.waitForTimeout(6_000)
  for (const target of ['night-hour', 'day-hour'] as const) {
    // Eén meting in de rig zelf (niet in de app): de eerste rij van dit soort die ver genoeg onder de kop kan komen.
    await page.evaluate((rowClass) => {
      const scroller = document.querySelector<HTMLElement>('.table-scroll')!
      const head = document.querySelector<HTMLElement>('.forecast-table thead')!.getBoundingClientRect().height
      const rows = [...document.querySelectorAll<HTMLElement>(`tbody tr.${rowClass}[data-epoch]`)]
      const row = rows[Math.min(rows.length - 1, 3)]!
      scroller.scrollTop += row.getBoundingClientRect().top - scroller.getBoundingClientRect().top - head
    }, target)
    await page.waitForTimeout(900)
    const state = await page.evaluate(() => {
      const heading = document.querySelector<HTMLElement>('.forecast-table thead tr')!
      // De cellen zijn sticky, de rij zelf scrolt mee: de plek van de kop is die van een cel.
      const headBottom = heading.querySelector('th')!.getBoundingClientRect().bottom
      // De rij die voor meer dan de helft onder de kop uitsteekt en het hoogst staat.
      const topRow = [...document.querySelectorAll<HTMLElement>('tbody tr[data-epoch]')]
        .filter((row) => row.checkVisibility({ visibilityProperty: true }))
        .map((row) => ({ row, bounds: row.getBoundingClientRect() }))
        .filter(({ bounds }) => bounds.height > 0 && bounds.top + bounds.height / 2 >= headBottom)
        .sort((left, right) => left.bounds.top - right.bounds.top)[0]?.row
      return { head: heading.className, topRow: topRow?.className.replace(/\s*(pending-hour|past-hour|current-hour|before-\S+)/g, '') ?? '', time: topRow ? new Date(Number(topRow.dataset.epoch)).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' }) : '' }
    })
    await page.screenshot({ path: `${outputDir}${label}-${device}-${target === 'night-hour' ? 'nacht' : 'dag'}.png` })
    console.log(`${device} naar ${target}: bovenste rij ${state.time} (${state.topRow}), kop "${state.head}"`)
  }
  await context.close()
}
await browser.close()
