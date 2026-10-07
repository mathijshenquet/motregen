import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../tmp/basemap/openfreemap')
const origin = 'https://tiles.openfreemap.org'
async function download(url: string, path: string) {
  if (existsSync(path)) return
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status}: ${url}`)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, Buffer.from(await response.arrayBuffer()))
}
const style = await (await fetch(`${origin}/styles/liberty`)).json()
const tilejson = await (await fetch(`${origin}/planet`)).json()
mkdirSync(root, { recursive: true })
writeFileSync(resolve(root, 'liberty.json'), JSON.stringify(style, null, 2))
writeFileSync(resolve(root, 'tilejson.json'), JSON.stringify(tilejson, null, 2))
const downloads: Array<[string, string]> = []
for (const font of ['Noto Sans Regular', 'Noto Sans Italic', 'Noto Sans Bold']) {
  for (const range of ['0-255', '256-511']) downloads.push([`${origin}/fonts/${font}/${range}.pbf`, `fonts/${font}/${range}.pbf`])
}
for (const suffix of ['.json', '.png', '@2x.json', '@2x.png']) downloads.push([`${style.sprite}${suffix}`, `sprite${suffix}`])
const mercatorY = (latitude: number) => (1 - Math.asinh(Math.tan(latitude * Math.PI / 180)) / Math.PI) / 2
for (let zoom = 4; zoom <= 7; zoom++) {
  const count = 2 ** zoom
  for (let x = Math.floor(180 / 360 * count); x <= Math.floor(190 / 360 * count); x++) {
    for (let y = Math.floor(mercatorY(56) * count); y <= Math.floor(mercatorY(49) * count); y++) {
      const path = `${zoom}/${x}/${y}`
      downloads.push([tilejson.tiles[0].replace('{z}', String(zoom)).replace('{x}', String(x)).replace('{y}', String(y)), `tiles/${path}.pbf`])
      if (zoom <= 6) downloads.push([`${origin}/natural_earth/ne2sr/${path}.png`, `raster/${path}.png`])
    }
  }
}
for (let index = 0; index < downloads.length; index += 6) {
  await Promise.all(downloads.slice(index, index + 6).map(([url, path]) => download(url, resolve(root, path))))
}
console.log(`${downloads.length} OpenFreeMap-bestanden lokaal vastgelegd; tileset ${tilejson.tiles[0]}`)
