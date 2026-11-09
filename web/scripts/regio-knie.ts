import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { constants, zstdCompressSync } from 'node:zlib'
import type { Field, Manifest, MrfHeader, Source } from '../src/core/contract.js'
import { decodeFrame, parseMrfHeader } from '../src/core/mrf-codec.js'
import { decodePlaces, type CompactPlaces } from '../src/core/place-data.js'
import { solarElevationSin } from '../src/core/solar.js'
import { sunshineInputs, sunshineMinutes } from '../src/core/sunshine.js'
import { buildTimeline } from '../src/core/time-model.js'
import { summarizeWind } from '../src/core/weather.js'

// MIP-40 (U102 fase 2): wat kost een puntreeks per regio en hoe groot is de fout t.o.v. het eigen gridpunt?
// Gebruik: pnpm exec tsx scripts/regio-knie.ts <snapshotmap>... [--sizes 50,100,200,400,800] [--json uit.json]
// Een snapshotmap bevat manifest.json en de chunks die hij noemt (tools/fetch-data-snapshot.sh).

// Het NL+Vlaanderen-kader van het 6 km-detailgrid (docs/pollen.md, `DETAIL_GRID`), in EPSG:3857-meters.
const FRAME = { west: 258_000, east: 834_000, north: 7_132_000, south: 6_502_000 }
const EARTH_RADIUS = 6_378_137
// Schaal van EPSG:3857 bij het midden van het kader (≈ 52,1° N): 1 kaartmeter = cos(φ) echte meter.
const FRAME_SCALE = Math.cos(2 * Math.atan(Math.exp(((FRAME.north + FRAME.south) / 2) / EARTH_RADIUS)) - Math.PI / 2)

const FIELDS: readonly Field[] = ['rain_rate', 'temp_c', 'feels_like_c', 'wind_u_ms', 'wind_v_ms', 'gust_ms', 'radiation', 'radiation_direct', 'cloud_frac', 'cloud_low', 'cloud_mid', 'cloud_high', 'uv', 'uv_clear']

/** Bestandsgroepen naar verversingsritme: radar en nowcast elke 5 min, HARMONIE elk uur, de rest eigen ritme. */
const GROUPS: Array<{ name: string; label: string; includes: (field: Field, source: Source) => boolean }> = [
  { name: 'radar', label: 'radar + nowcast + seamless (5 min)', includes: (field, source) => field === 'rain_rate' && ['rtcor', 'nowcast', 'seamless'].includes(source) },
  { name: 'harmonie', label: 'HARMONIE, alle getoonde velden (1 u)', includes: (_field, source) => source === 'harmonie' },
  { name: 'extra', label: 'UV + ICON-D2 direct (eigen ritme)', includes: (_field, source) => source === 'uv' || source === 'icon_d2' },
]

interface Cube {
  field: Field
  /** Rasteronderdeel binnen het kader: kolom/rij-offset in het bronraster en afmetingen. */
  x0: number; y0: number; dx: number; dy: number; width: number; height: number
  quant: Array<number | null>
  frames: Array<{ epoch: number; source: Source; run: string; cells: Uint8Array }>
}

const args = process.argv.slice(2)
const snapshots: string[] = []
let sizes = [50, 100, 200, 400, 800]
let jsonOutput: string | undefined
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--sizes') sizes = args[++index]!.split(',').map(Number)
  else if (args[index] === '--json') jsonOutput = args[++index]
  else snapshots.push(args[index]!)
}
if (!snapshots.length) throw new Error('Gebruik: tsx scripts/regio-knie.ts <snapshotmap>... [--sizes 50,100] [--json uit.json]')

const places = decodePlaces(JSON.parse(readFileSync(new URL('../public/plaatsen-4d18b8790eecd5af.json', import.meta.url), 'utf8')) as CompactPlaces)
  .map((place) => ({ ...place, x: mercatorX(place.lng), y: mercatorY(place.lat) }))
  .filter((place) => place.x >= FRAME.west && place.x < FRAME.east && place.y <= FRAME.north && place.y > FRAME.south)



function mercatorX(longitude: number): number { return EARTH_RADIUS * longitude * Math.PI / 180 }
function mercatorY(latitude: number): number { return EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)) }

