import { prepareNativeAsset } from './native-assets.js'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import type { BrowserContext } from 'playwright'
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'
import sharp from 'sharp'
import { NATIVE_VIEW } from './native-view.js'
export { NATIVE_VIEW } from './native-view.js'
import { mapFrameFromGrid } from '../web/src/core/map-frame.js'
import type { Grid } from '../web/src/core/contract.js'
import { captureLabelAtlas, type LabelAtlas } from './native-labels.js'
import { FRAME } from './config.js'

export type NativeTheme = 'light' | 'dark'
const require = createRequire(import.meta.url)

export interface WaterMask { values: Buffer; width: number; height: number }
export interface MapPlate { water: WaterMask; rgb: Buffer; key: string; path: string; labels: LabelAtlas }

export class NativeMaps {
  private readonly plates = new Map<NativeTheme, Promise<MapPlate>>()
  constructor(private readonly origin: string, private readonly directory: string, private readonly context: () => Promise<BrowserContext>) {}

  get(theme: NativeTheme, grid: Grid): Promise<MapPlate> {
    let pending = this.plates.get(theme)
    if (!pending) {
      pending = prepareNativeAsset(() => this.load(theme, grid)).catch((error) => { this.plates.delete(theme); throw error })
      this.plates.set(theme, pending)
    }
    return pending
  }

