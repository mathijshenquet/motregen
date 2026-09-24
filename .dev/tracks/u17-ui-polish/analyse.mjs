// node analyse.mjs — leest prod-poll.jsonl + knmi-rtcor-files.json; per rtcor-frame de keten
// scantijd → KNMI created → manifest generated, en een simulatie van de pil-leeftijd bij
// oude (vaste 60 s) en nieuwe (15 s rond verwachte publicatie) manifestpoll.
import { readFileSync } from 'node:fs'
const dir = new URL('.', import.meta.url)
const rows = readFileSync(new URL('prod-poll.jsonl', dir), 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter((row) => !row.error)
const knmi = JSON.parse(readFileSync(new URL('knmi-rtcor-files.json', dir), 'utf8')).files
const labelOf = (name) => { const m = name.match(/(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)\.h5$/); return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) }
const created = new Map(knmi.map((file) => [labelOf(file.filename), Date.parse(file.created)]))

// Eerste manifest-generatie waarin elk radarframe het nieuwste is.
const frames = []
for (const row of rows) {
  const radar = Date.parse(row.radar)
  if (frames.at(-1)?.radar === radar) continue
  frames.push({ radar, generated: Date.parse(row.generated), seen: Date.parse(row.at) })
}
frames.shift() // eerste frame: al gepubliceerd vóór de meting begon
const s = (ms) => (ms / 1000).toFixed(0).padStart(4)
console.log('frame  KNMI-created  manifest   KNMI−scan  ingest  (probe zag na generated)')
for (const f of frames) {
  const c = created.get(f.radar)
  console.log(new Date(f.radar).toISOString().slice(11, 16), c ? new Date(c).toISOString().slice(11, 19) : '   ?    ', new Date(f.generated).toISOString().slice(11, 19), c ? s(c - f.radar) : '   ?', c ? s(f.generated - c) : '   ?', s(f.seen - f.generated))
}

// Simulatie: client ziet frame i bij de eerste poll ≥ generated_i.
const RADAR = 5 * 60_000, EARLY = 90_000, WINDOW = 4 * 60_000
const fastDelay = (now, radar) => { const due = radar + RADAR + EARLY; if (now < due) return Math.max(1000, Math.min(60_000, due - now)); if (now < due + WINDOW) return 15_000; return 60_000 }
const start = frames[0].generated, end = frames.at(-1).generated + 4 * 60_000
function simulate(policy, phase) {
  let t = start + phase, idx = 0, polls = 0
  const seen = [] // [tijd, radar]
  while (t < end) {
    polls++
    while (idx < frames.length && frames[idx].generated <= t) { seen.push([t, frames[idx].radar]); idx++ }
    const latest = seen.at(-1)?.[1] ?? frames[0].radar - RADAR
    t += policy === 'oud' ? 60_000 : fastDelay(t, latest)
  }
  return { seen, polls }
}
function ageStats(seen) {
  const samples = []
  for (let t = seen[0][0]; t < end - 60_000; t += 1000) {
    let radar = seen[0][1]; for (const [at, r] of seen) if (at <= t) radar = r
    samples.push((t - radar) / 60_000)
  }
  samples.sort((a, b) => a - b)
  const q = (p) => samples[Math.floor(p * (samples.length - 1))].toFixed(1)
  return { mean: (samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(2), p50: q(0.5), p95: q(0.95), max: q(1) }
}
for (const policy of ['oud', 'nieuw']) {
  const lags = [], stats = [], polls = []
  for (let phase = 0; phase < 60_000; phase += 5_000) {
    const run = simulate(policy, phase)
    polls.push(run.polls)
    for (const [at, radar] of run.seen.slice(1)) lags.push((at - frames.find((f) => f.radar === radar).generated) / 1000)
    stats.push(ageStats(run.seen))
  }
  lags.sort((a, b) => a - b)
  const avg = (key) => (stats.reduce((sum, stat) => sum + Number(stat[key]), 0) / stats.length).toFixed(2)
  console.log(`${policy}: generated→client gem ${(lags.reduce((a, b) => a + b, 0) / lags.length).toFixed(0)} s, max ${lags.at(-1).toFixed(0)} s; pil-leeftijd gem ${avg('mean')} min, p50 ${avg('p50')}, p95 ${avg('p95')}, max ${avg('max')}; polls/uur ${(polls.reduce((a, b) => a + b, 0) / polls.length / ((end - start) / 3_600_000)).toFixed(0)}`)
}