function loadCube(snapshot: string, manifest: Manifest, field: Field): Cube | undefined {
  const timeline = buildTimeline(manifest, field)
  if (!timeline.length) return undefined
  const files = new Map<string, { bytes: Uint8Array; header: MrfHeader; headerLength: number }>()
  const chunkOf = (url: string, headerLength: number) => {
    let file = files.get(url)
    if (!file) {
      const bytes = new Uint8Array(readFileSync(join(snapshot, url)))
      file = { bytes, header: parseMrfHeader(bytes.subarray(0, headerLength)), headerLength }
      files.set(url, file)
    }
    return file
  }
  let cube: Cube | undefined
  for (const frame of timeline) {
    const { bytes, header, headerLength } = chunkOf(frame.chunk.url, frame.chunk.header_len)
    const grid = header.grid
    const entry = header.frames[frame.frameIndex]!
    const payload = bytes.subarray(headerLength + entry.offset, headerLength + entry.offset + entry.len)
    const cells = decodeFrame(payload, grid.width * grid.height, header.pred ? { width: grid.width, height: grid.height } : undefined)
    const firstColumn = Math.max(0, Math.ceil((FRAME.west - grid.x0) / grid.dx - 0.5))
    const lastColumn = Math.min(grid.width - 1, Math.floor((FRAME.east - grid.x0) / grid.dx - 0.5))
    const firstRow = Math.max(0, Math.ceil((FRAME.north - grid.y0) / grid.dy - 0.5))
    const lastRow = Math.min(grid.height - 1, Math.floor((FRAME.south - grid.y0) / grid.dy - 0.5))
    const width = lastColumn - firstColumn + 1
    const height = lastRow - firstRow + 1
    if (cube && (cube.width !== width || cube.height !== height || cube.dx !== grid.dx)) throw new Error(`${field}: wisselend raster binnen de tijdlijn`)
    cube ??= { field, x0: grid.x0 + firstColumn * grid.dx, y0: grid.y0 + firstRow * grid.dy, dx: grid.dx, dy: grid.dy, width, height, quant: header.quant, frames: [] }
    const cropped = new Uint8Array(width * height)
    for (let row = 0; row < height; row++) cropped.set(cells.subarray((firstRow + row) * grid.width + firstColumn, (firstRow + row) * grid.width + firstColumn + width), row * width)
    cube.frames.push({ epoch: frame.epoch, source: frame.source, run: frame.run, cells: cropped })
  }
  return cube
}

function cellIndex(cube: Cube, x: number, y: number): number | null {
  const column = Math.floor((x - cube.x0) / cube.dx)
  const row = Math.floor((y - cube.y0) / cube.dy)
  return column < 0 || row < 0 || column >= cube.width || row >= cube.height ? null : row * cube.width + column
}

interface Regions {
  count: number; columns: number; rows: number; sideKm: number; withPlaces: number
  /** Regio van een kaartpunt. */
  of: (x: number, y: number) => number
  centre: (region: number) => { x: number; y: number }
}

function regionGrid(target: number): Regions {
  const width = FRAME.east - FRAME.west
  const height = FRAME.north - FRAME.south
  const side = Math.sqrt(width * height / target)
  const columns = Math.max(1, Math.round(width / side))
  const rows = Math.max(1, Math.round(height / side))
  const cellWidth = width / columns
  const cellHeight = height / rows
  const of = (x: number, y: number) => Math.min(rows - 1, Math.floor((FRAME.north - y) / cellHeight)) * columns + Math.min(columns - 1, Math.floor((x - FRAME.west) / cellWidth))
  const withPlaces = new Set(places.map((place) => of(place.x, place.y))).size
  return {
    count: columns * rows, columns, rows, withPlaces,
    sideKm: Math.sqrt(cellWidth * cellHeight) * FRAME_SCALE / 1000,
    of,
    centre: (region) => ({ x: FRAME.west + (region % columns + 0.5) * cellWidth, y: FRAME.north - (Math.floor(region / columns) + 0.5) * cellHeight }),
  }
}

type Variant = 'centre' | 'mean'

/** Per regio en frame de waarde die het regiobestand zou dragen: het midden of het gemiddelde over de cellen. */
function regionSeries(cube: Cube, regions: Regions, variant: Variant): Array<Float64Array> {
  if (variant === 'centre') {
    const centres = Array.from({ length: regions.count }, (_, region) => { const centre = regions.centre(region); return cellIndex(cube, centre.x, centre.y) })
    return cube.frames.map((frame) => Float64Array.from(centres, (index) => index === null ? Number.NaN : dequantize(cube, frame.cells[index]!)))
  }
  const regionOfCell = new Int32Array(cube.width * cube.height)
  for (let row = 0; row < cube.height; row++) {
    for (let column = 0; column < cube.width; column++) regionOfCell[row * cube.width + column] = regions.of(cube.x0 + (column + 0.5) * cube.dx, cube.y0 + (row + 0.5) * cube.dy)
  }
  return cube.frames.map((frame) => {
    const sums = new Float64Array(regions.count)
    const counts = new Float64Array(regions.count)
    for (let index = 0; index < frame.cells.length; index++) {
      const value = dequantize(cube, frame.cells[index]!)
      if (Number.isNaN(value)) continue
      sums[regionOfCell[index]!] += value
      counts[regionOfCell[index]!] += 1
    }
    return sums.map((sum, region) => counts[region] ? sum / counts[region]! : Number.NaN)
  })
}

