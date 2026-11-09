import { chromium, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Beelden voor U100 (vaste temperatuurschaal, Gevoel-legenda, isolijnlabels): telefoon en desktop op dezelfde
// kaarttijd, zodat varianten naast elkaar te leggen zijn. De worker bekijkt ze zelf.
// Gebruik: pnpm exec tsx scripts/temperature-scale-shot.ts ORIGIN OUT_DIR TIJD [SET]
//   TIJD: ISO-tijd of relatieve kaarttijd zoals +0u; SET: basis (standaard) of labels.
const [origin, outDir, time = '+0u', set = 'basis'] = process.argv.slice(2)
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
  await page.getByRole('button', { name: /^Over .* en instellingen$/ }).click()
  await page.getByRole('heading', { name: 'Instellingen' }).waitFor()
  await page.waitForTimeout(400)
}

const LABEL_VARIANTS: Array<{ size: number; spacing: number; fill: number }> = [
  { size: 11, spacing: 260, fill: 0 },
  { size: 13, spacing: 200, fill: 0 },
  { size: 13, spacing: 200, fill: 200 },
  { size: 14, spacing: 160, fill: 160 },
  { size: 14, spacing: 240, fill: 240 },
  { size: 16, spacing: 300, fill: 300 },
]

const shots: Shot[] = set === 'labels'
  ? LABEL_VARIANTS.map(({ size, spacing, fill }) => ({
    name: `labels-grootte${size}-afstand${spacing}-vulling${fill}`,
    device: DESKTOP,
    path: `/gevoel?dev&${at}&labelgrootte=${size}&labelafstand=${spacing}&labelvulling=${fill}`,
    action: wholeCountry,
  }))
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
  await shot.action?.(page)
  // Na een kaartsprong: de isolijnen en labels krijgen tijd om te volgen.
  if (shot.action === wholeCountry) await page.waitForTimeout(5_000)
  const path = join(outDir, `${shot.name}.png`)
  if (shot.fullPage) await page.screenshot({ path })
  else await page.locator('.map-shell').screenshot({ path })
  console.log(path)
  await context.close()
}
await browser.close()
