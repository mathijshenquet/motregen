import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { PMTiles } from 'pmtiles'

process.chdir(fileURLToPath(new URL('../..', import.meta.url)))
const { filename } = JSON.parse(readFileSync('tools/basemap/tiles/manifest.json', 'utf8')) as { filename: string }
const file = readFileSync(`tools/basemap/tiles/${filename}`)
const archive = new PMTiles({
  getKey: () => filename,
  getBytes: async (offset, length) => ({ data: file.buffer.slice(file.byteOffset + offset, file.byteOffset + offset + length) }),
})
const inline: Record<string, string> = {}
for (const tileX of [7, 8]) {
  const result = await archive.getZxy(4, tileX, 5)
  if (!result) throw new Error('z4-tegel ontbreekt')
  inline[`4/${tileX}/5`] = gzipSync(new Uint8Array(result.data)).toString('base64')
}
const tiles = JSON.stringify({ archive: filename, tiles: inline })
writeFileSync('web/src/assets/map-start/tiles.json', tiles)
console.log(`Inline tegels ${tiles.length} B / gzip ${gzipSync(tiles).length} B`)
