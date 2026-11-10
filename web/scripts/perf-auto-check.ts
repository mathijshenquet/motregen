import { firefox } from '@playwright/test'

// U111: verstuurt `?perf=start&auto` de koude-startopname na afloop zelf naar de profielsink? Opent de link in Firefox,
// wacht tot de app "Verstuurd als …" meldt en drukt de bestandsnaam af. Draai tegen een preview waarvan
// MOTREGEN_PROF_ORIGIN naar een eigen sink wijst (scripts/prof-sink.ts met MOTREGEN_PROFILE_DIR), niet naar die van
// de orkestrator.
//
// usage: xvfb-run -a pnpm exec tsx scripts/perf-auto-check.ts 'ORIGIN/?perf=start&auto&modus=wind&dev'

const url = process.argv[2]
if (!url) throw new Error("usage: pnpm exec tsx scripts/perf-auto-check.ts 'ORIGIN/?perf=start&auto&…'")
const browser = await firefox.launch({ headless: !process.env.DISPLAY, firefoxUserPrefs: { 'webgl.force-enabled': true, 'gfx.webrender.software': true } })
const page = await browser.newPage({ viewport: { width: 402, height: 844 }, deviceScaleFactor: 3 })
await page.goto(url)
const notice = await page.waitForFunction(() => Array.from(document.querySelectorAll('*')).map((element) => element.textContent ?? '').find((text) => /^(Verstuurd|Niet verstuurd)/.test(text.trim()) && text.length < 200)?.trim(), undefined, { timeout: 90_000, polling: 1_000 })
console.log(await notice.jsonValue())
await browser.close()
