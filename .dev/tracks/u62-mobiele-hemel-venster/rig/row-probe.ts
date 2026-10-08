// U62: welke uurrijen meldt een IntersectionObserver (zelfde wortel en marge als de app) als zichtbaar
// nadat de zonsopkomstrij onder de kop is doorgeschoven? Controle van de koppenrij-wissel.
import { chromium } from '@playwright/test'
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto('http://127.0.0.1:4320/weer')
await page.locator('tr.current-hour').waitFor({ state: 'attached', timeout: 60_000 })
const tableBox = (await page.locator('.table-scroll').boundingBox())!
await page.mouse.move(tableBox.x + tableBox.width / 2, tableBox.y + tableBox.height / 2)
await page.mouse.wheel(0, 30)
await page.waitForTimeout(5_000)
console.log(JSON.stringify(await page.evaluate(async () => {
  const scroller = document.querySelector<HTMLElement>('.table-scroll')!
  const head = document.querySelector<HTMLElement>('.forecast-table thead')!
  const headBottom = head.querySelector('th')!.getBoundingClientRect().bottom
  const sunrise = [...document.querySelectorAll<HTMLElement>('tbody tr.sunrise-row')].at(-1)!
  scroller.scrollTop += sunrise.getBoundingClientRect().top - headBottom + 12
  await new Promise((resolve) => setTimeout(resolve, 500))
  const headHeight = Math.ceil(head.getBoundingClientRect().height)
  const seen: Array<{ time: string; kind: string; ratio: number; top: number; height: number }> = []
  await new Promise<void>((resolve) => {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const row = entry.target as HTMLElement
        seen.push({ time: new Date(Number(row.dataset.epoch)).toISOString().slice(5, 16), kind: row.className.slice(0, 24), ratio: Math.round(entry.intersectionRatio * 100) / 100, top: Math.round(entry.boundingClientRect.top), height: Math.round(entry.boundingClientRect.height) })
      }
      observer.disconnect()
      resolve()
    }, { root: scroller, rootMargin: `-${headHeight}px 0px 0px 0px`, threshold: 0 })
    for (const row of document.querySelectorAll('tbody tr[data-epoch]')) observer.observe(row)
  })
  return { headHeight, headBottom: Math.round(headBottom), scrollerTop: Math.round(scroller.getBoundingClientRect().top), overflowY: getComputedStyle(scroller).overflowY, headClass: document.querySelector('.forecast-table thead tr')!.className, firstSeen: seen.slice(0, 4), count: seen.length }
})))
await browser.close()
