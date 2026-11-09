import { chromium, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Beelden voor U100 (vaste temperatuurschaal, Gevoel-legenda, isolijnlabels): telefoon en desktop op dezelfde
// kaarttijd, zodat varianten naast elkaar te leggen zijn. De worker bekijkt ze zelf.
// Gebruik: pnpm exec tsx scripts/temperature-scale-shot.ts ORIGIN OUT_DIR TIJD [SET]
//   TIJD: ISO-tijd of relatieve kaarttijd zoals +0u; SET: basis (standaard), labels, templabels (ronde 3)
//   of vulling (met LABEL: voor/na). Bij templabels is LABEL een voorvoegsel voor de bestandsnamen (bijv. een datum).
const [origin, outDir, time = '+0u', set = 'basis', tag = set === 'vulling' ? 'voor' : ''] = process.argv.slice(2)
if (!origin || !outDir) throw new Error('usage: pnpm exec tsx scripts/temperature-scale-shot.ts ORIGIN OUT_DIR [TIJD] [basis|labels]')
mkdirSync(outDir, { recursive: true })

const PHONE = { width: 402, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false }
type Device = typeof PHONE

interface Shot {
  name: string
  device: Device
  path: string
  storage?: Record<string, string>
  /** Na het laden, vóór de opname. */
  action?: (page: Page) => Promise<void>
  /** Alleen de kaart (standaard) of de hele pagina. */
  fullPage?: boolean
}

const at = `t=${encodeURIComponent(time)}`
// Heel Nederland in beeld op desktop (C4: "Gevoel, desktop, heel NL").
const wholeCountry = async (page: Page) => {
  await page.evaluate(() => (window as unknown as { __motregenJumpTo: (lng: number, lat: number, zoom: number) => void }).__motregenJumpTo(5.3, 52.2, 6.9))
}
const openAbout = async (page: Page) => {
  // Toetsenbord: opent zonder tapvertraging, en op de telefoon ligt de klok over de knop heen.
  await page.getByRole('button', { name: /^Over .* en instellingen$/ }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('heading', { name: 'Instellingen' }).waitFor()
  await page.waitForTimeout(400)
}

// Spreiding over de range (C4): nu, middengroot, dicht, grootst; puntlabels op de kleinste straal, waar ze nog iets toevoegen.
const LABEL_VARIANTS: Array<{ size: number; spacing: number; fill: number }> = [
  { size: 11, spacing: 260, fill: 0 },
  { size: 13, spacing: 200, fill: 0 },
  { size: 13, spacing: 160, fill: 120 },
  { size: 14, spacing: 140, fill: 0 },
  { size: 14, spacing: 200, fill: 120 },
  { size: 16, spacing: 260, fill: 0 },
]

const closeDevPanel = async (page: Page) => {
  // Dicht is het paneel op de telefoon nog een flink wit vak: voor de vergelijking helemaal weg.
  await page.locator('.dev-panel').evaluate((panel) => { (panel as HTMLDetailsElement).open = false; (panel as HTMLElement).style.display = 'none' })
}
const TEMPERATURE_LABEL_LOOKS = ['lijn', 'plekken', 'vlakken', 'plekken-half'] as const
const shots: Shot[] = set === 'templabels'
  ? TEMPERATURE_LABEL_LOOKS.flatMap((look) => [
    { name: `${tag}templabels-desktop-${look}`, device: DESKTOP, action: async (page: Page) => { await closeDevPanel(page); await wholeCountry(page) } },
    { name: `${tag}templabels-telefoon-${look}`, device: PHONE, action: closeDevPanel },
  ].map((shot) => ({ ...shot, path: `/gevoel?dev&${at}&templabels=${look}` })))
  : set === 'vulling'
  ? [{ name: `vulling-${tag}-desktop`, device: DESKTOP, path: `/gevoel?${at}`, action: wholeCountry }]
  : set === 'labels'
  ? LABEL_VARIANTS.flatMap(({ size, spacing, fill }) => [
    { name: `labels-desktop-grootte${size}-afstand${spacing}-vulling${fill}`, device: DESKTOP, action: async (page: Page) => { await closeDevPanel(page); await wholeCountry(page) } },
    { name: `labels-telefoon-grootte${size}-afstand${spacing}-vulling${fill}`, device: PHONE, action: closeDevPanel },
  ].map((shot) => ({ ...shot, path: `/gevoel?dev&${at}&labelgrootte=${size}&labelafstand=${spacing}&labelvulling=${fill}` })))
  : [
    { name: 'gevoel-vast-desktop', device: DESKTOP, path: `/gevoel?${at}` },
    { name: 'gevoel-vast-telefoon', device: PHONE, path: `/gevoel?${at}` },
    { name: 'gevoel-relatief-desktop', device: DESKTOP, path: `/gevoel?${at}`, storage: { 'motregen-temperature-scale': 'relatief' } },
    { name: 'gevoel-relatief-telefoon', device: PHONE, path: `/gevoel?${at}`, storage: { 'motregen-temperature-scale': 'relatief' } },
    { name: 'weer-desktop', device: DESKTOP, path: `/weer?${at}` },
    { name: 'instellingen-telefoon', device: PHONE, path: `/gevoel?${at}`, action: openAbout, fullPage: true },
  ]

const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
for (const shot of shots) {
  const { width, height, ...device } = shot.device
  const context = await browser.newContext({ viewport: { width, height }, ...device, timezoneId: 'Europe/Amsterdam', locale: 'nl-NL' })
  if (shot.storage) await context.addInitScript((entries) => { for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value) }, shot.storage)
  const page = await context.newPage()
  page.setDefaultTimeout(120_000)
  await page.goto(new URL(shot.path, origin).href)
  await page.locator('.map-splash.ready').waitFor({ state: 'attached' })
  await page.waitForTimeout(6_000)
  // Een link met een tijd opent het actualiteitspaneel; voor de kaartbeelden dicht.
  const freshness = page.locator('dialog[open]')
  if (await freshness.count()) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  }
  await shot.action?.(page)
  // Na een kaartsprong of paneelwissel: de isolijnen en labels krijgen tijd om te volgen.
  if (shot.action) await page.waitForTimeout(5_000)
  const path = join(outDir, `${shot.name}.png`)
  if (shot.fullPage) await page.screenshot({ path })
  else await page.locator('.map-shell').screenshot({ path })
  console.log(path)
  await context.close()
}
await browser.close()