function dequantize(cube: Cube, quantized: number): number {
  const value = cube.quant[quantized]
  return value === null || value === undefined ? Number.NaN : value
}

/** Waarde op de plaats zelf (eigen gridpunt) en in zijn regio, per frame. */
function pairs(cube: Cube, regions: Regions, variant: Variant): Array<{ place: typeof places[number]; own: number[]; region: number[] }> {
  const series = regionSeries(cube, regions, variant)
  return places.flatMap((place) => {
    const index = cellIndex(cube, place.x, place.y)
    if (index === null) return []
    const region = regions.of(place.x, place.y)
    return [{ place, own: cube.frames.map((frame) => dequantize(cube, frame.cells[index]!)), region: series.map((frame) => frame[region]!) }]
  })
}

function absoluteStats(differences: number[]): { mae: number; p95: number } {
  const finite = differences.filter(Number.isFinite).map(Math.abs).sort((left, right) => left - right)
  if (!finite.length) return { mae: Number.NaN, p95: Number.NaN }
  return { mae: finite.reduce((sum, value) => sum + value, 0) / finite.length, p95: finite[Math.min(finite.length - 1, Math.floor(finite.length * 0.95))]! }
}

const formatted = (value: number, digits = 2) => Number.isFinite(value) ? value.toLocaleString('nl-NL', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—'

function fieldErrors(cubes: Map<Field, Cube>, regions: Regions, variant: Variant) {
  const rows: Array<{ field: string; label: string; text: string; values: Record<string, number> }> = []
  const scalar = (field: Field, label: string, unit: string, scale = 1) => {
    const cube = cubes.get(field)
    if (!cube) return
    const stats = absoluteStats(pairs(cube, regions, variant).flatMap((pair) => pair.own.map((value, index) => (value - pair.region[index]!) * scale)))
    rows.push({ field, label, text: `MAE ${formatted(stats.mae)} ${unit}, p95 ${formatted(stats.p95)} ${unit}`, values: stats })
  }
  const rain = cubes.get('rain_rate')
  if (rain) {
    const wet = 0.1
    const all = pairs(rain, regions, variant)
    let flips = 0
    let total = 0
    const wetDifferences: number[] = []
    for (const pair of all) {
      pair.own.forEach((value, index) => {
        const other = pair.region[index]!
        if (!Number.isFinite(value) || !Number.isFinite(other)) return
        total += 1
        if ((value >= wet) !== (other >= wet)) flips += 1
        if (value >= wet || other >= wet) wetDifferences.push(value - other)
      })
    }
    const stats = absoluteStats(wetDifferences)
    const wetShare = wetDifferences.length / Math.max(1, total)
    rows.push({ field: 'rain_rate', label: 'regen', text: `droog/nat omgeslagen in ${formatted(100 * flips / Math.max(1, total), 1)} % van de tijdstappen (nat in ${formatted(100 * wetShare, 1)} %), MAE nat ${formatted(stats.mae)} mm/u, p95 nat ${formatted(stats.p95)} mm/u`, values: { flipPercent: 100 * flips / Math.max(1, total), wetPercent: 100 * wetShare, ...stats } })
  }
  scalar('feels_like_c', 'gevoel', '°C')
  scalar('temp_c', 'temperatuur', '°C')
  const u = cubes.get('wind_u_ms')
  const v = cubes.get('wind_v_ms')
  if (u && v) {
    const uPairs = pairs(u, regions, variant)
    const vPairs = pairs(v, regions, variant)
    const differences: number[] = []
    let differentClass = 0
    uPairs.forEach((pair, placeIndex) => {
      pair.own.forEach((ownU, index) => {
        const own = summarizeWind(ownU, vPairs[placeIndex]!.own[index]!, null, 'bft')
        const other = summarizeWind(pair.region[index]!, vPairs[placeIndex]!.region[index]!, null, 'bft')
        if (!own || !other) return
        differences.push(own.beaufort - other.beaufort)
        if (own.beaufort !== other.beaufort) differentClass += 1
      })
    })
    const stats = absoluteStats(differences)
    rows.push({ field: 'wind', label: 'wind', text: `MAE ${formatted(stats.mae)} Bft, andere Bft-klasse in ${formatted(100 * differentClass / Math.max(1, differences.length), 1)} %`, values: { ...stats, otherClassPercent: 100 * differentClass / Math.max(1, differences.length) } })
  }
  const gust = cubes.get('gust_ms')
  if (gust) {
    const differences = pairs(gust, regions, variant).flatMap((pair) => pair.own.flatMap((value, index) => {
      const own = summarizeWind(value, 0, null, 'bft')
      const other = summarizeWind(pair.region[index]!, 0, null, 'bft')
      return own && other ? [own.beaufort - other.beaufort] : []
    }))
    const stats = absoluteStats(differences)
    rows.push({ field: 'gust_ms', label: 'windstoten', text: `MAE ${formatted(stats.mae)} Bft`, values: stats })
  }
  const radiation = cubes.get('radiation')
  if (radiation) {
    const direct = cubes.get('radiation_direct')
    const radiationPairs = pairs(radiation, regions, variant)
    const directPairs = direct ? new Map(pairs(direct, regions, variant).map((pair) => [pair.place.slug, pair])) : undefined
    const timeline = radiation.frames.map((frame) => ({ epoch: frame.epoch, run: frame.run }))
    const directTimeline = direct?.frames.map((frame) => ({ epoch: frame.epoch, run: frame.run })) ?? []
    const differences: number[] = []
    for (const pair of radiationPairs) {
      const sinElevation = (epoch: number) => solarElevationSin(epoch, pair.place.lng, pair.place.lat)
      const directPair = directPairs?.get(pair.place.slug)
      const minutes = (global: number[], directValues: number[] | undefined) => sunshineInputs(
        { timeline, values: global.map((value) => Number.isFinite(value) ? value : null) },
        directValues && { timeline: directTimeline, values: directValues.map((value) => Number.isFinite(value) ? value : null) },
        sinElevation,
      )
      const own = minutes(pair.own, directPair?.own)
      const other = minutes(pair.region, directPair?.region)
      for (const { epoch } of timeline) {
        const ownMinutes = sunshineMinutes(epoch, own)
        const otherMinutes = sunshineMinutes(epoch, other)
        if (ownMinutes === null || otherMinutes === null || (ownMinutes === 0 && otherMinutes === 0 && sinElevation(epoch) <= 0)) continue
        differences.push(ownMinutes - otherMinutes)
      }
    }
    const stats = absoluteStats(differences)
    rows.push({ field: 'sun', label: 'zon', text: `MAE ${formatted(stats.mae, 1)} min/u, p95 ${formatted(stats.p95, 1)} min/u (daguren)`, values: stats })
  }
  scalar('cloud_frac', 'bewolking', '%')
  scalar('uv', 'uv', 'UV-index')
  return rows
}

function percentile(sorted: number[], share: number): number {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))]! : 0
}

