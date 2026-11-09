// U108-proef: Rust-basiskaartplaten voor de `?dev&kaart=`-varianten, zodat de film dezelfde kaart toont als de app.
// Rendert per variant en thema een plaat via de stijl uit ORIGIN/dev-kaart/ en zet hem als basemap-dir in OUT/<variant>.
// Gebruik: pnpm -C bot exec tsx basemap-variant-plates.ts ORIGIN DATA OUT [variant…]
import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { FRAME, FRAME_VIEWPORT } from './config.js'
import { NativeMaps, type NativeTheme } from './native-map.js'
import { prepareRustBasemaps } from './prepare-rust-basemaps.js'
import { parseMrfHeader } from '../web/src/core/mrf-codec.js'
import type { Manifest } from '../web/src/core/contract.js'

const [origin, data, out, ...requested] = process.argv.slice(2)
if (!origin || !data || !out) throw new Error('Gebruik: basemap-variant-plates.ts ORIGIN DATA OUT [variant…]')
const variants = requested.length ? requested : ['nu', 'licht', 'licht-rivieren', 'atlas']
const manifest = JSON.parse(await readFile(join(data, 'manifest.json'), 'utf8')) as Manifest
const chunk = manifest.chunks.find((candidate) => !candidate.field || candidate.field === 'rain_rate')
if (!chunk) throw new Error('Regen ontbreekt')
const bytes = await readFile(join(data, chunk.url))
const grid = parseMrfHeader(bytes.subarray(0, bytes.readUInt32LE(4) + 8)).grid

const browser = await chromium.launch({ executablePath: process.env.MOTREGEN_CHROMIUM_PATH, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
try {
  const context = await browser.newContext({ viewport: FRAME_VIEWPORT, deviceScaleFactor: FRAME.scale, locale: 'nl-NL', serviceWorkers: 'block' })
  for (const variant of variants) {
    const name = (theme: NativeTheme) => theme === 'light' ? 'licht' : 'donker'
    const stylePath = (theme: NativeTheme) => variant === 'nu' ? `/basemap/${name(theme)}.json` : `/dev-kaart/${variant}-${name(theme)}.json`
    const cache = join(out, 'cache', variant)
    const maps = new NativeMaps(origin, cache, async () => context, stylePath)
    for (const theme of ['light', 'dark'] as const) await maps.get(theme, grid)
    await prepareRustBasemaps(cache, data, join(out, variant))
    console.info(JSON.stringify({ event: 'variant-plates', variant, directory: join(out, variant) }))
  }
} finally {
  await browser.close()
}
