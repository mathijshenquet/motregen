import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { FRAME_PIXELS } from './config.js'
import { NATIVE_VIEW } from './native-view.js'
import { parseMrfHeader } from '../web/src/core/mrf-codec.js'
import type { Manifest } from '../web/src/core/contract.js'

export async function prepareRustBasemaps(cacheDirectory: string, dataDirectory: string, outDirectory: string): Promise<void> {
  await mkdir(outDirectory, { recursive: true })
  const names = await readdir(cacheDirectory)
  const manifest = JSON.parse(await readFile(join(dataDirectory, 'manifest.json'), 'utf8')) as Manifest
  const chunk = manifest.chunks.find((chunk) => !chunk.field || chunk.field === 'rain_rate')
  if (!chunk) throw new Error('Regen ontbreekt')
  const bytes = await readFile(join(dataDirectory, chunk.url))
  const length = bytes.readUInt32LE(4) + 8
  const header = parseMrfHeader(bytes.subarray(0, length))
  const inputs: Record<string, string> = {}
  for (const theme of ['light', 'dark']) {
    const candidates = await Promise.all(names.filter((name) => new RegExp(`^basemap-${theme}-[a-f0-9]{24}\\.png$`).test(name)).map(async (name) => ({ name, modified: (await stat(join(cacheDirectory, name))).mtimeMs })))
    candidates.sort((left, right) => right.modified - left.modified)
    const source = candidates[0]?.name
    if (!source) throw new Error(`Geen ${theme}-plaat in botcache; maak de bestaande native assets eerst lokaal`)
    const metadata = await sharp(join(cacheDirectory, source)).metadata()
    if (metadata.width !== FRAME_PIXELS.width || metadata.height !== FRAME_PIXELS.height) throw new Error('Verkeerde basiskaartmaat')
    await copyFile(join(cacheDirectory, source), join(outDirectory, `${theme}.png`))
    await copyFile(join(cacheDirectory, `${source}.water.png`), join(outDirectory, `water-${theme}.png`))
    inputs[theme] = source
  }
  await writeFile(join(outDirectory, 'basemap.json'), JSON.stringify({ version: 1, size: FRAME_PIXELS, view: NATIVE_VIEW, grid: header.grid, inputs }, null, 2))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cache, data, out] = process.argv.slice(2)
  if (!cache || !data || !out) throw new Error('Gebruik: pnpm -C bot exec tsx prepare-rust-basemaps.ts CACHE DATA OUT')
  await prepareRustBasemaps(cache, data, out)
}
