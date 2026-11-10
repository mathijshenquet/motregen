// Plekkenorde (U114, MIP-43): handorde (rang 1–4) plus de plaatsenlijst (rang 5 steden en grote dorpen, rang 6 de
// rest), met per plek, schermklasse en dichtheid de minimale zoom (src/core/place-thinning.ts). Opnieuw maken na een
// wijziging in de orde, de labelkanten, de voetafdruk of PLACE_ORDER_GAP_PX:
//   pnpm exec tsx scripts/plekkenorde-zooms.ts
// place-order.test.ts faalt als de tabel niet bij de bron past.
import { readFileSync, writeFileSync } from 'node:fs'
import { buildPlaceOrder } from '../src/core/place-order-build.js'
import { decodePlaces, type CompactPlaces } from '../src/core/place-data.js'
import { placesUrl } from '../src/core/places-asset.js'

const gazetteer = decodePlaces(JSON.parse(readFileSync(new URL(`../public${placesUrl}`, import.meta.url), 'utf8')) as CompactPlaces)
const started = performance.now()
const table = buildPlaceOrder(gazetteer)
writeFileSync(new URL('../src/core/place-order-zooms.json', import.meta.url), `${JSON.stringify(table)}\n`)
console.log(`${table.names.length} plekken (${placesUrl}, bron ${table.source}) in ${Math.round(performance.now() - started)} ms`)
