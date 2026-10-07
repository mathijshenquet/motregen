import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareBasemapStyle } from './liberty'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../tmp/basemap/openfreemap')
const origin = 'https://tiles.openfreemap.org'
async function download(url: string, path: string) {
  if (existsSync(path)) return
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status}: ${url}`)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, Buffer.from(await response.arrayBuffer()))
}
const style = existsSync(resolve(root, 'liberty.json')) ? JSON.parse(readFileSync(resolve(root, 'liberty.json'), 'utf8')) : await (await fetch(`${origin}/styles/liberty`)).json()
const tilejson = existsSync(resolve(root, 'tilejson.json')) ? JSON.parse(readFileSync(resolve(root, 'tilejson.json'), 'utf8')) : await (await fetch(`${origin}/planet`)).json()
mkdirSync(root, { recursive: true })
writeFileSync(resolve(root, 'liberty.json'), JSON.stringify(style, null, 2))
writeFileSync(resolve(root, 'tilejson.json'), JSON.stringify(tilejson, null, 2))
for (const theme of ['light', 'dark'] as const) writeFileSync(resolve(root, `${theme}.json`), JSON.stringify(prepareBasemapStyle(style, theme)))
const downloads: Array<[string, string]> = []
for (const font of ['Noto Sans Regular', 'Noto Sans Italic', 'Noto Sans Bold']) {
  for (const range of ['0-255', '256-511']) downloads.push([`${origin}/fonts/${font}/${range}.pbf`, `fonts/${font}/${range}.pbf`])
}
for (const suffix of ['.json', '.png', '@2x.json', '@2x.png']) downloads.push([`${style.sprite}${suffix}`, `sprite${suffix}`])
const mercatorY = (latitude: number) => (1 - Math.asinh(Math.tan(latitude * Math.PI / 180)) / Math.PI) / 2
for (let zoom = 4; zoom <= 7; zoom++) {
  const count = 2 ** zoom
  for (let tileX = Math.floor(180 / 360 * count); tileX <= Math.floor(190 / 360 * count); tileX++) {
    for (let tileY = Math.floor(mercatorY(56) * count); tileY <= Math.floor(mercatorY(49) * count); tileY++) {
      const path = `${zoom}/${tileX}/${tileY}`
      downloads.push([tilejson.tiles[0].replace('{z}', String(zoom)).replace('{x}', String(tileX)).replace('{y}', String(tileY)), `tiles/${path}.pbf`])
      if (zoom <= 6) downloads.push([`${origin}/natural_earth/ne2sr/${path}.png`, `raster/${path}.png`])
    }
  }
}
if (process.argv.includes('--detail')) {
  for (const zoom of [7, 9, 10, 12]) {
    const count = 2 ** zoom
    for (const [longitude, latitude] of [[5.1214, 52.0907], [4.05, 52.14], [5.4, 52.75]]) {
      const centerX = (longitude! + 180) / 360 * count
      const centerY = mercatorY(latitude!) * count
      for (let tileX = Math.floor(centerX - 1280 / 1024); tileX <= Math.floor(centerX + 1280 / 1024); tileX++) {
        for (let tileY = Math.floor(centerY - 900 / 1024); tileY <= Math.floor(centerY + 900 / 1024); tileY++) {
          const path = `${zoom}/${tileX}/${tileY}`
          const url = tilejson.tiles[0].replace('{z}', String(zoom)).replace('{x}', String(tileX)).replace('{y}', String(tileY))
          if (!downloads.some(([, file]) => file === `tiles/${path}.pbf`)) downloads.push([url, `tiles/${path}.pbf`])
        }
      }
    }
  }
}
for (let index = 0; index < downloads.length; index += 6) {
  await Promise.all(downloads.slice(index, index + 6).map(([url, path]) => download(url, resolve(root, path))))
}
console.log(`${downloads.length} OpenFreeMap-bestanden lokaal vastgelegd; tileset ${tilejson.tiles[0]}`)
