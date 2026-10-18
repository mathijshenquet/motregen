// Rekentijd van S1 (k-overgang) in de browserroute: één locatie × 48 uur, en één kaartframe op het 8 km-raster.
// Gebruik: node tools/zonneschijn/bench.mts [substappen per uur, standaard 30]
import { solarElevationSin, solarPosition } from '../../web/src/core/solar.ts'

const SUBSTEPS = Number(process.argv[2] ?? 30)
const SUN_THRESHOLD_SIN = Math.sin(4.2 * Math.PI / 180)
const RAMP_LOW = 0.28
const RAMP_HIGH = 0.92
const hour = 3_600_000

function clearSkyRadiation(mu: number): number {
  return mu > 0.01 ? 1_098 * mu * Math.exp(-0.057 / mu) : 0
}

function sunshineMinutes(hourEnd: number, radiation: number, sinElevation: (epoch: number) => number): number {
  let clear = 0
  let possible = 0
  for (let step = 0; step < SUBSTEPS; step++) {
    const mu = sinElevation(hourEnd - hour + (step + 0.5) * hour / SUBSTEPS)
    clear += clearSkyRadiation(mu) / SUBSTEPS
    if (mu > SUN_THRESHOLD_SIN) possible += 1 / SUBSTEPS
  }
  if (clear <= 1) return 0
  const index = radiation / clear
  return 60 * possible * Math.min(1, Math.max(0, (index - RAMP_LOW) / (RAMP_HIGH - RAMP_LOW)))
}

function time(label: string, repeats: number, work: () => number) {
  let sink = 0
  for (let warm = 0; warm < 3; warm++) sink += work()
  const start = performance.now()
  for (let repeat = 0; repeat < repeats; repeat++) sink += work()
  const each = (performance.now() - start) / repeats
  console.log(`${label}: ${each.toFixed(3)} ms (controlesom ${sink.toFixed(0)})`)
}

const start = Date.parse('2026-06-21T00:00:00Z')

time('tabel: 1 locatie × 48 uur', 200, () => {
  let total = 0
  for (let lead = 1; lead <= 48; lead++) {
    total += sunshineMinutes(start + lead * hour, 400, (epoch) => solarElevationSin(epoch, 5.18, 52.1))
  }
  return total
})

// Kaartframe: de zonnestand per substap één keer, daarna alleen de uurhoek per cel.
const columns = 157
const rows = 169
const radiation = new Float32Array(columns * rows).fill(400)
time(`kaart: ${columns}×${rows} cellen × 1 uur`, 20, () => {
  const hourEnd = start + 12 * hour
  const positions = Array.from({ length: SUBSTEPS }, (_, step) => solarPosition(hourEnd - hour + (step + 0.5) * hour / SUBSTEPS))
  let total = 0
  for (let row = 0; row < rows; row++) {
    const latitude = (49 + row * 0.072) * Math.PI / 180
    for (let column = 0; column < columns; column++) {
      const longitude = (column * 0.117) * Math.PI / 180
      let clear = 0
      let possible = 0
      for (const { declination, subsolarLongitude } of positions) {
        const mu = Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * Math.cos(declination) * Math.cos(longitude - subsolarLongitude)
        clear += clearSkyRadiation(mu) / SUBSTEPS
        if (mu > SUN_THRESHOLD_SIN) possible += 1 / SUBSTEPS
      }
      const index = clear > 1 ? radiation[row * columns + column] / clear : 0
      total += 60 * possible * Math.min(1, Math.max(0, (index - RAMP_LOW) / (RAMP_HIGH - RAMP_LOW)))
    }
  }
  return total
})
