import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BrowserContext } from 'playwright'
import { FRAME_PIXELS } from './config.js'
import { encodeRgbLoop } from './encode.js'
import type { SequencePlan } from './sequences.js'
import type { StillManifest } from './stills.js'
import { NativeMaps } from './native-map.js'
import { NativeRainData, RainCompositor, rainTheme } from './native-rain.js'
import { drawTemperatureLabels } from './native-labels.js'
import { NativeOverlay } from './native-overlay.js'

export function nativeFramePath(directory: string, index: number): string { return join(directory, `frame-${String(index).padStart(3, '0')}.ppm`) }

export class NativeWeatherRenderer {
  private readonly maps: NativeMaps
  private readonly overlay: NativeOverlay
  constructor(origin: string, directory: string, context: () => Promise<BrowserContext>) {
    this.maps = new NativeMaps(origin, directory, context)
    this.overlay = new NativeOverlay(origin, directory, context)
    this.origin = origin
  }
  private readonly origin: string

  async render(manifest: StillManifest, plan: SequencePlan, directory: string, destination: string): Promise<{ renderMs: number; encodeMs: number; loopMs: number; bytes: number }> {
    const started = performance.now()
    const data = new NativeRainData(this.origin, manifest)
    const hasTemperature = manifest.chunks.some((chunk) => chunk.field === 'feels_like_c')
    const temperatures = hasTemperature ? new NativeRainData(this.origin, manifest, 'feels_like_c') : undefined
    const first = await data.frame(plan.epochs[0]!)
    const compositor = new RainCompositor(first.grid)
    const themes = [...new Set(plan.epochs.map(rainTheme))]
    await Promise.all([...themes.map((theme) => this.maps.get(theme, first.grid)), this.overlay.prepare(manifest)])
    let renderMs = 0
    const now = Date.parse(manifest.now)
    const header = Buffer.from(`P6\n${FRAME_PIXELS.width} ${FRAME_PIXELS.height}\n255\n`)
    const stillIndexes = new Set(plan.stillFrames.map((frame) => frame.index))
    const render = async (index: number): Promise<Buffer> => {
      const frameStarted = performance.now()
      const epoch = plan.epochs[index]!
      const frame = index === 0 ? first : await data.frame(epoch)
      const theme = rainTheme(epoch)
      const map = await this.maps.get(theme, frame.grid)
      const temperatureEpoch = Math.round(epoch / 600_000) * 600_000
      const base = temperatures ? drawTemperatureLabels(map.rgb, map.labels, await temperatures.frame(Math.max(temperatures.timeline[0]!.epoch, Math.min(temperatures.timeline.at(-1)!.epoch, temperatureEpoch)))) : map.rgb
      const rgb = await this.overlay.draw(compositor.compose(base, frame, theme === 'dark'), epoch, now)
      if (stillIndexes.has(index)) await writeFile(nativeFramePath(directory, index), [header, rgb])
      renderMs += performance.now() - frameStarted
      return rgb
    }
    async function* frames() { for (let index = 0; index < plan.loopFrames; index++) yield await render(index) }
    const loopStarted = performance.now()
    const encoded = await encodeRgbLoop(frames(), destination, plan, FRAME_PIXELS)
    const loopMs = Math.round(performance.now() - loopStarted)
    for (let index = plan.loopFrames; index < plan.epochs.length; index++) await render(index)
    return { renderMs: Math.round(renderMs + loopStarted - started), encodeMs: Math.max(0, Math.round(performance.now() - started - renderMs - (loopStarted - started))), loopMs, bytes: encoded.bytes }
  }
}