/**
 * Regiobestanden per groep, zoals de ingest ze zou schrijven: per veld de reeks in tijdvolgorde (u8, zoals in
 * mrf), alle velden achter elkaar, zstd 19. "Alle gridpunten": per veld per cel van de regio zijn tijdreeks.
 */
function fileSizes(cubes: Map<Field, Cube>, regions: Regions) {
  const placeRegions = [...new Set(places.map((place) => regions.of(place.x, place.y)))]
  return GROUPS.map((group) => {
    const parts = [...cubes.values()].flatMap((cube) => {
      const frames = cube.frames.filter((frame) => group.includes(cube.field, frame.source))
      return frames.length ? [{ cube, frames }] : []
    })
    const encode = (variant: 'centre' | 'all') => {
      const sizes: number[] = []
      const started = performance.now()
      for (const region of placeRegions) {
        const pieces: Uint8Array[] = []
        // Zelfbeschrijvende kop: per veld bron, run, de cellen (eerste kolom/rij en afmeting in het veldraster) en
        // de tijden als begin + stap + aantal. Kwantisatietabellen staan per generatie in een vast bestand.
        const fields: unknown[] = []
        for (const { cube, frames } of parts) {
          const cells = variant === 'centre' ? centreCell(cube, regions, region) : regionCells(cube, regions, region)
          const columns = cells.map((cell) => cell % cube.width)
          const rows = cells.map((cell) => Math.floor(cell / cube.width))
          fields.push({ field: cube.field, source: frames[0]!.source, run: frames[0]!.run, column: Math.min(...columns), row: Math.min(...rows), width: Math.max(...columns) - Math.min(...columns) + 1, height: Math.max(...rows) - Math.min(...rows) + 1, start: frames[0]!.epoch / 60_000, step: frames.length > 1 ? (frames[1]!.epoch - frames[0]!.epoch) / 60_000 : 0, count: frames.length })
          for (const cell of cells) pieces.push(Uint8Array.from(frames, (frame) => frame.cells[cell]!))
        }
        const header = Buffer.from(JSON.stringify(fields))
        const length = Buffer.alloc(4)
        length.writeUInt32LE(header.length)
        const raw = Buffer.concat([length, header, ...pieces])
        sizes.push(raw.length ? zstdCompressSync(raw, { params: { [constants.ZSTD_c_compressionLevel]: 19, [constants.ZSTD_c_contentSizeFlag]: 1 } }).length : 0)
      }
      const sorted = [...sizes].sort((left, right) => left - right)
      return {
        meanBytes: Math.round(sizes.reduce((sum, size) => sum + size, 0) / Math.max(1, sizes.length)),
        p95Bytes: percentile(sorted, 0.95),
        totalBytes: sizes.reduce((sum, size) => sum + size, 0),
        encodeMs: Math.round(performance.now() - started),
      }
    }
    return { group: group.name, label: group.label, fields: parts.map((part) => `${part.cube.field}×${part.frames.length}`), files: placeRegions.length, centre: encode('centre'), all: encode('all') }
  })
}

