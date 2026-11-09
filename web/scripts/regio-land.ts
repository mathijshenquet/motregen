// MIP-40: welke regio's van het regioraster een plaats uit de plaatsenlijst bevatten. Alleen die krijgen een
// regiobestand; zee en buitenland vallen terug op het huidige pad (A3). De ingest leest de uitvoer
// (crates/ingest/src/regions/land.json). Opnieuw maken: pnpm exec tsx scripts/regio-land.ts
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { decodePlaces, type CompactPlaces } from '../src/core/place-data.js'

// Het NL+VL-kader van het 6 km-detailgrid (EPSG:3857), in 14 × 15 regio's van ≈ 25 km (MIP-40, A1).
const FRAME = { west: 258_000, east: 834_000, north: 7_132_000, south: 6_502_000 }
const COLUMNS = 14
const ROWS = 15
const EARTH_RADIUS = 6_378_137

const catalogue = readdirSync(new URL('../public/', import.meta.url)).find((name) => /^plaatsen-[0-9a-f]+\.json$/.test(name))
if (!catalogue) throw new Error('plaatsenlijst niet gevonden in web/public')
const places = decodePlaces(JSON.parse(readFileSync(new URL(`../public/${catalogue}`, import.meta.url), 'utf8')) as CompactPlaces)

const regionWidth = (FRAME.east - FRAME.west) / COLUMNS
const regionHeight = (FRAME.north - FRAME.south) / ROWS
const present = new Set<number>()
for (const place of places) {
  const x = EARTH_RADIUS * place.lng * Math.PI / 180
  const y = EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + place.lat * Math.PI / 360))
  if (x < FRAME.west || x >= FRAME.east || y > FRAME.north || y <= FRAME.south) continue
  const column = Math.min(COLUMNS - 1, Math.floor((x - FRAME.west) / regionWidth))
  const row = Math.min(ROWS - 1, Math.floor((FRAME.north - y) / regionHeight))
  present.add(row * COLUMNS + column)
}
const output = { ...FRAME, columns: COLUMNS, rows: ROWS, catalogue, present: [...present].sort((left, right) => left - right) }
writeFileSync(new URL('../../crates/ingest/src/regions/land.json', import.meta.url), `${JSON.stringify(output)}\n`)
console.log(`${present.size} van ${COLUMNS * ROWS} regio's met een plaats (${catalogue})`)
