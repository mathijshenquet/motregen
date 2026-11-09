// MIP-40 fase 2: leest de clientlezer (src/core/region-points.ts) dezelfde waarden uit de regiobestanden van de ingest
// als de bestaande puntlezers uit de rasters? Voor plaatsen uit de plaatsenlijst, elke chunk van elke groep en elk frame:
// pointValue, pointValueBilinear (ECMWF), rainPatch en motionAtPatch. Een `undefined` (niet in het bestand) telt als fout,
// behalve patch en beweging van een regenchunk zonder bewegingsdeel: die laat de hybride layout bewust weg (radar).
// pnpm exec tsx scripts/regio-check.ts <datamap van motregen-regions --out> [--places N]
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chunkField, type Manifest, type MotionField, type MrfHeader } from '../src/core/contract.js'
import { decodeFrame, parseMrfHeader } from '../src/core/mrf-codec.js'
import { decodePlaces, type CompactPlaces } from '../src/core/place-data.js'
import { pointValue, pointValueBilinear, projectPoint } from '../src/core/point-value.js'
import { motionAtPatch, rainPatch } from '../src/core/rain-point-detail.js'
import { RegionPoints, regionOf } from '../src/core/region-points.js'

const directory = process.argv[2]
if (!directory) throw new Error('gebruik: regio-check.ts <datamap> [--places N]')
const placeLimit = Number(process.argv[process.argv.indexOf('--places') + 1] ?? 0) || 300
const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8')) as Manifest
const section = manifest.regions
if (!section) throw new Error('manifest zonder sectie regions')

const catalogue = readdirSync(new URL('../public/', import.meta.url)).find((name) => /^plaatsen-[0-9a-f]+\.json$/.test(name))!
const allPlaces = decodePlaces(JSON.parse(readFileSync(new URL(`../public/${catalogue}`, import.meta.url), 'utf8')) as CompactPlaces)
  .map((place) => projectPoint(place.lng, place.lat))
  .filter(([x, y]) => regionOf(section, x, y) !== undefined)
const step = Math.max(1, Math.floor(allPlaces.length / placeLimit))
// Per regio achter elkaar, zodat de bestandscache van RegionPoints raakt.
const places = allPlaces.filter((_, index) => index % step === 0).sort((left, right) => regionOf(section, ...left)! - regionOf(section, ...right)!)

let fetched = 0
const reader = new RegionPoints('file:///data/manifest.json', async (url) => {
  fetched += 1
  try {
    return new Uint8Array(readFileSync(join(directory, new URL(url).pathname.replace(/^\/data\//, ''))))
  } catch {
    return undefined
  }
})

interface Raster { header: MrfHeader; frames: Uint8Array[]; motions: Array<MotionField | undefined> }
function decodeChunk(url: string, headerLength: number): Raster {
  const bytes = new Uint8Array(readFileSync(join(directory, url)))
  const header = parseMrfHeader(bytes.subarray(0, headerLength))
  const { width, height } = header.grid
  const member = (offset: number, length: number) => bytes.subarray(headerLength + offset, headerLength + offset + length)
  const frames = header.frames.map((frame) => decodeFrame(member(frame.offset, frame.len), width * height, header.pred ? { width, height } : undefined))
  const motions = header.frames.map((frame) => frame.motion && header.motion_grid
    ? { width: header.motion_grid.bw, height: header.motion_grid.bh, vectors: decodeFrame(member(frame.motion.offset, frame.motion.len), header.motion_grid.bw * header.motion_grid.bh * 2) }
    : undefined)
  return { header, frames, motions }
}

const counts = { values: 0, bilinear: 0, patches: 0, motions: 0, withoutPatch: 0, undefined: 0, different: 0 }
const failures: string[] = []
function check(same: boolean, what: string): void {
  if (same) return
  counts.different += 1
  if (failures.length < 10) failures.push(what)
}

const rasters = new Map(section.groups.flatMap((group) => group.chunks).map((url) => {
  const chunk = manifest.chunks.find((candidate) => candidate.url === url)
  if (!chunk) throw new Error(`${url} staat niet in het manifest`)
  return [url, decodeChunk(url, chunk.header_len)] as const
}))

for (const [x, y] of places) {
  for (const [url, raster] of rasters) {
    const rain = chunkField(raster.header) === 'rain_rate'
    {
      const region = await reader.chunk(manifest, url, x, y)
      if (!region) {
        counts.undefined += 1
        continue
      }
      raster.frames.forEach((decoded, frame) => {
        const value = region.value(frame, x, y)
        if (value === undefined) return void (counts.undefined += 1)
        check(value === pointValue(raster.header, decoded, x, y), `${url} #${frame} waarde op ${x},${y}`)
        counts.values += 1
        // Alleen de dagenlijst (ECMWF) leest bilineair.
        if (raster.header.source === 'ecmwf') {
          const bilinear = region.bilinear(frame, x, y)
          if (bilinear === undefined) return void (counts.undefined += 1)
          check(bilinear === pointValueBilinear(raster.header, decoded, x, y), `${url} #${frame} bilineair op ${x},${y}`)
          counts.bilinear += 1
        }
        if (!rain) return
        if (region.hasMotion(frame) === undefined) return void (counts.withoutPatch += 1)
        const patch = region.patch(frame, x, y)
        if (!patch) return void (counts.undefined += 1)
        const expected = rainPatch(raster.header, decoded, x, y)
        check(patch.bytes.every((byte, index) => byte === expected.bytes[index]) && patch.originColumn === expected.originColumn && patch.originRow === expected.originRow, `${url} #${frame} patch op ${x},${y}`)
        counts.patches += 1
        const motion = raster.motions[frame]
        if (region.hasMotion(frame) !== (motion !== undefined)) check(false, `${url} #${frame} bewegingsframe`)
        if (!motion) return
        const field = region.motion(frame, x, y)
        if (!field) return void (counts.undefined += 1)
        check(JSON.stringify(motionAtPatch(field, patch)) === JSON.stringify(motionAtPatch(motion, expected)), `${url} #${frame} beweging op ${x},${y}`)
        counts.motions += 1
      })
    }
  }
}

console.log(`${places.length} plaatsen, ${section.groups.length} groepen, ${fetched} bestanden gelezen`)
console.log(`gelijk: ${counts.values} waarden, ${counts.bilinear} bilineair, ${counts.patches} regenpatches, ${counts.motions} bewegingen`)
console.log(`regenframes zonder patch (layout): ${counts.withoutPatch}; niet in het bestand: ${counts.undefined}; verschillend: ${counts.different}`)
for (const failure of failures) console.log(`  ${failure}`)
process.exit(counts.undefined || counts.different ? 1 : 0)
