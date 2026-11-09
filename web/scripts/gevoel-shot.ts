import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// U105: Gevoel-kaart + tabel op desktop voor ?dev&gevoel=nu|zon|zon-sterk, plus een vergelijkingsblad per moment.
// Gebruik: pnpm exec tsx scripts/gevoel-shot.ts ORIGIN OUT_DIR NOW_ISO PLAATS LOKALE_TIJD[,LOKALE_TIJD…]
//   bijv. … http://localhost:4375 ../.dev/tracks/u105-gevoel-zon/shots 2026-09-30T07:10:00Z utrecht 2026-09-30T1100
// NOW_ISO is de "now" van de snapshot: de browserklok staat daarop, zodat de data niet als oud geldt.
const [origin, outDir, now, place, times] = process.argv.slice(2)
if (!origin || !outDir || !now || !place || !times) throw new Error('usage: pnpm exec tsx scripts/gevoel-shot.ts ORIGIN OUT_DIR NOW_ISO PLAATS LOKALE_TIJD[,…]')
mkdirSync(outDir, { recursive: true })
const variants = ['nu', 'zon', 'zon-sterk'] as const
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const problems: string[] = []
for (const time of times.split(',')) {
  const shots: string[] = []
  for (const variant of variants) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: 'light' })
    const page = await context.newPage()
    page.on('pageerror', (error) => problems.push(`${variant} pageerror: ${error.message}`))
    page.on('console', (message) => { if (message.type() === 'error') problems.push(`${variant} console: ${message.text()}`) })
    await page.clock.install({ time: new Date(now) })
    await page.addInitScript(() => localStorage.setItem('motregen-theme', 'light'))
    await page.goto(new URL(`/gevoel/${place}?dev&gevoel=${variant}#t=${time}`, origin).href)
    // De tabelrijen verder van nu laden pas na de diepe idle (30 s + 5 s, App.tsx scheduleDeepIdle).
    await page.waitForTimeout(40_000)
    await page.addStyleTag({ content: '.dev-panel { display: none !important }' })
    // De versheidsdialoog opent bij een klok die op de snapshot staat; hij hoort niet in het vergelijkingsbeeld.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(2_000)
    const file = `gevoel-${time}-${place}-${variant}.png`
    await page.screenshot({ path: join(outDir, file) })
    shots.push(file)
    await context.close()
  }
  const label = `${time.slice(0, 10)} ${time.slice(11, 13)}:${time.slice(13)} lokaal · ${place}`
  const sheet = join(outDir, `blad-${time}-${place}.html`)
  writeFileSync(sheet, `<!doctype html><meta charset="utf-8"><style>
body{margin:0;font:15px system-ui,sans-serif;background:#f4f4f2;color:#1c1c1c}
h1{font-size:20px;margin:16px 20px 4px}p{margin:0 20px 12px;color:#555}
.row{display:flex;gap:12px;padding:0 20px 20px}figure{margin:0;flex:1}
figcaption{font-weight:600;margin:0 0 6px}img{width:100%;border:1px solid #ccc;display:block}
</style><h1>Gevoel met zon (U105) · ${label}</h1>
<p>HARMONIE uit het dev-archief (snapshot ${now}); desktop 1280 × 800; de kaart staat op het moment, de tabel begint bij het snapshot-nu. nu = MIP-10 (ingest), zon = MIP-41-kalibratie, zon-sterk = dubbele Q.</p>
<div class="row">${variants.map((variant, index) => `<figure><figcaption>?dev&amp;gevoel=${variant}</figcaption><img src="${shots[index]}"></figure>`).join('')}</div>`)
  const context = await browser.newContext({ viewport: { width: 2400, height: 700 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  await page.goto(`file://${resolve(sheet)}`)
  await page.screenshot({ path: join(outDir, `blad-${time}-${place}.png`), fullPage: true })
  await context.close()
}
await browser.close()
writeFileSync(join(outDir, 'problemen.txt'), problems.join('\n'))
console.log(problems.length ? `${problems.length} problemen, zie problemen.txt` : 'geen console-fouten')
