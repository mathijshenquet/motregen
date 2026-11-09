import { chromium, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Kaartstijl per modus (U107): telefoon en desktop, licht en donker, met een pin op Utrecht, voor het
// inventaris- en voor/na-blad. Eén vaste kaarttijd (manifest-nu + 1 u, of --t).
// usage: pnpm exec tsx scripts/kaartstijl-shot.ts ORIGIN OUT_DIR [EXTRA-QUERY] [TIJD-ISO]
//   SHOT_MODES=wind,gevoel en SHOT_PROFILES=telefoon beperken de matrix; SHOT_THEMES=licht idem.
//   SHOT_DPR=3 overschrijft de pixeldichtheid (close-ups); SHOT_LEGEND=open klikt de legenda-knop open waar hij dicht is (telefoon).
const [origin, outDir, extra = '', fixedTime] = process.argv.slice(2)
if (!origin || !outDir) throw new Error('usage: pnpm exec tsx scripts/kaartstijl-shot.ts ORIGIN OUT_DIR [EXTRA-QUERY] [TIJD-ISO]')
mkdirSync(outDir, { recursive: true })

const profiles = {
  telefoon: { viewport: { width: 402, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
}
const modes = ['weer', 'lucht', 'gevoel', 'wind']
const themes = { licht: 'light', donker: 'dark' } as const
const pick = <T extends string>(all: readonly T[], env?: string) => env ? all.filter((value) => env.split(',').includes(value)) : [...all]

const manifest = await (await fetch(new URL('/data/manifest.json', origin))).json() as { now: string }
const time = fixedTime ?? new Date(Math.round((Date.parse(manifest.now) + 3_600_000) / 600_000) * 600_000).toISOString()
console.log('kaarttijd', time)
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
for (const profileName of pick(Object.keys(profiles) as Array<keyof typeof profiles>, process.env.SHOT_PROFILES)) {
  for (const themeName of pick(Object.keys(themes) as Array<keyof typeof themes>, process.env.SHOT_THEMES)) {
    const theme = themes[themeName]
    const dpr = process.env.SHOT_DPR ? { deviceScaleFactor: Number(process.env.SHOT_DPR) } : {}
    const context = await browser.newContext({ ...profiles[profileName], ...dpr, colorScheme: theme, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', serviceWorkers: 'block' })
    await context.addInitScript((value) => { localStorage.setItem('motregen-theme', value) }, theme)
    for (const mode of pick(modes, process.env.SHOT_MODES)) {
      const page = await context.newPage()
      page.setDefaultTimeout(120_000)
      await page.goto(new URL(`/${mode}/utrecht?t=${encodeURIComponent(time)}${extra ? `&${extra}` : ''}`, origin).href)
      await settle(page, mode)
      const path = join(outDir, `${mode}-${profileName}-${themeName}.png`)
      await page.locator('.map-shell').screenshot({ path })
      console.log('shot', path)
      await page.close()
    }
    await context.close()
  }
}
await browser.close()

async function settle(page: Page, mode: string): Promise<void> {
  await page.locator('.map-splash.ready').waitFor({ state: 'attached' })
  // `?dev` opent het dev-paneel over de kaart; voor het blad weg.
  await page.addStyleTag({ content: '.dev-panel { display: none !important; }' })
  await page.locator('.scrubber-placeholder').waitFor({ state: 'detached' })
  const close = page.locator('.freshness-close')
  if (await close.isVisible().catch(() => false)) await close.click()
  await page.mouse.move(5, 5)
  if (mode === 'wind') await page.waitForFunction(() => Number(document.querySelector<HTMLElement>('.map-overlay-windsocks')?.dataset.socks?.split('|')[0]) > 0)
  if (mode === 'gevoel') await page.waitForFunction(() => document.querySelectorAll('.temperature-number').length > 0)
  const legend = page.locator('.map-legend-button[aria-expanded="false"]')
  if (process.env.SHOT_LEGEND === 'open' && await legend.isVisible().catch(() => false)) {
    await legend.click()
    await page.mouse.move(5, 5)
  }
  await page.waitForTimeout(4_000)
}
