// CPU-profiel hoofddraad (CDP Profiler) tijdens afspelen, zelftijd per bronbestand/-regel via de sourcemaps.
// node profile.mjs <url> <distDir> [scenario: weer|temperatuur] [seconden]
import { createRequire, SourceMap } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
const require = createRequire(`${process.cwd()}/`)
const { chromium } = require('@playwright/test')
const [url, dist, scenario = 'weer', seconds = '10'] = process.argv.slice(2)
const maps = new Map()
for (const file of readdirSync(`${dist}/assets`)) if (file.endsWith('.js.map')) maps.set(file.replace(/\.map$/, ''), new SourceMap(JSON.parse(readFileSync(`${dist}/assets/${file}`, 'utf8'))))
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
await page.goto(url)
await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
await page.waitForTimeout(40_000)
const slider = page.getByRole('slider', { name: 'Tijd' })
await slider.press('Home')
if (scenario === 'temperatuur') await page.locator('.temperature-focus').first().click()
await page.waitForTimeout(3_000)
const cdp = await page.context().newCDPSession(page)
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
await cdp.send('Profiler.start')
await page.waitForTimeout(Number(seconds) * 1000)
const { profile } = await cdp.send('Profiler.stop')
await browser.close()
const byId = new Map(profile.nodes.map((node) => [node.id, node]))
const parent = new Map()
for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id)
const dt = new Map()
for (let i = 0; i < profile.samples.length; i++) dt.set(profile.samples[i], (dt.get(profile.samples[i]) ?? 0) + (profile.timeDeltas[i + 1] ?? 0))
const where = (frame) => {
  const file = frame.url.split('/').pop()
  const map = maps.get(file)
  if (!map) return frame.url ? `${file}:${frame.functionName || '?'}` : `(${frame.functionName || 'native'})`
  const entry = map.findEntry(frame.lineNumber, frame.columnNumber)
  const source = (entry?.originalSource ?? '?').replace(/^.*node_modules\/(\.pnpm\/)?/, '').replace(/^.*\/src\//, 'src/')
  return `${source.split('/').slice(-2).join('/')}:${(entry?.originalLine ?? 0) + 1} ${frame.functionName || entry?.name || ''}`
}
const self = new Map(), fileSelf = new Map(), inclusive = new Map()
let total = 0
for (const [id, ms] of dt) {
  const node = byId.get(id)
  const key = where(node.callFrame)
  total += ms
  self.set(key, (self.get(key) ?? 0) + ms)
  const file = key.split(':')[0]
  fileSelf.set(file, (fileSelf.get(file) ?? 0) + ms)
  const seen = new Set()
  for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
    const k = where(byId.get(cur).callFrame)
    if (seen.has(k)) continue
    seen.add(k)
    inclusive.set(k, (inclusive.get(k) ?? 0) + ms)
  }
}
const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${(v / 1000).toFixed(0).padStart(6)} ms ${(100 * v / total).toFixed(1).padStart(5)}%  ${k}`).join('\n')
console.log(`totaal ${(total / 1e6).toFixed(2)} s gesampled\n-- zelftijd per bestand --\n${top(fileSelf, 25)}\n-- zelftijd --\n${top(self, 40)}\n-- inclusief --\n${top(inclusive, 60)}`)
