import { nativeTextAtlas, prepareNativeTextAtlas } from './native-text-atlas.js'
import { NativeText, type TextPlacement } from './native-text.js'
import { writeFile } from 'node:fs/promises'
import type { NativeAssetContext } from './native-assets.js'
import { MAP_FOCUS_SATURATION } from '../web/src/core/map-presentation.js'
import { FRAME_PIXELS } from './config.js'
import { encodeRgbLoop } from './encode.js'
import type { SequencePlan } from './sequences.js'
import type { LoopMode, StillManifest } from './stills.js'
import { NativeMaps } from './native-map.js'
import { NativeRainData, rainTheme } from './native-rain.js'
import { NativeOverlay } from './native-overlay.js'
import { NativeTemperatureData, type RasterGeometry } from './native-temperature.js'
import { shortRings } from '../web/src/core/isoline-contours.js'
import { ISOLINE_RING_KM } from '../web/src/core/isolines.js'
import { NativeFieldRaster } from './native-field-raster.js'
import { NativeWindData } from './native-wind.js'
import { NativeWindsocks } from './native-windsocks.js'
import { NativeIsolineLabels } from './native-isoline-labels.js'
import { nativeFramePath } from './native-render.js'
import { releaseFileCache } from './native-raster.js'

export class NativeModesRenderer {
  constructor(private readonly origin: string, private readonly directory: string, private readonly context: NativeAssetContext, private readonly sharedMaps?: NativeMaps, private readonly assetsReady?: () => Promise<void>) {}

  async prepareAssets(mode: Exclude<LoopMode, 'weather'>, manifest: StillManifest, plan: SequencePlan): Promise<void> {
    await new NativeOverlay(this.origin, this.directory, this.context, mode).prepare(manifest, [])
    // Wind (U101): Beaufortvlakken en windzakken, zonder lijnlabels; alleen Gevoel heeft tekst in de atlas.
    if (mode === 'wind') return
    const placements = await (async () => {
      const temperature = new NativeTemperatureData(this.origin, manifest, 'temperature')
      const anchors = new NativeIsolineLabels()
      const placements: TextPlacement[] = []
      try {
        await temperature.prepare()
        for (const epoch of plan.epochs) {
          const slice = await temperature.slice(epoch, { rasterizeRings: false })
          placements.push(...anchors.place(slice, rainTheme(epoch)))
        }
        return placements
      } finally { temperature.clear() }
    })()
    global.gc?.()
    console.info(JSON.stringify({ event: 'native-atlas-preparation-memory', mode, placements: placements.length, ...process.memoryUsage() }))
    await prepareNativeTextAtlas(this.origin, this.directory, this.context, placements)
  }

