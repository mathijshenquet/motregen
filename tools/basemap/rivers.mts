// U108: rivier-middellijnen voor de basiskaart. Leest een Overpass-export van way[waterway=river] en schrijft
// GeoJSON-regels met naam en rang; rivers.sh voegt ze per naam samen en vereenvoudigt ze.
// Gebruik: node --import tsx tools/basemap/rivers.mts OVERPASS.json UIT.geojsonl
import { readFileSync, writeFileSync } from 'node:fs'

// Rang 1 is een cartografische keuze, geen meting: de rivieren die een lezer van een weerkaart van de Lage Landen
// verwacht te herkennen. Lengte alleen zou de Lippe of de Sieg boven de Waal zetten.
const MAIN_RIVERS = new Set([
  'Rhein', 'Boven-Rijn', 'Bijlandsch Kanaal', 'Pannerdensch Kanaal', 'Nederrijn', 'Lek', 'Waal',
  'Boven-Merwede', 'Beneden-Merwede', 'Noord', 'Nieuwe Maas', 'Oude Maas', 'Nieuwe Waterweg', 'Scheur',
  'IJssel', 'Maas', 'La Meuse', 'Bergsche Maas', 'Amer',
  'Schelde', 'Escaut', "L'Escaut", 'Bovenschelde', 'Bovenschelde / Escaut', 'Ems', 'Eems / Ems', 'Mosel',
])
const RANK_2_KM = 40
const RANK_3_KM = 10

interface OverpassWay { tags?: Record<string, string>; geometry?: Array<{ lat: number; lon: number }> }
const [input, output] = process.argv.slice(2)
if (!input || !output) throw new Error('Gebruik: rivers.mts OVERPASS.json UIT.geojsonl')
const ways = (JSON.parse(readFileSync(input, 'utf8')) as { elements: OverpassWay[] }).elements

const kilometres = (geometry: Array<{ lat: number; lon: number }>) => {
  let total = 0
  for (let index = 1; index < geometry.length; index++) {
    const [from, to] = [geometry[index - 1]!, geometry[index]!]
    const dx = (to.lon - from.lon) * 111.32 * Math.cos(from.lat * Math.PI / 180)
    const dy = (to.lat - from.lat) * 110.57
    total += Math.hypot(dx, dy)
  }
  return total
}
const lengthByName = new Map<string, number>()
for (const way of ways) {
  const name = way.tags?.name
  if (!name || !way.geometry || way.geometry.length < 2) continue
  lengthByName.set(name, (lengthByName.get(name) ?? 0) + kilometres(way.geometry))
}
const rank = (name: string) => {
  if (MAIN_RIVERS.has(name)) return 1
  const length = lengthByName.get(name) ?? 0
  return length >= RANK_2_KM ? 2 : length >= RANK_3_KM ? 3 : undefined
}
const lines: string[] = []
const counts = [0, 0, 0, 0]
for (const way of ways) {
  const name = way.tags?.name
  const level = name ? rank(name) : undefined
  if (!name || !level || !way.geometry || way.geometry.length < 2) continue
  counts[level]!++
  lines.push(JSON.stringify({ type: 'Feature', properties: { name, rank: level }, geometry: { type: 'LineString', coordinates: way.geometry.map(({ lon, lat }) => [lon, lat]) } }))
}
writeFileSync(output, `${lines.join('\n')}\n`)
console.log(`Rivierlijnen: rang 1 ${counts[1]}, rang 2 ${counts[2]}, rang 3 ${counts[3]} ways`)
