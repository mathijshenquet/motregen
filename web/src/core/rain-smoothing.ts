import type { Source } from './contract'
import { WARP_CAP_CELLS, WARP_FADE_END_CELLS, type RainKernel, type RainSampling, type RainWarpLimit } from './rain-layer'

// Hoe het regenveld tussen de cellen wordt ingevuld. `auto` is het product (PO 2026-10-09, U72); de overige
// standen zijn de dev-override onder ?dev (Kaart › Regenveld).
export const RAIN_SMOOTHINGS = ['auto', 'blokken', 'bilineair', 'bronlineair', 'glad', 'blur 3×3', 'blur 5×5', 'blur 7×7', 'blur 9×9'] as const
export type RainSmoothing = typeof RAIN_SMOOTHINGS[number]
export const DEFAULT_RAIN_SMOOTHING: RainSmoothing = 'auto'

export type RainSourceGroup = 'radar' | 'harmonie'

export interface RainFieldTuning {
  radar: RainSmoothing
  harmonie: RainSmoothing
}

export const DEFAULT_RAIN_FIELD_TUNING: RainFieldTuning = {
  radar: DEFAULT_RAIN_SMOOTHING,
  harmonie: DEFAULT_RAIN_SMOOTHING,
}

export const RAIN_FIELD_STORAGE_KEYS: Record<keyof RainFieldTuning, string> = {
  radar: 'motregen-dev-regenveld-radar',
  harmonie: 'motregen-dev-regenveld-harmonie',
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

/** Sigma (in broncellen) van de stand "blur N×N": de maat waarop de PO de standen heeft beoordeeld. */
export function blurSigma(size: number): number {
  return 0.19 * size
}

const FIXED_SAMPLINGS: Record<Exclude<RainSmoothing, 'auto'>, { kernel: RainKernel; blurSigma?: number }> = {
  'blokken': { kernel: 'nearest' },
  'bilineair': { kernel: 'bilinear' },
  'bronlineair': { kernel: 'source-linear' },
  'glad': { kernel: 'source-cubic' },
  'blur 3×3': { kernel: 'source-blur', blurSigma: blurSigma(3) },
  'blur 5×5': { kernel: 'source-blur', blurSigma: blurSigma(5) },
  'blur 7×7': { kernel: 'source-blur', blurSigma: blurSigma(7) },
  'blur 9×9': { kernel: 'source-blur', blurSigma: blurSigma(9) },
}

// PO 2026-10-09: "blur 5 tot +2 uur, vanaf daar 9". De straal volgt hoe ver het frame vooruit ligt, niet de
// bron. Een harde wissel zou tijdens afspelen als stap te zien zijn, dus sigma loopt over een uur lineair op.
const NEAR_BLUR_SIZE = 5
const FAR_BLUR_SIZE = 9
const NEAR_BLUR_UNTIL_MS = 2 * 3_600_000
const FAR_BLUR_FROM_MS = 3 * 3_600_000

/** Sigma (in broncellen) van de automatische vervaging voor een frame dat `leadMs` na nu ligt. */
export function autoBlurSigma(leadMs: number): number {
  const progress = Math.max(0, Math.min(1, (leadMs - NEAR_BLUR_UNTIL_MS) / (FAR_BLUR_FROM_MS - NEAR_BLUR_UNTIL_MS)))
  return blurSigma(NEAR_BLUR_SIZE) + (blurSigma(FAR_BLUR_SIZE) - blurSigma(NEAR_BLUR_SIZE)) * progress
}

/** `leadMs`: de tijd van het frame ten opzichte van nu (negatief = verleden). */
export function rainSampling(source: Source, leadMs: number, tuning: RainFieldTuning): RainSampling {
  const group = rainSourceGroup(source)
  const choice = tuning[group]
  const sampling = choice === 'auto' ? { kernel: 'source-blur' as const, blurSigma: autoBlurSigma(leadMs) } : FIXED_SAMPLINGS[choice]
  return { ...sampling, sourceCellWidth: SOURCE_CELL_WIDTH[group] }
}

// Bij uurframes verplaatst een bui zich tientallen cellen; de gewone kap (15 cellen, voor 5-minutenframes) zou
// het meebewegen dan uitzetten en een kruisfade overlaten, waarin de buikern halverwege het uur inzakt. Voor een
// lange stap ligt de kap daarom ruim boven een stormachtig uur (~80 cellen bij 50 km/u). PO 2026-10-09:
// "meebewegen in AROME is veel beter dan de crossfade".
const LONG_STEP_WARP_LIMIT: RainWarpLimit = { capCells: 120, fadeEndCells: 240 }
const DEFAULT_WARP_LIMIT: RainWarpLimit = { capCells: WARP_CAP_CELLS, fadeEndCells: WARP_FADE_END_CELLS }
const LONG_STEP_FROM_MINUTES = 30

/**
 * De kap volgt de lengte van de stap, niet de bronnen: het paar dat de overgang van de blend naar HARMONIE
 * overspant is ~55 minuten lang en viel met een bronregel terug op een kruisfade van bijna een uur.
 */
export function rainWarpLimit(intervalMinutes: number): RainWarpLimit {
  return intervalMinutes >= LONG_STEP_FROM_MINUTES ? LONG_STEP_WARP_LIMIT : DEFAULT_WARP_LIMIT
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
  }
}
