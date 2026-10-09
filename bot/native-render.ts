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
  constructor(private readonly origin: string, private readonly directory: string, private readonly context: () => Promise<BrowserContext>) {}

  async render(manifest: StillManifest, plan: SequencePlan, directory: string, destination: string, loopComplete: () => void): Promise<{ renderMs: number; encodeMs: number; loopMs: number; bytes: number }> {
    const started = performance.now()
    const maps = new NativeMaps(this.origin, this.directory, this.context)
    const overlay = new NativeOverlay(this.origin, this.directory, this.context)
    const data = new NativeRainData(this.origin, manifest)
    const hasTemperature = manifest.chunks.some((chunk) => chunk.field === 'feels_like_c')
    const temperatures = hasTemperature ? new NativeRainData(this.origin, manifest, 'feels_like_c') : undefined
    const first = await data.frame(plan.epochs[0]!)
    const compositor = new RainCompositor(first.grid)
    try {
      const themes = [...new Set(plan.epochs.map(rainTheme))]
      await Promise.all([...themes.map((theme) => maps.get(theme, first.grid)), overlay.prepare(manifest), compositor.prepare(), data.prefetch(plan.epochs), temperatures?.prefetch(plan.epochs.map((epoch) => Math.max(temperatures.timeline[0]!.epoch, Math.min(temperatures.timeline.at(-1)!.epoch, Math.round(epoch / 600_000) * 600_000))))])
      let renderMs = 0
      const phases = { dataMs: 0, labelsMs: 0, rainMs: 0, overlayMs: 0, writeMs: 0 }
      const now = Date.parse(manifest.now)
      const header = Buffer.from(`P6\n${FRAME_PIXELS.width} ${FRAME_PIXELS.height}\n255\n`)
      const stillIndexes = new Set(plan.stillFrames.map((frame) => frame.index))
      const render = async (index: number): Promise<Buffer> => {
        const frameStarted = performance.now()
        const epoch = plan.epochs[index]!
        const frame = index === 0 ? first : await data.frame(epoch)
        const theme = rainTheme(epoch)
        const map = await maps.get(theme, frame.grid)
        const loaded = performance.now()
        const temperatureEpoch = Math.round(epoch / 600_000) * 600_000
        const base = temperatures ? drawTemperatureLabels(map.rgb, map.labels, await temperatures.frame(Math.max(temperatures.timeline[0]!.epoch, Math.min(temperatures.timeline.at(-1)!.epoch, temperatureEpoch)))) : map.rgb
        const labelled = performance.now()
        const rain = await compositor.composeFast(base, frame, theme === 'dark')
        const composed = performance.now()
        const rgb = await overlay.draw(rain, epoch, now)
        const overlaid = performance.now()
        if (stillIndexes.has(index)) await writeFile(nativeFramePath(directory, index), [header, rgb])
        const finished = performance.now()
        phases.dataMs += loaded - frameStarted
        phases.labelsMs += labelled - loaded
        phases.rainMs += composed - labelled
        phases.overlayMs += overlaid - composed
        phases.writeMs += finished - overlaid
        renderMs += finished - frameStarted
        if (stillIndexes.has(index)) console.info(JSON.stringify({ event: 'native-still-frame', epoch, milliseconds: Math.round(finished - frameStarted) }))
        return rgb
      }
      async function* frames() { for (let index = 0; index < plan.loopFrames; index++) yield await render(index) }
      const loopStarted = performance.now()
      const encoded = await encodeRgbLoop(frames(), destination, plan, FRAME_PIXELS)
      const loopMs = Math.round(performance.now() - loopStarted)
      console.info(JSON.stringify({ event: 'native-loop-profile', loopMs, renderMs: Math.round(renderMs), ...Object.fromEntries(Object.entries(phases).map(([key, value]) => [key, Math.round(value)])) }))
      loopComplete()
      for (let index = plan.loopFrames; index < plan.epochs.length; index++) await render(index)
      return { renderMs: Math.round(renderMs + loopStarted - started), encodeMs: Math.max(0, Math.round(performance.now() - started - renderMs - (loopStarted - started))), loopMs, bytes: encoded.bytes }
    } finally { await compositor.close() }
  }
}
