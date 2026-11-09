import { chunkField, type Grid, type Manifest, type ManifestChunk, type MrfHeader, type TimelineFrame } from './contract'
import { feelsLikeC, feelsLikeSunC, FEELS_VARIANTS, sunQAt, type FeelsVariant } from './feels-sun'
import type { FrameTransform, MrfClient } from './mrf'
import { solarPosition } from './solar'
import { buildTimeline } from './time-model'

const HOUR = 3_600_000
const EARTH_RADIUS_M = 6_378_137
const INPUT_FIELDS = ['temp_c', 'rel_humidity', 'wind_u_ms', 'wind_v_ms', 'radiation'] as const
type InputField = typeof INPUT_FIELDS[number]

/** `?dev&gevoel=zon` kiest een variant (U105, vervalt 2026-11-23); zonder `?dev` of onbekend: `nu`. */
export function linkedFeelsVariant(search: string): FeelsVariant {
  const params = new URLSearchParams(search)
  if (!params.has('dev')) return 'nu'
  return FEELS_VARIANTS.find((variant) => variant === params.get('gevoel')) ?? 'nu'
}

interface Decoded {
  header: MrfHeader
  frame: Uint8Array
}

/**
 * Vervangt de HARMONIE-gevoelsframes door ingestwaarde + zonterm: het verschil tussen MIP-41 en MIP-10 op dezelfde
 * cel, uit temperatuur, vochtigheid, wind en globale straling van dezelfde tijd. Zo blijft de ingestwaarde de basis
 * en toont de kaart alleen het effect van de zon.
 */
export function feelsVariantTransform(client: MrfClient, manifest: () => Manifest | undefined, qFactor: number): FrameTransform {
  let timelinesFor: Manifest | undefined
  let timelines = new Map<InputField, Map<number, TimelineFrame>>()
  const indexMaps = new Map<string, Int32Array>()

  const inputs = (current: Manifest) => {
    if (timelinesFor !== current) {
      timelinesFor = current
      timelines = new Map(INPUT_FIELDS.map((field) => [field, new Map(buildTimeline(current, field).map((frame) => [frame.epoch, frame]))]))
    }
    return timelines
  }

  const read = async (frame: TimelineFrame | undefined): Promise<Decoded | undefined> => {
    if (!frame) return undefined
    const [header, [decoded]] = await Promise.all([client.getHeader(frame.chunk), client.getFrames(frame.chunk, [frame.frameIndex], 'high')])
    return { header, frame: decoded! }
  }

  return {
    applies: (chunk: ManifestChunk) => chunkField(chunk) === 'feels_like_c' && chunk.source === 'harmonie',
    async apply(chunk, header, frameIndex, frame) {
      const current = manifest()
      const epoch = Date.parse(chunk.times[frameIndex]!)
      if (!current || !Number.isFinite(epoch)) return frame
      const series = inputs(current)
      const [temperature, humidity, windU, windV, radiationAt, radiationAfter] = await Promise.all([
        read(series.get('temp_c')!.get(epoch)),
        read(series.get('rel_humidity')!.get(epoch)),
        read(series.get('wind_u_ms')!.get(epoch)),
        read(series.get('wind_v_ms')!.get(epoch)),
        read(series.get('radiation')!.get(epoch)),
        read(series.get('radiation')!.get(epoch + HOUR)),
      ])
      if (!temperature || !humidity || !windU || !windV || (!radiationAt && !radiationAfter)) return frame
      const indexes = (source: Decoded | undefined) => source && cachedIndexMap(indexMaps, header.grid, source.header.grid)
      const sample = (source: Decoded | undefined, cell: number, map: Int32Array | undefined) => {
        if (!source || !map) return undefined
        const at = map[cell]!
        return at < 0 ? undefined : source.header.quant[source.frame[at]!] ?? undefined
      }
      const maps = [temperature, humidity, windU, windV, radiationAt, radiationAfter].map(indexes)
      const suns = solarCache()
      const out = new Uint8Array(frame)
      const { width, height } = header.grid
      for (let row = 0; row < height; row++) {
        const latitude = cellLatitude(header.grid, row)
        const sinLatitude = Math.sin(latitude), cosLatitude = Math.cos(latitude)
        for (let column = 0; column < width; column++) {
          const cell = row * width + column
          const base = header.quant[frame[cell]!]
          if (base == null) continue
          const temperatureC = sample(temperature, cell, maps[0])
          const humidityPercent = sample(humidity, cell, maps[1])
          const u = sample(windU, cell, maps[2]), v = sample(windV, cell, maps[3])
          if (temperatureC === undefined || humidityPercent === undefined || u === undefined || v === undefined || temperatureC <= 10) continue
          const longitude = cellLongitude(header.grid, column)
          const sinElevation = (at: number) => {
            const sun = suns(at)
            return sinLatitude * sun.sinDeclination + cosLatitude * sun.cosDeclination * Math.cos(longitude - sun.subsolarLongitude)
          }
          const q = qFactor * sunQAt(epoch, sample(radiationAt, cell, maps[4]), sample(radiationAfter, cell, maps[5]), sinElevation)
          const relativeHumidity = humidityPercent / 100
          const windMs = Math.hypot(u, v)
          const delta = feelsLikeSunC(temperatureC, relativeHumidity, windMs, q) - feelsLikeC(temperatureC, relativeHumidity, windMs)
          out[cell] = quantizeLinear(header.quant, base + delta)
        }
      }
      return out
    },
  }
}