  private async load(theme: NativeTheme, grid: Grid): Promise<MapPlate> {
    const styleUrl = new URL(`/basemap/${theme === 'light' ? 'licht' : 'donker'}.json`, this.origin)
    const response = await fetch(styleUrl, { signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error(`Basiskaartstijl ontbreekt (${response.status})`)
    const style = await response.json() as StyleSpecification
    for (const source of Object.values(style.sources)) {
      if (source.type === 'vector' && source.url?.startsWith('pmtiles://')) {
        const archive = new URL(source.url.slice('pmtiles://'.length), this.origin)
        if (!/nl-[a-f0-9]{16}\.pmtiles$/.test(archive.pathname)) throw new Error('Basiskaartarchief heeft geen inhoudshash')
        source.url = `pmtiles://${archive.href}`
      }
    }
    if (style.glyphs) style.glyphs = new URL(style.glyphs, styleUrl).href.replaceAll('%7B', '{').replaceAll('%7D', '}')
    const key = createHash('sha256').update(JSON.stringify({ version: 2, style, theme, frame: FRAME, view: NATIVE_VIEW, grid })).digest('hex').slice(0, 24)
    const path = join(this.directory, `basemap-${theme}-${key}.png`)
    let cached: Omit<MapPlate, 'water'> | undefined
    try {
      cached = { rgb: await sharp(path).removeAlpha().raw().toBuffer(), key, path, labels: JSON.parse(await readFile(`${path}.labels.json`, 'utf8')) as LabelAtlas }
      const water = await sharp(`${path}.water.png`).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true })
      return { ...cached, water: { values: water.data, width: water.info.width, height: water.info.height } }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await mkdir(this.directory, { recursive: true })
    const started = performance.now()
    const temporary = `${path}.${randomUUID()}.tmp`
    const page = await (await this.context()).newPage()
    try {
      await page.route('**/__native-map', (route) => route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0"><div id="map" style="width:100vw;height:100vh"></div></body></html>' }))
      await page.goto(new URL('/__native-map', this.origin).href)
      await page.addStyleTag({ path: join(dirname(require.resolve('maplibre-gl')), 'maplibre-gl.css') })
      await page.addScriptTag({ path: require.resolve('maplibre-gl') })
      await page.addScriptTag({ path: resolve(dirname(require.resolve('pmtiles')), '../pmtiles.js') })
      const mask = mapFrameFromGrid(grid).mask
      await page.evaluate(async ({ styleJson, view, mask, theme }) => {
        const style = JSON.parse(styleJson) as StyleSpecification
        const globals = window as unknown as { maplibregl: typeof import('maplibre-gl'); pmtiles: typeof import('pmtiles'); nativeMap: MapLibreMap }
        const protocol = new globals.pmtiles.Protocol()
        globals.maplibregl.addProtocol('pmtiles', protocol.tile)
        const map = new globals.maplibregl.Map({ container: 'map', style, center: [view.lng, view.lat], zoom: view.zoom, fadeDuration: 0, renderWorldCopies: false, attributionControl: false, interactive: false })
        globals.nativeMap = map
        await new Promise<void>((resolve, reject) => { map.once('load', () => resolve()); map.on('error', (event) => reject(event.error)) })
        map.addSource('motregen-grid-frame', { type: 'geojson', data: mask })
        map.addLayer({ id: 'motregen-grid-outside', type: 'fill', source: 'motregen-grid-frame', paint: { 'fill-color': theme === 'dark' ? '#071319' : '#84969b', 'fill-opacity': theme === 'dark' ? 0.58 : 0.48 } })
        map.addLayer({ id: 'motregen-grid-frame-shadow', type: 'line', source: 'motregen-grid-frame', paint: { 'line-color': theme === 'dark' ? '#02080b' : '#30454c', 'line-opacity': 0.45, 'line-width': 7, 'line-blur': 2 } })
        map.addLayer({ id: 'motregen-grid-frame', type: 'line', source: 'motregen-grid-frame', paint: { 'line-color': theme === 'dark' ? '#8da6af' : '#405b64', 'line-opacity': 0.85, 'line-width': 1.5 } })
        await new Promise<void>((resolve) => map.once('idle', () => resolve()))
      }, { styleJson: JSON.stringify(style), view: NATIVE_VIEW, mask, theme })
      const waterData = await page.evaluate(() => {
        const map = (window as unknown as { nativeMap: MapLibreMap }).nativeMap
        const layer = map.getStyle().layers.find((candidate) => 'source-layer' in candidate && candidate['source-layer'] === 'water')
        if (!layer || !('source' in layer) || typeof layer.source !== 'string') throw new Error('Waterbron ontbreekt')
        const canvas = document.createElement('canvas')
        const viewport = map.getCanvas()
        canvas.width = Math.ceil(viewport.clientWidth / 6)
        canvas.height = Math.ceil(viewport.clientHeight / 6)
        const context = canvas.getContext('2d')!
        context.fillStyle = '#fff'
        for (const feature of map.querySourceFeatures(layer.source, { sourceLayer: 'water' })) {
          const geometry = feature.geometry
          const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : []
          for (const polygon of polygons as number[][][][]) {
            context.beginPath()
            for (const ring of polygon) ring.forEach(([longitude, latitude], index) => {
              const point = map.project([longitude!, latitude!])
              const screenX = point.x / viewport.clientWidth * canvas.width
              const screenY = point.y / viewport.clientHeight * canvas.height
              if (index === 0) context.moveTo(screenX, screenY)
              else context.lineTo(screenX, screenY)
            })
            context.fill('evenodd')
          }
        }
        return canvas.toDataURL('image/png').split(',')[1]!
      })
      const waterPng = Buffer.from(waterData, 'base64')
      await writeFile(`${temporary}.water.png`, waterPng)
      await rename(`${temporary}.water.png`, `${path}.water.png`)
      const water = await sharp(waterPng).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true })
      let plate = cached
      if (!plate) {
        const png = await page.screenshot()
        const rgb = await sharp(png).removeAlpha().raw().toBuffer()
        const labels = await captureLabelAtlas(page, theme, rgb)
        await writeFile(`${temporary}.labels.json`, JSON.stringify(labels))
        await rename(`${temporary}.labels.json`, `${path}.labels.json`)
        await writeFile(temporary, png)
        await rename(temporary, path)
        plate = { rgb, key, path, labels }
      }
      console.info(JSON.stringify({ event: cached ? 'native-water-created' : 'native-basemap-created', theme, key, labelVariants: cached ? 0 : 111, milliseconds: Math.round(performance.now() - started) }))
      return { ...plate, water: { values: water.data, width: water.info.width, height: water.info.height } }
    } finally { await page.close() }
  }
}
