// U108: stelt een archief samen uit het huidige archief (manifest.json) plus extra tegellagen uit MBTiles (GDAL-MVT).
// `--replace laag:van-tot` haalt een bestaande laag in dat zoombereik weg (de extra lagen vervangen hem). Een MVT is een
// protobufbericht met herhaalde `layers`, dus lagen gaan er als ruwe bytes uit en in; ongewijzigde tegels blijven
// bytegelijk. Schrijft tools/basemap/tiles/nl-<hash>.pmtiles en manifest-<naam>.json.
// Gebruik (vanuit web/): node --import tsx ../tools/basemap/compose.mts NAAM SCRATCHDIR [--replace laag:5-9 …] EXTRA.mbtiles…
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(resolve(root, 'web/package.json'))
const { PMTiles, FileSource, tileIdToZxy } = require('pmtiles')
const Pbf = require('pbf').default

const args = process.argv.slice(2)
const [name, scratchArgument] = args
if (!name || !scratchArgument) throw new Error('Gebruik: compose.mts NAAM SCRATCHDIR [--replace laag:van-tot …] EXTRA.mbtiles…')
const scratch = resolve(scratchArgument)
const replacements: Array<{ layer: string; from: number; to: number }> = []
const extras: string[] = []
for (let index = 2; index < args.length; index++) {
  if (args[index] === '--replace') {
    const [layer, range] = args[++index]!.split(':')
    const [from, to] = range!.split('-').map(Number)
    replacements.push({ layer: layer!, from: from!, to: to! })
  } else extras.push(resolve(args[index]!))
}
const replaced = (layer: string, zoom: number) => replacements.some((rule) => rule.layer === layer && zoom >= rule.from && zoom <= rule.to)

/** De ruwe `layers`-velden (tag 3) van een gedecomprimeerde tegel, met hun naam. */
function layerSlices(data: Uint8Array): Array<{ name: string; bytes: Uint8Array }> {
  const pbf = new Pbf(data)
  const slices: Array<{ name: string; bytes: Uint8Array }> = []
  while (pbf.pos < pbf.length) {
    const start = pbf.pos
    const tag = pbf.readVarint() >> 3
    const length = pbf.readVarint()
    const end = pbf.pos + length
    if (tag !== 3) throw new Error(`Onverwacht tegelveld ${tag}`)
    const layer = new Pbf(data.subarray(pbf.pos, end))
    let layerName = ''
    while (layer.pos < layer.length) {
      const field = layer.readVarint()
      if (field >> 3 === 1) { layerName = layer.readString(); break }
      layer.skip(field)
    }
    slices.push({ name: layerName, bytes: data.subarray(start, end) })
    pbf.pos = end
  }
  return slices
}

const tilesDirectory = resolve(root, 'tools/basemap/tiles')
const base = JSON.parse(readFileSync(resolve(tilesDirectory, 'manifest.json'), 'utf8'))
const archive = new PMTiles(new FileSource(new File([readFileSync(resolve(tilesDirectory, base.filename))], base.filename)))
const header = await archive.getHeader()
const metadata = await archive.getMetadata()

const extraTiles = new Map<string, Buffer[]>()
const extraLayers: Array<{ id: string }> = []
for (const path of extras) {
  const database = new DatabaseSync(path, { readOnly: true })
  for (const row of database.prepare('SELECT zoom_level, tile_column, tile_row, tile_data FROM tiles').all() as Array<{ zoom_level: number; tile_column: number; tile_row: number; tile_data: Uint8Array }>) {
    const key = `${row.zoom_level}/${row.tile_column}/${2 ** row.zoom_level - 1 - row.tile_row}`
    const data = Buffer.from(row.tile_data)
    extraTiles.set(key, [...extraTiles.get(key) ?? [], data[0] === 0x1f ? gunzipSync(data) : data])
  }
  const json = JSON.parse((database.prepare("SELECT value FROM metadata WHERE name = 'json'").get() as { value: string }).value)
  for (const layer of json.vector_layers) if (!extraLayers.some((known) => known.id === layer.id)) extraLayers.push(layer)
  database.close()
}

