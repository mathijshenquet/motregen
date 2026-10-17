import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { FRAME } from './config.js'
import { NATIVE_VIEW } from './native-view.js'
import { fpsFraction, holdFrames, sequencePlan } from './sequences.js'
import * as wind from '../web/src/core/wind-presentation.js'
import * as isoline from '../web/src/core/isolines.js'
import * as labels from '../web/src/core/isoline-label-anchors.js'
import * as map from '../web/src/core/map-presentation.js'
import * as palette from '../web/src/core/temperature-palette.js'
import { NETHERLANDS_FLANDERS_BOUNDS } from '../web/src/core/map-frame.js'
import { createHash } from 'node:crypto'
import * as cloudMap from '../web/src/core/cloud-map.js'
import { cloudFlowFragment, cloudMapFragment } from '../web/src/core/cloud-map-shader.js'
import { DARKEST_HALVINGS, FAIR_HALVINGS, LAYER_BLOCKING, layerTransmission, skyDarkness } from '../web/src/core/cloud-section.js'
import { solarElevationSin } from '../web/src/core/solar.js'
import { cloudModification } from '../web/src/core/uv.js'

export function modeConstants() {
  const now = '2026-08-28T15:00:00Z'
  const loop = (mode: 'wind' | 'feels' | 'air') => {
    const plan = sequencePlan(mode, { version: 0, generated: now, now, chunks: [] })
    return { loop_offsets: plan.epochs.slice(0, plan.loopFrames).map((epoch) => epoch - Date.parse(now)),
      fps: plan.fps, fps_fraction: fpsFraction(plan.fps), hold_frames: holdFrames(plan) }
  }
  return {
    loops: { wind: loop('wind'), feels: loop('feels'), air: loop('air') }, scale: FRAME.scale,
    cloud: cloudConstants(),
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
    palette_fixtures: [[-25,-5],[-5,5],[7,14],[20,30],[28,35]].map(([min,max]) => {
      const range = palette.paletteRange(min!, max!)!
      return { min, max, range, colors: Array.from({ length: 81 }, (_, index) => palette.bandColor(index - 30, 1, palette.paletteStops(range))) }
    }),
  }
}

/** Wolkenkaart (U92): constanten, controlewaarden voor de lichtketen en de vingerafdruk van de geporte shader. */
function cloudConstants() {
  const places = [[4.9, 52.37], [3.6, 51.45], [6.9, 53.2]] as const
  const epochs = ['2026-10-16T05:30:00Z', '2026-10-16T07:00:00Z', '2026-10-16T11:00:00Z', '2026-10-16T16:20:00Z', '2026-10-16T22:00:00Z', '2026-06-21T12:00:00Z']
  const radiations = [[null, null], [120, 180], [0, 0], [400, null], [null, 35]] as const
  const covers = [[0, 0, 0], [1, 0, 0], [0.3, 0.6, 0.9], [0.8, 0.1, 0.4]] as const
  const lights = [0, 0.05, 0.5, 0.78, 1, 1.4, Number.NaN]
  const light_fixtures = epochs.flatMap((time, timeIndex) => places.map(([longitude, latitude], placeIndex) => {
    const epoch = Date.parse(time)
    const [radiation_before, radiation_after] = radiations[(timeIndex + placeIndex) % radiations.length]!
    const [low, mid, high] = covers[(timeIndex * 2 + placeIndex) % covers.length]!
    const light = lights[(timeIndex + placeIndex * 3) % lights.length]!
    return {
      epoch, longitude, latitude, sin_elevation: solarElevationSin(epoch, longitude, latitude),
      radiation_before, radiation_after,
      modification: cloudModification(epoch, radiation_before, radiation_after, (at) => solarElevationSin(at, longitude, latitude)),
      low, mid, high, transmission: layerTransmission({ low, mid, high }),
      light: Number.isNaN(light) ? null : light, darkness: skyDarkness(light),
    }
  }))
  const shader = cloudMapFragment('') + cloudFlowFragment('')
  return {
    flow_steps: cloudMap.CLOUD_FLOW_STEPS, flow_hours: cloudMap.CLOUD_FLOW_HOURS, flow_downsample: cloudMap.CLOUD_FLOW_DOWNSAMPLE,
    blur: isoline.isolineBlurPasses('cloud'), layer_blocking: LAYER_BLOCKING, darkest_halvings: DARKEST_HALVINGS, fair_halvings: FAIR_HALVINGS,
    light_fixtures, shader_sha256: createHash('sha256').update(shader).digest('hex'),
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
