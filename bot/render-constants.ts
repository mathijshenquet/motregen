import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { FRAME, FRAME_PIXELS } from './config.js'
import { NATIVE_VIEW } from './native-view.js'
import { sequencePlan } from './sequences.js'
import { STILL_MINUTES } from './stills.js'
import { rainColormap } from '../web/src/core/rain-chart.js'
import { rainPresentation } from '../web/src/core/rain-presentation.js'
import { FLOW_BLEND_CURVE } from '../web/src/core/rain-motion.js'
import { autoBlurSigma, rainSampling, rainWarpLimit, DEFAULT_RAIN_FIELD_TUNING } from '../web/src/core/rain-smoothing.js'
import { BLUR_RADIUS_SIGMA, kernelTaps } from '../web/src/core/rain-sampling.js'
import { RainCompositor } from './native-rain.js'
import { projectPoint } from '../web/src/core/point-value.js'
import { selectTemperaturePlaces, temperatureLabelSpacingPx, temperatureLayer } from '../web/src/core/temperature.js'
import { DEFAULT_LOCATION, stillMapTheme } from '../web/src/core/still-theme.js'
import { buildTimeline, frameBlend } from '../web/src/core/time-model.js'
import type { Manifest, Source } from '../web/src/core/contract.js'

export function renderConstants() {
  const now = '2026-08-28T15:00:00Z'
  const sources: Source[] = ['harmonie', 'uv', 'seamless', 'nowcast', 'rtcor']
  const plan = sequencePlan('weather', { version: 0, generated: now, now, chunks: [] })
  const samples = Array.from({ length: 721 }, (_, minute) => {
    const sigma = autoBlurSigma(minute * 60_000)
    return { sigma, taps: kernelTaps('source-blur', sigma) }
  })
  return {
    version: 1,
    frame: FRAME, size: FRAME_PIXELS, view: NATIVE_VIEW, location: DEFAULT_LOCATION,
    palette: Array.from(rainColormap()),
    presentation: Object.fromEntries([false, true].map((night) => [night ? 'dark' : 'light', rainPresentation({ temperatureFocus: 0, windFocus: 0, airFocus: 0, night })])),
    flow_curve: FLOW_BLEND_CURVE,
    sampling: { samples, kernel_radius: BLUR_RADIUS_SIGMA, radar_cell_width: rainSampling('rtcor', 0, DEFAULT_RAIN_FIELD_TUNING).sourceCellWidth, harmonie_cell_width: rainSampling('harmonie', 0, DEFAULT_RAIN_FIELD_TUNING).sourceCellWidth },
    warp: Array.from({ length: 61 }, (_, interval) => rainWarpLimit(interval)),
    places: selectTemperaturePlaces(NATIVE_VIEW.zoom, temperatureLabelSpacingPx(FRAME.width, FRAME.height)),
    temperature_style: { light: temperatureLayer('light'), dark: temperatureLayer('dark') },
    sources,
    loop_offsets: plan.epochs.slice(0, plan.loopFrames).map((epoch) => epoch - Date.parse(now)),
    fps: plan.fps, still_minutes: STILL_MINUTES,
  }
}

export function renderFixtures() {
  const now = '2026-08-28T15:00:00Z'
  const epoch = Date.parse(now)
  const chunk = (source: Source, run: string, minutes: number[], field?: 'feels_like_c') => ({ url: `${source}-${run}-${field ?? 'rain'}.mrf`, source, run, header_len: 42, times: minutes.map((minute) => new Date(epoch + minute * 60_000).toISOString()), ...(field ? { field } : {}) })
  const manifest: Manifest = { version: 0, generated: now, now, chunks: [
    chunk('harmonie', '2026-08-28T12:00:00Z', [-60, 0, 120, 180, 720]),
    chunk('seamless', now, [120]), chunk('nowcast', '2026-08-28T14:00:00Z', [-60, 0, 5, 120]),
    chunk('nowcast', now, [0, 5]), chunk('rtcor', now, [-120, -60, 0]),
    chunk('harmonie', now, [-60, 0, 60], 'feels_like_c'),
  ] }
  const timeline = buildTimeline(manifest)
  const times = ['2026-03-29T00:59:00Z', '2026-03-29T01:00:00Z', '2026-10-25T00:59:00Z', '2026-10-25T01:00:00Z', '2026-10-10T21:59:00Z', '2026-10-10T22:01:00Z']
  const time = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit' })
  const day = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', weekday: 'short' })
  const [centerX, centerY] = projectPoint(NATIVE_VIEW.lng, NATIVE_VIEW.lat)
  const grid = { crs: 'EPSG:3857', x0: centerX - 2000, y0: centerY + 2000, dx: 1000, dy: -1000, width: 4, height: 4 }
  const compositor = new RainCompositor(grid, { width: 1, height: 1 })
  const compositions = [0, 1, 12, 24, 55, 100, 150, 195, 235, 254, 255].flatMap((left) => [0, 0.5, 1].map((mix) => {
    const right = left === 255 ? 100 : 254 - left
    const rgb = compositor.compose(new Uint8Array([100, 150, 200]), { grid, left: new Uint8Array(16).fill(left), right: new Uint8Array(16).fill(right), mix, leftHeader: {} as never, rightHeader: {} as never, intervalMinutes: 5 }, false)
    return { left, right, mix, rgb: Array.from(rgb) }
  }))
  return {
    compositions,
    manifest,
    timeline: timeline.map(({ epoch, source, frameIndex, chunk }) => ({ epoch, source, frame_index: frameIndex, url: chunk.url })),
    blends: [-180, -120, -90, 0, 2.5, 5, 62.5, 120, 150, 720, 800].map((minute) => ({ epoch: epoch + minute * 60_000, ...frameBlend(timeline, epoch + minute * 60_000) })),
    clocks: times.map((value) => ({ epoch: Date.parse(value), time: time.format(Date.parse(value)), day: day.format(Date.parse(value)) })),
    themes: Array.from({ length: 1441 }, (_, minute) => ({ epoch: Date.parse('2026-10-10T00:00:00Z') + minute * 60_000, dark: stillMapTheme(Date.parse('2026-10-10T00:00:00Z') + minute * 60_000) === 'dark' })),
  }
}

const outputs = [
  [new URL('../crates/render-core/assets/constants.json', import.meta.url), renderConstants],
  [new URL('../crates/render-core/assets/fixtures.json', import.meta.url), renderFixtures],
] as const

export async function generateRenderConstants(check = false): Promise<void> {
  for (const [path, generate] of outputs) {
    const expected = JSON.stringify(generate()) + '\n'
    if (check) {
      if (await readFile(path, 'utf8') !== expected) throw new Error(`Verouderd renderbestand: ${fileURLToPath(path)}; draai pnpm -C bot render:constants`)
    } else await writeFile(path, expected)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await generateRenderConstants(process.argv.includes('--check'))
