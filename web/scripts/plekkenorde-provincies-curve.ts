// Provincietrede (U114): aantal plekken per scherm tegen de zoom (stappen van 0,1 boven het overzicht), telefoon en
// desktop, per voetafdruk en dichtheid, naast de gewone orde. Schrijft een tabel naar OUT (markdown).
//   pnpm exec tsx scripts/plekkenorde-provincies-curve.ts ../.dev/tracks/u114-plekkenorde/provincies/dichtheid.md
import { readFileSync, writeFileSync } from 'node:fs'
import { containView, MAP_CONTAIN_BOUNDS } from '../src/core/map-constraint.js'
import { decodePlaceOrder, orderedPlaces, PLACE_DENSITIES, placesInView, PROVINCE_STEPS, provinceTier, type CompactPlaceOrder, type PlaceOrderScreen } from '../src/core/map-places.js'
import { FOOTPRINT_KINDS } from '../src/core/place-footprint.js'

const [out] = process.argv.slice(2)
if (!out) throw new Error('usage: pnpm exec tsx scripts/plekkenorde-provincies-curve.ts OUT.md')
const table = decodePlaceOrder(JSON.parse(readFileSync(new URL('../src/core/place-order-zooms.json', import.meta.url), 'utf8')) as CompactPlaceOrder)
const MAPS: Record<PlaceOrderScreen, { width: number; height: number }> = { phone: { width: 402, height: 462 }, desktop: { width: 970, height: 900 } }
// Middelpunt Utrecht–Veluwe, zoals de clips.
const CENTRE = [5.3, 52.2] as const
const steps = Array.from({ length: Math.round((PROVINCE_STEPS.cities + 1.5) / 0.1) + 1 }, (_, index) => Math.round(index) / 10)
const lines = [
  '# Provincietrede: plekken per scherm tegen de zoom',
  '',
  `Middelpunt ${CENTRE.join(', ')}; kaart telefoon 402 × 462 (onder het paneel), desktop 970 × 900 css-px. Kolom = zoomstappen boven het overzicht;`,
  `provincies tot +${PROVINCE_STEPS.provinces}, tween tot +${PROVINCE_STEPS.cities}, daarna de stedentrede. "orde" = de stedentrede vanaf het overzicht (zonder provincietrede, zoals Wind met windtrede=steden). De zak-regels met trede gelden voor windtrede=provincies.`,
  '',
  `| voetafdruk | scherm | dichtheid | trede | ${steps.map((step) => `+${step.toFixed(1)}`).join(' | ')} |`,
  `| --- | --- | --- | --- | ${steps.map(() => '---').join(' | ')} |`,
]
for (const kind of FOOTPRINT_KINDS) for (const screen of Object.keys(MAPS) as PlaceOrderScreen[]) for (const density of PLACE_DENSITIES) {
  const home = containView(MAP_CONTAIN_BOUNDS, MAPS[screen])
  const count = (step: number, tiered: boolean) => {
    const view = { kind, zoom: home.zoom + step, overviewZoom: home.zoom, screen, density, neighbours: 'later' as const }
    return placesInView(tiered ? provinceTier(view, table) : orderedPlaces({ ...view, citiesFrom: home.zoom }, table), CENTRE, view.zoom, MAPS[screen]).length
  }
  lines.push(`| ${kind} | ${screen} | ${density} | provincies | ${steps.map((step) => count(step, true)).join(' | ')} |`)
  lines.push(`| ${kind} | ${screen} | ${density} | orde | ${steps.map((step) => count(step, false)).join(' | ')} |`)
}
writeFileSync(out, `${lines.join('\n')}\n`)
console.log('geschreven', out)
