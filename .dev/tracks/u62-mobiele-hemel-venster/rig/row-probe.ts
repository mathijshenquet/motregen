// U62: welke rijen staan er rond de kop, met hun plek en zichtbaarheid (controle van head-scroll.ts).
import { chromium } from '@playwright/test'
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto('http://127.0.0.1:4320/weer')
await page.locator('tr.current-hour').waitFor({ state: 'attached', timeout: 60_000 })
await page.waitForTimeout(5_000)
console.log(JSON.stringify(await page.evaluate(() => {
  const headBottom = document.querySelector('.forecast-table thead tr')!.getBoundingClientRect().bottom
  return { headBottom, zone: Intl.DateTimeFormat().resolvedOptions().timeZone, rows: [...document.querySelectorAll<HTMLElement>('tbody tr[data-epoch]')].slice(0, 9).map((row) => ({
    iso: new Date(Number(row.dataset.epoch)).toISOString().slice(11, 16), label: row.querySelector('.time-label')?.textContent?.slice(0, 5), top: Math.round(row.getBoundingClientRect().top), height: Math.round(row.getBoundingClientRect().height), kind: row.className.slice(0, 30) })) }
})))
await browser.close()