const mbtilesPath = resolve(scratch, `${name}.mbtiles`)
rmSync(mbtilesPath, { force: true })
const output = new DatabaseSync(mbtilesPath)
output.exec('CREATE TABLE metadata (name TEXT, value TEXT); CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB); CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row)')
const insert = output.prepare('INSERT INTO tiles VALUES (?, ?, ?, ?)')
const written = new Set<string>()
let changed = 0
output.exec('BEGIN')
const entries: Array<{ tileId: number; offset: number; length: number }> = []
const collect = async (offset: number, length: number) => {
  for (const entry of await archive.cache.getDirectory(archive.source, offset, length, header)) {
    if (entry.runLength === 0) await collect(header.leafDirectoryOffset + entry.offset, entry.length)
    else for (let run = 0; run < entry.runLength; run++) entries.push({ tileId: entry.tileId + run, offset: entry.offset, length: entry.length })
  }
}
await collect(header.rootDirectoryOffset, header.rootDirectoryLength)
for (const { tileId, offset, length } of entries) {
  const [z, x, y] = tileIdToZxy(tileId)
  const key = `${z}/${x}/${y}`
  const raw = Buffer.from((await archive.source.getBytes(header.tileDataOffset + offset, length)).data)
  const extra = extraTiles.get(key) ?? []
  const touched = extra.length > 0 || replacements.some((rule) => z >= rule.from && z <= rule.to)
  written.add(key)
  if (!touched) { insert.run(z, x, 2 ** z - 1 - y, raw); continue }
  const kept = layerSlices(gunzipSync(raw)).filter((slice) => !replaced(slice.name, z)).map((slice) => slice.bytes)
  const data = Buffer.concat([...kept, ...extra])
  changed++
  if (data.length) insert.run(z, x, 2 ** z - 1 - y, gzipSync(data, { level: 9 }))
}
for (const [key, extra] of extraTiles) {
  if (written.has(key)) continue
  const [z, x, y] = key.split('/').map(Number) as [number, number, number]
  insert.run(z, x, 2 ** z - 1 - y, gzipSync(Buffer.concat(extra), { level: 9 }))
  changed++
}
const vectorLayers = [...(metadata.vector_layers ?? []), ...extraLayers.filter((layer) => !(metadata.vector_layers ?? []).some((known: { id: string }) => known.id === layer.id))]
const fields: Record<string, string> = {
  name: metadata.name ?? 'motregen', format: 'pbf', type: 'baselayer', minzoom: String(header.minZoom), maxzoom: String(header.maxZoom),
  bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat].join(','), center: [header.centerLon, header.centerLat, header.centerZoom].join(','),
  description: `${metadata.description ?? ''}; U108 ${name}`, attribution: metadata.attribution ?? '© OpenStreetMap contributors',
  json: JSON.stringify({ vector_layers: vectorLayers }),
}
const insertMetadata = output.prepare('INSERT INTO metadata VALUES (?, ?)')
for (const [field, value] of Object.entries(fields)) insertMetadata.run(field, value)
output.exec('COMMIT')
output.close()

const pmtilesPath = resolve(scratch, `${name}.pmtiles`)
rmSync(pmtilesPath, { force: true })
execFileSync('pmtiles', ['convert', mbtilesPath, pmtilesPath], { stdio: ['ignore', 'ignore', 'inherit'] })
execFileSync('pmtiles', ['verify', pmtilesPath], { stdio: ['ignore', 'ignore', 'inherit'] })
const bytes = readFileSync(pmtilesPath)
const sha256 = createHash('sha256').update(bytes).digest('hex')
const filename = `nl-${sha256.slice(0, 16)}.pmtiles`
copyFileSync(pmtilesPath, resolve(tilesDirectory, filename))
writeFileSync(resolve(tilesDirectory, `manifest-${name}.json`), `${JSON.stringify({ filename, sha256, bytes: bytes.length, base: base.filename, replaced: replacements, changedTiles: changed }, null, 2)}\n`)
console.log(`${filename}: ${bytes.length} B (basis ${base.bytes} B), ${changed} tegels gewijzigd`)