function solarCache() {
  const positions = new Map<number, { sinDeclination: number; cosDeclination: number; subsolarLongitude: number }>()
  return (epoch: number) => {
    let position = positions.get(epoch)
    if (!position) {
      const { declination, subsolarLongitude } = solarPosition(epoch)
      position = { sinDeclination: Math.sin(declination), cosDeclination: Math.cos(declination), subsolarLongitude }
      positions.set(epoch, position)
    }
    return position
  }
}

function cellLongitude(grid: Grid, column: number): number {
  return (grid.x0 + (column + 0.5) * grid.dx) / EARTH_RADIUS_M
}

function cellLatitude(grid: Grid, row: number): number {
  return 2 * Math.atan(Math.exp((grid.y0 + (row + 0.5) * grid.dy) / EARTH_RADIUS_M)) - Math.PI / 2
}

/** Per doelcel de cel van het bronrooster waarin zijn midden valt (beide EPSG:3857), of −1. */
function cachedIndexMap(cache: Map<string, Int32Array>, target: Grid, source: Grid): Int32Array {
  const key = [target.x0, target.y0, target.dx, target.dy, target.width, target.height, source.x0, source.y0, source.dx, source.dy, source.width, source.height].join(',')
  let map = cache.get(key)
  if (map) return map
  map = new Int32Array(target.width * target.height)
  for (let row = 0; row < target.height; row++) {
    const sourceRow = Math.floor((target.y0 + (row + 0.5) * target.dy - source.y0) / source.dy)
    for (let column = 0; column < target.width; column++) {
      const sourceColumn = Math.floor((target.x0 + (column + 0.5) * target.dx - source.x0) / source.dx)
      const inside = sourceRow >= 0 && sourceColumn >= 0 && sourceRow < source.height && sourceColumn < source.width
      map[row * target.width + column] = inside ? sourceRow * source.width + sourceColumn : -1
    }
  }
  cache.set(key, map)
  return map
}

/** Index in een lineaire kwantisatietabel (laatste plek = no-data). */
export function quantizeLinear(quant: ReadonlyArray<number | null>, value: number): number {
  const start = quant[0]!, step = quant[1]! - start
  return Math.min(quant.length - 2, Math.max(0, Math.round((value - start) / step)))
}
