import type { Source } from './contract'
import { WARP_CAP_CELLS, WARP_FADE_END_CELLS, type RainKernel, type RainSampling, type RainTimeBlend } from './rain-layer'

// U72-proef (?dev, Kaart › Regenveld; vervalt 2026-10-16): hoe het regenveld tussen de cellen wordt ingevuld.
export const RAIN_SMOOTHINGS = ['blokken', 'bilineair', 'bronlineair', 'glad', 'blur 3×3', 'blur 5×5', 'blur 7×7', 'blur 9×9'] as const
export type RainSmoothing = typeof RAIN_SMOOTHINGS[number]
export const DEFAULT_RAIN_SMOOTHING: RainSmoothing = 'bilineair'

export const RAIN_TIME_BLENDS = ['kruisfade', 'vloeiend', 'meebewegen'] as const
export type RainTimeBlendChoice = typeof RAIN_TIME_BLENDS[number]
export const DEFAULT_RAIN_TIME_BLEND: RainTimeBlendChoice = 'kruisfade'

export type RainSourceGroup = 'radar' | 'harmonie'

export interface RainFieldTuning {
  radar: RainSmoothing
  harmonie: RainSmoothing
  harmonieTime: RainTimeBlendChoice
}

export const DEFAULT_RAIN_FIELD_TUNING: RainFieldTuning = {
  radar: DEFAULT_RAIN_SMOOTHING,
  harmonie: DEFAULT_RAIN_SMOOTHING,
  harmonieTime: DEFAULT_RAIN_TIME_BLEND,
}

export const RAIN_FIELD_STORAGE_KEYS: Record<keyof RainFieldTuning, string> = {
  radar: 'motregen-dev-regenveld-radar',
  harmonie: 'motregen-dev-regenveld-harmonie',
  harmonieTime: 'motregen-dev-regenveld-tijd',
}
/** Rig-schakelaar zonder knop: `aan` meet elke voorfilter-pass (wacht op de GPU) in `window.__motregenRainFilterPasses`. */
export const RAIN_FILTER_MEASURE_STORAGE_KEY = 'motregen-dev-regenveld-meet'

/** De blend (seamless) staat net als radar en nowcast op een bronraster van ~1 km en hoort dus bij die groep. */
export function rainSourceGroup(source: Source): RainSourceGroup {
  return source === 'harmonie' ? 'harmonie' : 'radar'
}

// Breedte van één broncel in cellen van het gedeelde raster (1 km in Web Mercator, ~0,62 km op de grond bij
// 52°N). De ingest zet elke bron met dichtste-buur op dat raster, dus de bron blijft als blokken zichtbaar:
// radar/nowcast/blend ~1 km op de grond = ~1,6 cel, HARMONIE-AROME 0,029° × 0,018° = ~3,25 cel.
const SOURCE_CELL_WIDTH: Record<RainSourceGroup, number> = { radar: 1.56, harmonie: 3.25 }

const KERNELS: Record<RainSmoothing, { kernel: RainKernel; blurTaps?: number }> = {
  'blokken': { kernel: 'nearest' },
  'bilineair': { kernel: 'bilinear' },
  'bronlineair': { kernel: 'source-linear' },
  'glad': { kernel: 'source-cubic' },
  'blur 3×3': { kernel: 'source-blur', blurTaps: 3 },
  'blur 5×5': { kernel: 'source-blur', blurTaps: 5 },
  'blur 7×7': { kernel: 'source-blur', blurTaps: 7 },
  'blur 9×9': { kernel: 'source-blur', blurTaps: 9 },
}

export function rainSampling(source: Source, tuning: RainFieldTuning): RainSampling {
  const group = rainSourceGroup(source)
  return { ...KERNELS[tuning[group]], sourceCellWidth: SOURCE_CELL_WIDTH[group] }
}

// Bij uurframes verplaatst een bui zich tientallen cellen; de gewone kap (15 cellen) zet het meebewegen dan
// uit. "meebewegen" tilt de kap op tot ruim boven een stormachtig uur (~80 cellen bij 50 km/u).
const HOURLY_WARP_CAP_CELLS = 120
const HOURLY_WARP_FADE_END_CELLS = 240

/** De tijdmenging voor een framepaar; alleen een paar van twee HARMONIE-frames wijkt af van de standaard. */
export function rainTimeBlend(left: Source, right: Source, tuning: RainFieldTuning): RainTimeBlend {
  const hourlyPair = rainSourceGroup(left) === 'harmonie' && rainSourceGroup(right) === 'harmonie'
  const choice = hourlyPair ? tuning.harmonieTime : DEFAULT_RAIN_TIME_BLEND
  return {
    eased: choice === 'vloeiend',
    warpCapCells: choice === 'meebewegen' ? HOURLY_WARP_CAP_CELLS : WARP_CAP_CELLS,
    warpFadeEndCells: choice === 'meebewegen' ? HOURLY_WARP_FADE_END_CELLS : WARP_FADE_END_CELLS,
  }
}

type TuningStorage = Pick<Storage, 'getItem'>

export function loadRainFieldTuning(storage: TuningStorage = localStorage): RainFieldTuning {
  const stored = <Choice extends string>(key: string, choices: readonly Choice[], fallback: Choice): Choice => {
    const value = storage.getItem(key)
    return choices.includes(value as Choice) ? value as Choice : fallback
  }
  return {
    radar: stored(RAIN_FIELD_STORAGE_KEYS.radar, RAIN_SMOOTHINGS, DEFAULT_RAIN_SMOOTHING),
    harmonie: stored(RAIN_FIELD_STORAGE_KEYS.harmonie, RAIN_SMOOTHINGS, DEFAULT_RAIN_SMOOTHING),
    harmonieTime: stored(RAIN_FIELD_STORAGE_KEYS.harmonieTime, RAIN_TIME_BLENDS, DEFAULT_RAIN_TIME_BLEND),
  }
}
