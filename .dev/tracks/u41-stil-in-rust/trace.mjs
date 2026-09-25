// Hoofddraad-trace (devtools.timeline) tijdens afspelen: top-level taaktijd per eventnaam.
// node trace.mjs <url> [scenario] [seconden]
import { createRequire } from 'node:module'
const require = createRequire(`${process.cwd()}/`)
const { chromium } = require('@playwright/test')
const [url, scenario = 'weer', seconds = '5'] = process.argv.slice(2)
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
await page.goto(url)
await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
await page.waitForTimeout(40_000)
await page.getByRole('slider', { name: 'Tijd' }).press('Home')
if (scenario === 'temperatuur') await page.locator('.temperature-focus').first().click()
if (process.env.TRACE_CSS) await page.addStyleTag({ content: process.env.TRACE_CSS })
await page.waitForTimeout(3_000)
await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] })
await page.waitForTimeout(Number(seconds) * 1000)
const events = JSON.parse((await browser.stopTracing()).toString()).traceEvents
await browser.close()
const main = events.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain')
const onMain = events.filter((e) => e.pid === main.pid && e.tid === main.tid && e.ph === 'X' && e.dur)
const tasks = onMain.filter((e) => e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask')
const total = tasks.reduce((sum, e) => sum + e.dur, 0)
// Directe kinderen van taken: wat vult de taak?
const byName = new Map()
for (const e of onMain) {
  if (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask') continue
  const parent = tasks.find((t) => t.ts <= e.ts && e.ts + e.dur <= t.ts + t.dur)
  if (!parent) continue
  const nested = onMain.some((o) => o !== e && o !== parent && o.name !== 'RunTask' && o.name !== 'ThreadControllerImpl::RunTask' && o.ts <= e.ts && e.ts + e.dur <= o.ts + o.dur && o.dur > e.dur)
  if (nested) continue
  const key = e.name === 'FunctionCall' || e.name === 'EventDispatch' || e.name === 'TimerFire' || e.name === 'FireAnimationFrame' ? `${e.name}` : e.name
  byName.set(key, (byName.get(key) ?? 0) + e.dur)
}
console.log(`taaktijd hoofddraad ${(total / 1000).toFixed(0)} ms over ${seconds} s, ${tasks.length} taken`)
for (const [name, dur] of [...byName].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`${(dur / 1000).toFixed(0).padStart(6)} ms  ${name}`)