function centreCell(cube: Cube, regions: Regions, region: number): number[] {
  const centre = regions.centre(region)
  const index = cellIndex(cube, centre.x, centre.y)
  return index === null ? [] : [index]
}

const cellsByRegionCache = new WeakMap<Regions, Map<Cube, number[][]>>()

function regionCells(cube: Cube, regions: Regions, region: number): number[] {
  let byCube = cellsByRegionCache.get(regions)
  if (!byCube) { byCube = new Map(); cellsByRegionCache.set(regions, byCube) }
  let byRegion = byCube.get(cube)
  if (!byRegion) {
    byRegion = Array.from({ length: regions.count }, () => [] as number[])
    for (let row = 0; row < cube.height; row++) {
      for (let column = 0; column < cube.width; column++) byRegion[regions.of(cube.x0 + (column + 0.5) * cube.dx, cube.y0 + (row + 0.5) * cube.dy)]!.push(row * cube.width + column)
    }
    byCube.set(cube, byRegion)
  }
  return byRegion[region]!
}

// Onderaan, zodat alle constanten hierboven al bestaan.
main()

function main(): void {
  const results: unknown[] = []
  for (const snapshot of snapshots) {
    const manifest = JSON.parse(readFileSync(join(snapshot, 'manifest.json'), 'utf8')) as Manifest
    const cubes = new Map<Field, Cube>()
    for (const field of FIELDS) {
      const cube = loadCube(snapshot, manifest, field)
      if (cube) cubes.set(field, cube)
    }
    console.log(`\n## ${snapshot} (nu ${manifest.now}), ${places.length} plaatsen in het kader`)
    console.log(`velden: ${[...cubes.values()].map((cube) => `${cube.field} ${cube.width}×${cube.height}×${cube.frames.length}`).join(', ')}`)
    for (const regionCount of sizes) {
      const regions = regionGrid(regionCount)
      const errors = { centre: fieldErrors(cubes, regions, 'centre'), mean: fieldErrors(cubes, regions, 'mean') }
      const files = fileSizes(cubes, regions)
      results.push({ snapshot, now: manifest.now, regionCount, regions: regions.count, sideKm: regions.sideKm, errors, files })
      console.log(`\n### ${regions.count} regio's (${regions.columns}×${regions.rows}, zijde ${regions.sideKm.toFixed(1)} km), ${regions.withPlaces} met een plaats`)
      for (const [variant, rows] of Object.entries(errors)) console.log(`fout (${variant === 'centre' ? 'reeks van het regiomidden' : 'regiogemiddelde'}): ${rows.map((row) => `${row.label} ${row.text}`).join('; ')}`)
      for (const row of files) console.log(`bestand ${row.group}: midden ${row.centre.meanBytes} B (p95 ${row.centre.p95Bytes} B), alle gridpunten ${row.all.meanBytes} B (p95 ${row.all.p95Bytes} B); per run ${row.files} bestanden, ${row.centre.totalBytes} / ${row.all.totalBytes} B, zstd-19 ${row.centre.encodeMs} / ${row.all.encodeMs} ms`)
    }
  }
  if (jsonOutput) writeFileSync(jsonOutput, `${JSON.stringify(results, null, 2)}\n`)
}
