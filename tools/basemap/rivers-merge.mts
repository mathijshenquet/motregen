// U108: voegt de rivierlaag (`waterway`, uit rivers.sh) toe aan het huidige archief uit manifest.json en schrijft
// tools/basemap/tiles/nl-<hash>.pmtiles plus manifest-rivieren.json. Een MVT is een protobufbericht met herhaalde
// `layers`; twee gedecomprimeerde tegels achter elkaar plakken geeft één geldige tegel met beide lagen, zodat de
// bestaande lagen bytegelijk blijven.
// Gebruik (vanuit web/): node --import tsx ../tools/basemap/rivers-merge.mts RIVERS.mbtiles SCRATCHDIR
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
const [riversPath, scratch] = process.argv.slice(2).map((path) => resolve(path!))
if (!riversPath || !scratch) throw new Error('Gebruik: rivers-merge.mts RIVERS.mbtiles SCRATCHDIR')

const tilesDirectory = resolve(root, 'tools/basemap/tiles')
const base = JSON.parse(readFileSync(resolve(tilesDirectory, 'manifest.json'), 'utf8'))
const archive = new PMTiles(new FileSource(new File([readFileSync(resolve(tilesDirectory, base.filename))], base.filename)))
const header = await archive.getHeader()
const metadata = await archive.getMetadata()

const rivers = new DatabaseSync(riversPath, { readOnly: true })
const riverTiles = new Map<string, Buffer>()
for (const row of rivers.prepare('SELECT zoom_level, tile_column, tile_row, tile_data FROM tiles').all() as Array<{ zoom_level: number; tile_column: number; tile_row: number; tile_data: Uint8Array }>) {
  const y = 2 ** row.zoom_level - 1 - row.tile_row
  const data = Buffer.from(row.tile_data)
  riverTiles.set(`${row.zoom_level}/${row.tile_column}/${y}`, data[0] === 0x1f ? gunzipSync(data) : data)
}
const riverMetadata = JSON.parse((rivers.prepare("SELECT value FROM metadata WHERE name = 'json'").get() as { value: string }).value)
rivers.close()

const mbtilesPath = resolve(scratch, 'merged.mbtiles')
rmSync(mbtilesPath, { force: true })
const merged = new DatabaseSync(mbtilesPath)
merged.exec('CREATE TABLE metadata (name TEXT, value TEXT); CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB); CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row)')
const insert = merged.prepare('INSERT INTO tiles VALUES (?, ?, ?, ?)')
const written = new Set<string>()
let added = 0
merged.exec('BEGIN')
// Alle tegels van het bronarchief via de directory; tegels zonder rivier gaan als ruwe bytes mee (bytegelijk).
const entries: Array<{ tileId: number; offset: number; length: number }> = []
const collect = async (offset: number, length: number) => {
  const directory = await archive.cache.getDirectory(archive.source, offset, length, header)
  for (const entry of directory) {
    if (entry.runLength === 0) await collect(header.leafDirectoryOffset + entry.offset, entry.length)
    else for (let run = 0; run < entry.runLength; run++) entries.push({ tileId: entry.tileId + run, offset: entry.offset, length: entry.length })
  }
}
await collect(header.rootDirectoryOffset, header.rootDirectoryLength)
for (const { tileId, offset, length } of entries) {
  const [z, x, y] = tileIdToZxy(tileId)
  const raw = Buffer.from((await archive.source.getBytes(header.tileDataOffset + offset, length)).data)
  const key = `${z}/${x}/${y}`
  const river = riverTiles.get(key)
  if (river) added++
  insert.run(z, x, 2 ** z - 1 - y, river ? gzipSync(Buffer.concat([gunzipSync(raw), river]), { level: 9 }) : raw)
  written.add(key)
}
for (const [key, river] of riverTiles) {
  if (written.has(key)) continue
  const [z, x, y] = key.split('/').map(Number) as [number, number, number]
  insert.run(z, x, 2 ** z - 1 - y, gzipSync(river, { level: 9 }))
  added++
}
const vectorLayers = [...(metadata.vector_layers ?? []), ...riverMetadata.vector_layers.filter((layer: { id: string }) => layer.id === 'waterway')]
const fields: Record<string, string> = {
  name: metadata.name ?? 'motregen', format: 'pbf', type: 'baselayer', minzoom: String(header.minZoom), maxzoom: String(header.maxZoom),
  bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat].join(','), center: [header.centerLon, header.centerLat, header.centerZoom].join(','),
  description: `${metadata.description ?? ''}; rivier-middellijnen (U108)`, attribution: metadata.attribution ?? '© OpenStreetMap contributors',
  json: JSON.stringify({ vector_layers: vectorLayers }),
}
const insertMetadata = merged.prepare('INSERT INTO metadata VALUES (?, ?)')
for (const [name, value] of Object.entries(fields)) insertMetadata.run(name, value)
merged.exec('COMMIT')
merged.close()

const pmtilesPath = resolve(scratch, 'merged.pmtiles')
rmSync(pmtilesPath, { force: true })
execFileSync('pmtiles', ['convert', mbtilesPath, pmtilesPath], { stdio: 'inherit' })
execFileSync('pmtiles', ['verify', pmtilesPath], { stdio: 'inherit' })
const bytes = readFileSync(pmtilesPath)
const sha256 = createHash('sha256').update(bytes).digest('hex')
const filename = `nl-${sha256.slice(0, 16)}.pmtiles`
copyFileSync(pmtilesPath, resolve(tilesDirectory, filename))
writeFileSync(resolve(tilesDirectory, 'manifest-rivieren.json'), `${JSON.stringify({ filename, sha256, bytes: bytes.length, base: base.filename, riverTiles: added }, null, 2)}\n`)
console.log(`${filename}: ${bytes.length} B (basis ${base.bytes} B), ${added} tegels met rivieren`)
