// U62: klokpil, zoekbalk (dicht en open) en merkdruppel die meetinten met het cursoruur, op de kaart die de
// kaarttijd volgt. Schermbeelden dag/schemer/nacht op 390 px en desktop, plus het gemeten contrast van de
// teksten tegen wat er werkelijk achter staat.
// Gebruik: pnpm exec tsx tmp/u62/map-chrome.ts <baseURL> <label> <HH:MM,...>
import { chromium, devices, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const [baseURL = 'http://127.0.0.1:4320', label = 'kaartchrome', timesArgument = '13:00,19:10,23:00'] = process.argv.slice(2)
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })
const TEXTS: Record<string, string> = {
  klok: '.map-clock .clock-map-time',
  zoekveld: '.search .search-field',
  zoekresultaat: '.search-results > button span, .search-results .saved-location span',
  zoekdetail: '.search-results small',
  zoekkopje: '.search-section-label',
}
function luminance(channels: number[]): number {
  const linear = channels.slice(0, 3).map((channel) => { const share = channel / 255; return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
}
async function contrasts(page: Page): Promise<Record<string, number>> {
  const boxes = await page.evaluate((groups) => Object.entries(groups).flatMap(([group, selector]) => [...document.querySelectorAll<HTMLElement>(selector)].flatMap((element) => {
    const bounds = element.getBoundingClientRect()
    if (bounds.width < 4 || bounds.height < 4 || bounds.bottom > innerHeight) return []
    // Een invoerveld laat zijn tekst niet met `color` verbergen: meet daar de lege rechterkant van het veld.
    const input = element instanceof HTMLInputElement
    return [{ group, ink: getComputedStyle(element).color.match(/[\d.]+/g)!.slice(0, 3).map(Number), x: input ? bounds.right - 60 : bounds.left, y: input ? bounds.top + 8 : bounds.top, width: input ? 20 : bounds.width, height: input ? bounds.height - 16 : bounds.height }]
  })), TEXTS)
  // Zonder inkt blijft de ondergrond over; de slechtste pixel telt.
  const hide = await page.addStyleTag({ content: `${Object.values(TEXTS).join(', ')} { color: transparent !important; caret-color: transparent !important; } .search-field::placeholder { color: transparent !important; } ${TEXTS.zoekresultaat.split(', ').map((selector) => `${selector} svg`).join(', ')} { visibility: hidden; }` })
  const { data, info } = await sharp(await page.screenshot()).raw().toBuffer({ resolveWithObject: true })
  await hide.evaluate((element) => element.remove())
  const scale = info.width / page.viewportSize()!.width
  const worst: Record<string, number> = {}
  for (const box of boxes) {
    const ink = luminance(box.ink)
    for (let y = Math.floor(box.y * scale); y <= Math.min(info.height - 1, Math.ceil((box.y + box.height) * scale)); y += 2) {
      for (let x = Math.floor(box.x * scale); x <= Math.min(info.width - 1, Math.ceil((box.x + box.width) * scale)); x += 2) {
        const index = (y * info.width + x) * info.channels
        const ground = luminance([data[index]!, data[index + 1]!, data[index + 2]!])
        const ratio = (Math.max(ink, ground) + 0.05) / (Math.min(ink, ground) + 0.05)
        worst[box.group] = Math.round(Math.min(worst[box.group] ?? Infinity, ratio) * 100) / 100
      }
    }
  }
  return worst
}

const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const dayOf = (offsetDays: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date(Date.now() + offsetDays * 86_400_000))
const nowClock = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit' }).format(new Date())
const report: Record<string, unknown> = {}
for (const device of ['390', 'desktop'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    const context = await browser.newContext(device === '390' ? { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } : { viewport: { width: 1280, height: 800 } })
    await context.addInitScript((choice) => localStorage.setItem('motregen-theme', choice), theme)
    const page = await context.newPage()
    for (const time of timesArgument.split(',')) {
      await page.goto(`${baseURL}/weer#t=${dayOf(time < nowClock ? 1 : 0)}T${time.replace(':', '')}`)
      await page.reload()
      await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
      await page.waitForTimeout(2_500)
      // Sinds U57 opent een adres met een tijd de dataversheid; sluiten laat de tijd staan.
      if (await page.locator('.freshness-dialog[open]').count()) {
        await page.keyboard.press('Escape')
        await page.locator('.freshness-dialog[open]').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => undefined)
      }
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
      await page.waitForTimeout(6_000)
      const name = `${device}-${theme}-${time.replace(':', '')}`
      const state = await page.evaluate(() => ({ shell: document.querySelector('.map-shell')!.className, night: document.querySelector<HTMLElement>('.map')?.dataset.mapNight ?? 'geen' }))
      await page.locator('.map-shell').screenshot({ path: `${outputDir}${label}-${name}-dicht.png` })
      const closed = { klok: (await contrasts(page)).klok }
      await page.getByRole('textbox', { name: 'Zoek plaats' }).click()
      await page.getByRole('textbox', { name: 'Zoek plaats' }).fill('Ams')
      await page.waitForTimeout(1_500)
      await page.locator('.map-shell').screenshot({ path: `${outputDir}${label}-${name}-zoek.png` })
      const { klok: coveredClock, ...open } = await contrasts(page)
      report[name] = { ...state, closed, open }
      console.log(name, JSON.stringify(report[name]))
      await page.keyboard.press('Escape')
    }
    await context.close()
  }
}
await browser.close()
writeFileSync(`${outputDir}${label}-contrast.json`, JSON.stringify(report, null, 1))
