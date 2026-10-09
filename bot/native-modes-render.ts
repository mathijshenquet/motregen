import { NativePressureMarks } from './native-pressure-marks.js'
import { frameBlend } from '../web/src/core/time-model.js'
import { nativeTextAtlas } from './native-text-atlas.js'
import { NativeText } from './native-text.js'
import { writeFile } from 'node:fs/promises'
import type { BrowserContext } from 'playwright'
import { MAP_FOCUS_SATURATION } from '../web/src/core/map-presentation.js'
import { FRAME_PIXELS } from './config.js'
import { encodeRgbLoop } from './encode.js'
import type { SequencePlan } from './sequences.js'
import type { LoopMode, StillManifest } from './stills.js'
import { NativeMaps } from './native-map.js'
import { NativeRainData, RainCompositor, rainTheme } from './native-rain.js'
import { drawTemperatureLabels } from './native-labels.js'
import { NativeOverlay } from './native-overlay.js'
import { rainPresentation } from '../web/src/core/rain-presentation.js'
import { NATIVE_VIEW } from './native-view.js'
import { NativeTemperatureData } from './native-temperature.js'
import { NativeFieldRaster } from './native-field-raster.js'
import { NativeWindData } from './native-wind.js'
import { NativeIsolineLabels } from './native-isoline-labels.js'
import { nativeFramePath } from './native-render.js'

export class NativeModesRenderer {
  constructor(private readonly origin: string, private readonly directory: string, private readonly context: () => Promise<BrowserContext>, private readonly sharedMaps?: NativeMaps) {}

  async render(mode: Exclude<LoopMode, 'weather'>, manifest: StillManifest, plan: SequencePlan, directory: string, destination: string) {
    const started = performance.now()
    const maps = this.sharedMaps ?? new NativeMaps(this.origin, this.directory, this.context)
    const overlay = new NativeOverlay(this.origin, this.directory, this.context, mode)
    const rain = new NativeRainData(this.origin, manifest)
    const temperatures = new NativeRainData(this.origin, manifest, 'feels_like_c')
    const temperatureEpoch = (epoch: number) => Math.max(temperatures.timeline[0]!.epoch, Math.min(temperatures.timeline.at(-1)!.epoch, Math.round(epoch / 600_000) * 600_000))
    const temperature = new NativeTemperatureData(this.origin, manifest, mode === 'feels' ? 'temperature' : 'pressure')
    const wind = mode === 'wind' ? new NativeWindData(this.origin, manifest) : undefined
    const firstRain = await rain.frame(Date.parse(manifest.now))
    await Promise.all([temperatures.prefetch(plan.epochs.map(temperatureEpoch)), temperature?.prepare(plan.epochs), wind?.prepare(plan.epochs), ...[...new Set(plan.epochs.map(rainTheme))].map(async (theme) => { await maps.get(theme, firstRain.grid) })])
    await overlay.prepare(manifest)
    const firstSlice = await temperature.slice(plan.epochs[0]!)
    const raster = new NativeFieldRaster(firstSlice.grid)
    const rainCompositors = new Map<string, RainCompositor>()
    try {
    if (wind) {
      await rain.prefetch(plan.epochs)
      for (const theme of new Set(plan.epochs.map(rainTheme))) {
        const compositor = new RainCompositor(firstRain.grid, FRAME_PIXELS, NATIVE_VIEW, rainPresentation({ temperatureFocus: 0, windFocus: 1, airFocus: 0, night: theme === 'dark' }))
        await compositor.prepare()
        rainCompositors.set(theme, compositor)
      }
    }
    const pressureMarks = wind ? await NativePressureMarks.prepare(this.directory, this.context) : undefined
    const labels = new NativeIsolineLabels(new NativeText(await nativeTextAtlas(this.origin, this.directory, this.context)))
    await raster?.prepare()
    const mutedMaps = new Map<string, Buffer>()
    if (mode === 'feels') {
      for (const theme of new Set(plan.epochs.map(rainTheme))) {
        const plate = await maps.get(theme, firstRain.grid)
        const muted = Buffer.alloc(plate.rgb.length)
        for (let offset = 0; offset < muted.length; offset += 3) {
          const gray = plate.rgb[offset]! * 0.213 + plate.rgb[offset + 1]! * 0.715 + plate.rgb[offset + 2]! * 0.072
          for (let channel = 0; channel < 3; channel++) muted[offset + channel] = Math.round(gray + (plate.rgb[offset + channel]! - gray) * MAP_FOCUS_SATURATION)
        }
        mutedMaps.set(theme, muted)
      }
    }
    const stillIndexes = new Set(plan.stillFrames.map((frame) => frame.index))
    const header = Buffer.from(`P6\n${FRAME_PIXELS.width} ${FRAME_PIXELS.height}\n255\n`)
    let renderMs = 0
      const render = async (index: number): Promise<Buffer> => {
        const frameStarted = performance.now(), epoch = plan.epochs[index]!
        const theme = rainTheme(epoch)
        const plate = await maps.get(theme, firstRain.grid)
        let rgb = mode === 'feels' ? Buffer.from(mutedMaps.get(theme)!) : drawTemperatureLabels(plate.rgb, plate.labels, await temperatures.frame(temperatureEpoch(epoch)))
        if (mode === 'feels') {
          const slice = index === 0 ? firstSlice! : await temperature.slice(epoch)
          rgb = await raster!.compose(rgb, slice, theme === 'dark')
          rgb = await labels.draw(rgb, slice, theme)
        } else {
          const slice = index === 0 ? firstSlice : await temperature.slice(epoch)
          rgb = await raster.compose(rgb, slice, theme === 'dark')
          rgb = await labels.draw(rgb, slice, theme)
          rgb = await wind!.draw(rgb, epoch, 1000 + index * 1000 / plan.fps, theme, plate.water)
          const pressureBlend = frameBlend(temperature.data.timeline, epoch)
          await pressureMarks!.draw(rgb, slice.grid, await temperature.field(pressureBlend.left), await temperature.field(pressureBlend.right), pressureBlend.mix, theme, slice.opacity)
          rgb = await rainCompositors.get(theme)!.composeFast(rgb, await rain.frame(epoch), theme === 'dark')
        }
        rgb = await overlay.draw(rgb, epoch, Date.parse(manifest.now))
        if (stillIndexes.has(index)) await writeFile(nativeFramePath(directory, index), [header, rgb])
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
    } finally { await raster.close(); await Promise.all([...rainCompositors.values()].map((compositor) => compositor.close())) }
  }
}
