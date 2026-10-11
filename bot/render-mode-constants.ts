import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { FRAME } from './config.js'
import { NATIVE_VIEW } from './native-view.js'
import { holdFrames, sequencePlan } from './sequences.js'
import * as wind from '../web/src/core/wind-presentation.js'
import * as isoline from '../web/src/core/isolines.js'
import * as labels from '../web/src/core/isoline-label-anchors.js'
import * as map from '../web/src/core/map-presentation.js'
import * as palette from '../web/src/core/temperature-palette.js'
import { rainPresentation } from '../web/src/core/rain-presentation.js'
import { NETHERLANDS_FLANDERS_BOUNDS } from '../web/src/core/map-frame.js'

export function modeConstants() {
  const now = '2026-08-28T15:00:00Z'
  const plan = sequencePlan('wind', { version: 0, generated: now, now, chunks: [] })
  return {
    loop_offsets: plan.epochs.map((epoch) => epoch - Date.parse(now)), fps: plan.fps, hold_frames: holdFrames(plan), scale: FRAME.scale,
    wind: { ...wind.WIND_PARAMETERS, count: wind.particleCountForViewport(FRAME.width, FRAME.height), focus: wind.WIND_FOCUS_INTENSITY,
      stagger: wind.WIND_INITIAL_STAGGER_SECONDS, simulation_fps: wind.WIND_SIMULATION_FPS, screen_speed: wind.windScreenSpeed(1),
      damping_reference: wind.DAMPING_REFERENCE_SPEED, weak_speed: wind.WEAK_WIND_SPEED, weak_boost: wind.WEAK_WIND_MAX_BOOST,
      stops: wind.BEAUFORT_STOPS, light: wind.LIGHT_RAMP, dark: wind.DARK_RAMP },
    isoline: { temperature_blur: isoline.ISOLINE_BLUR, pressure_blur: isoline.ISOBAR_BLUR, time_weights: isoline.ISOBAR_TIME_WEIGHTS,
      ring_km: isoline.ISOLINE_RING_KM, tolerance_px: isoline.ISOLINE_TOLERANCE_PX, edge_fade_ms: isoline.ISOLINE_EDGE_FADE_MS,
      pressure_radius_km: isoline.PRESSURE_EXTREMUM_KM, pressure_prominence: isoline.PRESSURE_EXTREMUM_HPA,
      fill_opacity: isoline.ISOLINE_FILL_OPACITY, fill_resolution: isoline.ISOLINE_FILL_RESOLUTION / FRAME.scale,
      temperature_opacity: map.TEMPERATURE_LINE_OPACITY, pressure_opacity: map.ISOBAR_LINE_OPACITY,
      line_profile: map.lineProfile(map.isolineWidthCss(NATIVE_VIEW.zoom) * FRAME.scale),
      light_temperature: isoline.isolineColor('light', 'temperature'), dark_temperature: isoline.isolineColor('dark', 'temperature'),
      light_pressure: isoline.isolineColor('light', 'pressure'), dark_pressure: isoline.isolineColor('dark', 'pressure') },
    labels: { spacing: labels.LABEL_SPACING_PX, distance: labels.LABEL_MIN_DISTANCE_PX, maximum: labels.MAX_LABEL_ANCHORS },
    saturation: map.MAP_FOCUS_SATURATION, bounds: NETHERLANDS_FLANDERS_BOUNDS,
    palette: { ramp: palette.TEMPERATURE_RAMP, cold: palette.COLD_ANCHOR_C, warm: palette.WARM_ANCHOR_C, minimum_span: palette.MIN_SPAN_C },
    rain: Object.fromEntries([false, true].map((night) => [night ? 'dark' : 'light', rainPresentation({ temperatureFocus: 0, windFocus: 1, airFocus: 0, night })])),
    palette_fixtures: [[-25,-5],[-5,5],[7,14],[20,30],[28,35]].map(([min,max]) => {
      const range = palette.paletteRange(min!, max!)!
      return { min, max, range, colors: Array.from({ length: 81 }, (_, index) => palette.bandColor(index - 30, 1, palette.paletteStops(range))) }
    }),
  }
}

export async function generateModeConstants(check = false): Promise<void> {
  const path = new URL('../crates/render-core/assets/mode-constants.json', import.meta.url)
  const expected = JSON.stringify(modeConstants()) + '\n'
  if (check) {
    if (await readFile(path, 'utf8') !== expected) throw new Error('Verouderde modeconstanten; draai pnpm -C bot render:constants')
  } else await writeFile(path, expected)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await generateModeConstants(process.argv.includes('--check'))