  async render(mode: Exclude<LoopMode, 'weather'>, manifest: StillManifest, plan: SequencePlan, directory: string, destination: string) {
    const started = performance.now()
    const maps = this.sharedMaps ?? new NativeMaps(this.origin, this.directory, this.context)
    const overlay = new NativeOverlay(this.origin, this.directory, this.context, mode)
    const rainMetadata = new NativeRainData(this.origin, manifest)
    const temperature = new NativeTemperatureData(this.origin, manifest, mode === 'feels' ? 'temperature' : 'wind')
    const wind = mode === 'wind' ? new NativeWindData(this.origin, manifest) : undefined
    const grid = await rainMetadata.grid(Date.parse(manifest.now))
    await Promise.all([temperature.prepare(), wind?.prepare(plan.epochs), ...[...new Set(plan.epochs.map(rainTheme))].map(async (theme) => { await maps.get(theme, grid) })])
    await overlay.prepare(manifest, plan.epochs)
    const geometries: RasterGeometry[] = []
    const placements: TextPlacement[][] = []
    const labelAnchors = new NativeIsolineLabels()
    for (const epoch of plan.epochs) {
      const slice = await temperature.slice(epoch, { rasterizeRings: false })
      placements.push(mode === 'feels' ? labelAnchors.place(slice, rainTheme(epoch)) : [])
      geometries.push({ kind: slice.kind, grid: slice.grid, segments: slice.segments, opacity: slice.opacity, rings: slice.kind === 'wind' ? [] : shortRings(slice.contours, ISOLINE_RING_KM) })
    }
    // Temporary contour arrays are much larger than the retained raster geometry.
    global.gc?.()
    console.info(JSON.stringify({ event: 'native-preparation-memory', mode, ...process.memoryUsage() }))
    const firstSlice = geometries[0]!
    const raster = new NativeFieldRaster(firstSlice.grid)
    try {
      const windsocks = wind ? await NativeWindsocks.prepare() : undefined
      const text = new NativeText(await nativeTextAtlas(this.origin, this.directory, this.context, placements.flat()))
      await raster.prepare()
      const mutedMaps = new Map<string, Buffer>()
      if (mode === 'feels') {
        for (const theme of new Set(plan.epochs.map(rainTheme))) {
          const plate = await maps.get(theme, grid)
          const muted = Buffer.alloc(plate.rgb.length)
          for (let offset = 0; offset < muted.length; offset += 3) {
            const gray = plate.rgb[offset]! * 0.213 + plate.rgb[offset + 1]! * 0.715 + plate.rgb[offset + 2]! * 0.072
            for (let channel = 0; channel < 3; channel++) muted[offset + channel] = Math.round(gray + (plate.rgb[offset + channel]! - gray) * MAP_FOCUS_SATURATION)
          }
          mutedMaps.set(theme, muted)
        }
      }
      await this.assetsReady?.()
      const stillIndexes = new Set(plan.stillFrames.map((frame) => frame.index))
      const header = Buffer.from(`P6\n${FRAME_PIXELS.width} ${FRAME_PIXELS.height}\n255\n`)
      let renderMs = 0
      const render = async (index: number): Promise<Buffer> => {
        const frameStarted = performance.now(), epoch = plan.epochs[index]!
        const theme = rainTheme(epoch)
        const plate = await maps.get(theme, grid)
        const slice = await temperature.rasterSlice(epoch, geometries[index]!)
        // In Wind wijken de stadstemperaturen voor de windzakken, zoals in de app.
        let rgb = mode === 'feels' ? Buffer.from(mutedMaps.get(theme)!) : plate.rgb
        rgb = await raster.compose(rgb, slice, theme === 'dark')
        if (mode === 'feels') {
          for (const label of placements[index]!) await text.draw(rgb, label.text, label.screenX, label.screenY, label.angle, label.color, label.theme, label.opacity)
        } else {
          const simulationMs = 1000 + index * 1000 / plan.fps
          rgb = await wind!.draw(rgb, epoch, simulationMs, theme, plate.water)
          await windsocks!.draw(rgb, await windsocks!.field(wind!.eastwardData, wind!.northwardData, epoch), simulationMs / 1000, theme)
        }
        rgb = await overlay.draw(rgb, epoch, Date.parse(manifest.now))
        if (stillIndexes.has(index)) {
          const path = nativeFramePath(directory, index)
          await writeFile(path, [header, rgb])
          await releaseFileCache(path)
        }
        const milliseconds = performance.now() - frameStarted
        renderMs += milliseconds
        if (stillIndexes.has(index)) console.info(JSON.stringify({ event: 'native-still-frame', mode, epoch, milliseconds: Math.round(milliseconds) }))
        return rgb
      }
      async function* frames() { for (let index = 0; index < plan.loopFrames; index++) yield await render(index) }
      const loopStarted = performance.now(), preparationMs = Math.round(loopStarted - started)
      const encoded = await encodeRgbLoop(frames(), destination, plan, FRAME_PIXELS)
      const loopMs = Math.round(performance.now() - loopStarted), loopRenderMs = Math.round(renderMs)
      console.info(JSON.stringify({ event: 'native-loop-profile', mode, preparationMs, loopMs, renderMs: loopRenderMs }))
      for (let index = plan.loopFrames; index < plan.epochs.length; index++) await render(index)
      return { renderMs: Math.round(renderMs + preparationMs), encodeMs: Math.max(0, Math.round(performance.now() - started - renderMs - preparationMs)), preparationMs, loopMs, loopRenderMs, bytes: encoded.bytes }
    } finally {
      await raster.close()
      rainMetadata.clear(); temperature.clear(); wind?.clear(); maps.clear()
    }
  }
}
