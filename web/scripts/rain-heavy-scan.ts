// Zoekt in de live regendata naar momenten met veel regen, om regenlijnen en legenda op echte buien te beoordelen.
// Gebruik: tsx scripts/rain-heavy-scan.ts [origin] [drempel-mm/u]
// Per frame: aantal cellen boven 1 mm/u en boven de drempel, plus het zwaartepunt van de zware cellen (lengte/breedte).
import { decodeFrame, parseMrfHeader } from '../src/core/mrf-codec.js'

const origin = process.argv[2] ?? 'https://motregen.nl'
const heavyRate = Number(process.argv[3] ?? 10)
const manifest = await (await fetch(`${origin}/data/manifest.json`)).json() as { chunks: Array<{ url: string; field: string; source: string; header_len: number }> }

function lngLat(x: number, y: number): [number, number] {
  const earthRadius = 6378137
  return [x / earthRadius * 180 / Math.PI, (2 * Math.atan(Math.exp(y / earthRadius)) - Math.PI / 2) * 180 / Math.PI]
}

const rows: Array<{ source: string; time: string; over1: number; heavy: number; centre: string }> = []
for (const chunk of manifest.chunks.filter((entry) => entry.field === 'rain_rate')) {
  const bytes = new Uint8Array(await (await fetch(`${origin}/data/${chunk.url}`)).arrayBuffer())
  const header = parseMrfHeader(bytes.subarray(0, chunk.header_len))
  const payload = bytes.subarray(chunk.header_len)
  const { width, height } = header.grid
  for (const frame of header.frames) {
    const cells = decodeFrame(payload.subarray(frame.offset, frame.offset + frame.len), width * height, header.pred ? { width, height } : undefined)
    let over1 = 0
    let heavy = 0
    let sumColumn = 0
    let sumRow = 0
    for (let index = 0; index < cells.length; index++) {
      const rate = cells[index] === 255 ? 0 : header.quant[cells[index]!] ?? 0
      if (rate >= 1) over1++
      if (rate >= heavyRate) {
        heavy++
        sumColumn += index % width
        sumRow += Math.floor(index / width)
      }
    }
    if (heavy === 0) continue
    const [lng, lat] = lngLat(header.grid.x0 + (sumColumn / heavy + 0.5) * header.grid.dx, header.grid.y0 + (sumRow / heavy + 0.5) * header.grid.dy)
    rows.push({ source: chunk.source, time: frame.time, over1, heavy, centre: `${lng.toFixed(2)} ${lat.toFixed(2)}` })
  }
}
rows.sort((first, second) => second.heavy - first.heavy)
for (const row of rows.slice(0, 15)) console.log(row.source.padEnd(9), row.time, `≥1: ${row.over1}`, `≥${heavyRate}: ${row.heavy}`, 'zwaartepunt', row.centre)
