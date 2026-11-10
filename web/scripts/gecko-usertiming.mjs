import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
const p = JSON.parse(gunzipSync(readFileSync(process.argv[2])))
const all = []
const walk = (q) => { all.push(...q.threads); for (const c of q.processes ?? []) walk(c) }
walk(p)
const tab = (t) => t.data.map((r) => Object.fromEntries(Object.entries(t.schema).map(([k, i]) => [k, r[i]])))
const out = {}
for (const t of all) {
  if (t.name !== 'GeckoMain') continue
  for (const m of tab(t.markers)) {
    const n = t.stringTable[m.name]
    if (n !== 'UserTiming' || !m.data) continue
    const name = String(m.data.name).replace(/^motregen:/, '')
    if (!['windsock-draw', 'wind-step', 'rain-frame-committed', 'isoline-blit'].includes(name)) continue
    ;(out[name] ??= []).push(m.startTime)
  }
}
const pct = (a, q) => a[Math.min(a.length - 1, Math.floor(a.length * q))]
const parts = []
for (const [name, ts] of Object.entries(out)) {
  ts.sort((a, b) => a - b)
  const gaps = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b)
  const span = (ts.at(-1) - ts[0]) / 1000
  parts.push(`${name} ${(ts.length / span).toFixed(1)}/s gat p50 ${pct(gaps, 0.5).toFixed(0)} ms p90 ${pct(gaps, 0.9).toFixed(0)} ms`)
}
console.log(parts.join(' | '))
