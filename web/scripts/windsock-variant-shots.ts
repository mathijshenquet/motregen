import { chromium } from '@playwright/test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Windzakvarianten (U113): per `?dev`-variant telefoon en desktop, licht en donker, op één kaarttijd; telt de zakken
// in beeld (`data-socks` van de laag) en schrijft counts.json naast de screenshots.
// usage: pnpm exec tsx scripts/windsock-variant-shots.ts ORIGIN OUT_DIR TIJD-ISO VARIANT-QUERY...
//   bv. zakeenheid=pil "zakeenheid=pil&windeenheid=kmh". SHOT_PROFILES=telefoon en SHOT_THEMES=licht beperken.
//   `windeenheid=` zet de gekozen windeenheid (localStorage) en gaat niet naar de URL.
const [origin, outDir, time, ...variants] = process.argv.slice(2)
if (!origin || !outDir || !time || !variants.length) throw new Error('usage: windsock-variant-shots.ts ORIGIN OUT_DIR TIJD-ISO VARIANT-QUERY...')
// Een nieuwe ronde begint met een lege uitvoermap: geen oude shots naast nieuwe.
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const profiles = {
  telefoon: { viewport: { width: 402, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
}
const themes = { licht: 'light', donker: 'dark' } as const
const pick = <T extends string>(all: readonly T[], env?: string) => env ? all.filter((value) => env.split(',').includes(value)) : [...all]

const counts: Record<string, number> = {}
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
for (const variant of variants) {
  const params = new URLSearchParams(variant)
  const unit = params.get('windeenheid')
  params.delete('windeenheid')
  const slug = variant.replace(/[&=]/g, '-')
  for (const profileName of pick(Object.keys(profiles) as Array<keyof typeof profiles>, process.env.SHOT_PROFILES)) {
    for (const themeName of pick(Object.keys(themes) as Array<keyof typeof themes>, process.env.SHOT_THEMES)) {
      const theme = themes[themeName]
      const context = await browser.newContext({ ...profiles[profileName], colorScheme: theme, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', serviceWorkers: 'block' })
      await context.addInitScript(([value, windUnit]) => {
        localStorage.setItem('motregen-theme', value!)
        if (windUnit) localStorage.setItem('motregen-wind-unit', windUnit)
      }, [theme, unit] as const)
      const page = await context.newPage()
      page.setDefaultTimeout(120_000)
      await page.goto(new URL(`/wind/utrecht?t=${encodeURIComponent(time)}&dev&${params}`, origin).href)
      await page.locator('.map-splash.ready').waitFor({ state: 'attached' })
      await page.addStyleTag({ content: '.dev-panel { display: none !important; }' })
      await page.locator('.scrubber-placeholder').waitFor({ state: 'detached' })
      const close = page.locator('.freshness-close')
      if (await close.isVisible().catch(() => false)) await close.click()
      await page.mouse.move(5, 5)
      await page.waitForFunction(() => Number(document.querySelector<HTMLElement>('.map-overlay-windsocks')?.dataset.socks?.split('|')[0]) > 0)
      // `zakeenheid=legenda` heeft de legenda nodig; op de telefoon is die dicht.
      const legend = page.locator('.map-legend-button[aria-expanded="false"]')
      if (params.get('zakeenheid') === 'legenda' && await legend.isVisible().catch(() => false)) {
        await legend.click()
        await page.mouse.move(5, 5)
      }
      await page.waitForTimeout(4_000)
      const socks = Number((await page.locator('.map-overlay-windsocks').getAttribute('data-socks'))?.split('|')[0])
      const name = `${slug}-${profileName}-${themeName}`
      counts[name] = socks
      const path = join(outDir, `${name}.png`)
      await page.locator('.map-shell').screenshot({ path })
      console.log('shot', path, 'zakken', socks)
      await context.close()
    }
  }
}
await browser.close()
writeFileSync(join(outDir, 'counts.json'), `${JSON.stringify(counts, null, 2)}\n`)
