// Vat een ruw Gecko-profiel (Firefox about:debugging → Downloaden, .json.gz, formaat versie ≥ 30) samen per draad:
// CPU-tijd per seconde opname (uit threadCPUDelta) en de duurste markers. Bedoeld om te zien of Firefox op Android
// zijn tijd in de content-hoofddraad, de Renderer of de Compositor kwijt is.
// Gebruik: node web/scripts/gecko-threads.mjs <profiel.json.gz> [--threads=GeckoMain,Renderer,...]
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

const [file, ...flags] = process.argv.slice(2)
const threadFilter = flags.find((f) => f.startsWith('--threads='))?.slice('--threads='.length).split(',')

const raw = readFileSync(file)
const profile = JSON.parse(file.endsWith('.gz') ? gunzipSync(raw) : raw)

function* allThreads(p, startOffset = 0) {
  const offset = (p.meta.startTime ?? 0) - startOffset
  for (const thread of p.threads) yield { thread, offset }
  for (const child of p.processes ?? []) yield* allThreads(child, startOffset || p.meta.startTime)
}

function table(t) {
  const idx = t.schema
  return t.data.map((row) => Object.fromEntries(Object.entries(idx).map(([k, i]) => [k, row[i]])))
}

const rows = []
for (const { thread } of allThreads(profile)) {
  if (threadFilter && !threadFilter.some((n) => thread.name.startsWith(n))) continue
  const samples = table(thread.samples)
  if (samples.length < 2) continue
  const span = (samples.at(-1).time - samples[0].time) / 1000
  const cpuUnit = profile.meta.sampleUnits?.threadCPUDelta ?? 'µs'
  const cpuTotal = samples.reduce((s, r) => s + (r.threadCPUDelta ?? 0), 0)
  const cpuMs = cpuUnit === 'ns' ? cpuTotal / 1e6 : cpuUnit === 'µs' ? cpuTotal / 1000 : cpuTotal
  const markers = table(thread.markers)
  const byName = new Map()
  for (const m of markers) {
    if (m.phase !== 1 || m.startTime == null || m.endTime == null) continue
    const name = thread.stringTable[m.name]
    const e = byName.get(name) ?? { n: 0, ms: 0, max: 0 }
    const d = m.endTime - m.startTime
    e.n += 1
    e.ms += d
    e.max = Math.max(e.max, d)
    byName.set(name, e)
  }
  const top = [...byName.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 6)
  rows.push({ name: `${thread.processName ?? thread.processType}/${thread.name}`, span, cpuPerS: cpuMs / span, top })
}

rows.sort((a, b) => b.cpuPerS - a.cpuPerS)
for (const r of rows.slice(0, 14)) {
  console.log(`${r.name}: ${r.cpuPerS.toFixed(0)} ms CPU per s over ${r.span.toFixed(1)} s`)
  for (const [n, e] of r.top) {
    console.log(`    ${n}: ${e.n}× · ${(e.ms / r.span).toFixed(0)} ms per s · max ${e.max.toFixed(0)} ms`)
  }
}
