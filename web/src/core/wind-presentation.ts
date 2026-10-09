import type { MapTheme } from './map-theme.js'

export const WIND_PARTICLES_PER_MEGAPIXEL = 620
export const WIND_REFERENCE_ZOOM = 6.4
// v3 (U20): alleen afwijkingen van de default worden bewaard. v4 (U30/MIP-12): alleen de vier
// knoppen van WindTuning; v3 wordt eenmalig gemigreerd, de rest van v3 (nu constanten) valt weg.
export const WIND_TUNING_STORAGE_KEY = 'motregen-wind-tuning-v4'
export const LEGACY_WIND_TUNING_STORAGE_KEY = 'motregen-wind-tuning-v3'

// De staart ontstaat in een trailbuffer die per seconde vervaagt; de particle
// zelf stempelt alleen zijn kop. Leven en fades zijn schermafstanden (CSS-px),
// zodat snelheid tempo wordt en niet de hoeveelheid inkt per particle.
// lineWidth is sinds U34 in CSS-px, net als de rest: in device-px (U3) was hij op een retina-scherm
// half zo dik als op een 1×-monitor (PO 2026-09-25 live). Smalle schermen (telefoon) krijgen
// `narrowLineFactor`, zodat mobiel fijn blijft zoals de PO het in U3 wilde.
export interface WindParameters {
  particlesPerMegapixel: number
  trailDistance: number
  fadeInPx: number
  fadeOutPx: number
  maxAge: number
  spawnJitter: number
  speedDamping: number
  bufferFade: number
  bufferDpr: number
  headIntensity: number
  lineWidth: number
  speed: number
  intensity: number
  visibility: number
  /** Bovengrens voor wind-, regen- en afspeelframes (120 Hz-schermen tekenen anders alles dubbel). */
  maxFps: number
  /** Deel van de kopsterkte dat boven water wegvalt (0 = zee even sterk als land). */
  seaPenalty: number
  /** Lijnbreedte op een smal scherm als deel van `lineWidth`. */
  narrowLineFactor: number
}

/**
 * Alle windparameters. Instelbaar (?dev, JSON-export) zijn alleen Dichtheid, Intensiteit,
 * Lijnbreedte en Tempo; de rest is sinds U30 constant op de waarde van U3–U24.
 * `visibility` zet App per frame voor de focusdemping (vroeger ook de knop Contrast).
 */
export const WIND_PARAMETERS: WindParameters = {
  particlesPerMegapixel: WIND_PARTICLES_PER_MEGAPIXEL,
  trailDistance: 90, // Afstand per leven (U3/U3b)
  fadeInPx: 15, // Fade-in (U3b)
  fadeOutPx: 30, // Fade-out (U3b)
  maxAge: 6, // Max. leeftijd (U3)
  spawnJitter: 0.6, // Spawn-jitter (U3b)
  speedDamping: 1, // Snelheidsdemping; PO 2026-09-25 live (U34): zee rustiger, was 0,7 (U3b)
  // 0,955 per frame bij 60 Hz, de fade van vóór U3.
  bufferFade: 0.063,
  // Buffer nooit fijner dan 2 device-px per CSS-px: op een Pixel 5 (DPR 2,75) kostten fade +
  // composite op volle resolutie ~1 s warme TTFR in de 4G-gate. 1,5 (U3b) gaf een 2×-Mac een
  // 0,75×-buffer die LINEAR opgeschaald korrelig/zacht oogt (U24).
  bufferDpr: 2,
  headIntensity: 0.95, // Kopintensiteit (U3b)
  lineWidth: 2.5,
  speed: 1,
  // PO 2026-09-25 live (U34): default subtieler dan U24 (0,75); windfocus (U19) tweent naar
  // WIND_FOCUS_INTENSITY.
  intensity: 0.5,
  visibility: 1, // Contrast (U3); App vermenigvuldigt met de focusdemping
  maxFps: 60, // Max. fps (U8c)
  // PO 2026-09-25 live (U34): koppen boven water (de `water`-laag van de basemap) een derde zachter.
  seaPenalty: 0.33,
  // Onder NARROW_VIEWPORT_PX is de lijn dunner; 0,6 × 2,5 = 1,5 CSS-px.
  narrowLineFactor: 0.6,
}

/**
 * Windstreepjes op een telefoon of smal scherm (U62). De PO vond ze daar te subtiel, vooral boven zee, en
 * koos uit drie beproefde niveaus het middelste, "iets" (2026-10-08); het zwaardere was 1,5× sterkte,
 * lijnfactor 0,84, zee-demping 0,08. Alleen breedte, sterkte en zee-demping; het aantal streepjes en dus
 * het tekenwerk is gelijk.
 */
export const MOBILE_WIND = { intensityGain: 1.25, narrowLineFactor: 0.72, seaPenalty: 0.2 } as const

export type WindTuning = Pick<WindParameters, 'particlesPerMegapixel' | 'intensity' | 'lineWidth' | 'speed'>

export const DEFAULT_WIND_TUNING: WindTuning = {
  particlesPerMegapixel: WIND_PARAMETERS.particlesPerMegapixel,
  intensity: WIND_PARAMETERS.intensity,
  lineWidth: WIND_PARAMETERS.lineWidth,
  speed: WIND_PARAMETERS.speed,
}

/** Bovengrens voor wind-, regen-, isolijn- en afspeelframes (Max. fps; knop weg in U30). */
export const WIND_MAX_FPS = WIND_PARAMETERS.maxFps

/** Intensiteit bij volle windfocus met de default-tuning (PO 2026-09-25 live, U34; was 1,905). */
export const WIND_FOCUS_INTENSITY = 0.8



export function advanceLife(life: ParticleLife, stepPx: number, seconds: number, tuning: Pick<WindParameters, 'maxAge'>): boolean {
  life.age += seconds
  if (life.age <= 0) {
    life.remaining = life.distance
    return true
  }
  life.travelled += stepPx
  const speed = seconds > 0 ? stepPx / seconds : 0
  life.remaining = Math.min(life.distance - life.travelled, speed * Math.max(0, tuning.maxAge - life.age))
  return life.remaining > 0
}

export function headAlpha(life: ParticleLife, tuning: Pick<WindParameters, 'fadeInPx' | 'fadeOutPx'>): number {
  if (life.age <= 0 || life.remaining <= 0) return 0
  const fadeIn = tuning.fadeInPx > 0 ? Math.min(1, life.travelled / tuning.fadeInPx) : 1
  const fadeOut = tuning.fadeOutPx > 0 ? Math.min(1, life.remaining / tuning.fadeOutPx) : 1
  return smooth(fadeIn) * smooth(fadeOut)
}

export function expectedLifetime(speedPx: number, tuning: Pick<WindParameters, 'trailDistance' | 'maxAge'>): number {
  return speedPx > 0 ? Math.min(tuning.maxAge, tuning.trailDistance / speedPx) : tuning.maxAge
}

export function weakWindTempo(windSpeed: number): number {
  return windSpeed >= WEAK_WIND_SPEED ? 1 : Math.min(WEAK_WIND_MAX_BOOST, Math.sqrt(WEAK_WIND_SPEED / Math.max(1e-3, windSpeed)))
}

export function speedDamping(windSpeed: number, gamma: number): number {
  return windSpeed > DAMPING_REFERENCE_SPEED ? (DAMPING_REFERENCE_SPEED / windSpeed) ** gamma : 1
}

export function bufferDecay(restPerSecond: number, seconds: number): number {
  return Math.max(0, restPerSecond) ** Math.max(0, seconds)
}

export function windColor(speed: number, theme: MapTheme): [number, number, number] {
  const color = new Float32Array(3)
  setWindColor(speed, theme, color)
  return [color[0]!, color[1]!, color[2]!]
}

export function windScreenSpeed(windSpeed: number, speedScale = 1): number {
  return windSpeed * ADVECTION_SCALE * speedScale * MERCATOR_SCALE * WORLD_TILE_SIZE * 2 ** WIND_REFERENCE_ZOOM
}

export function particleCountForViewport(width: number, height: number, particlesPerMegapixel = WIND_PARTICLES_PER_MEGAPIXEL): number {
  const count = Math.round(Math.max(0, width) * Math.max(0, height) / 1_000_000 * particlesPerMegapixel)
  return Math.max(MIN_PARTICLES, Math.min(MAX_PARTICLES, count))
}

export function windZoomCompensation(zoom: number): number {
  return 2 ** (WIND_REFERENCE_ZOOM - zoom)
}

export function smooth(value: number): number {
  return value * value * (3 - 2 * value)
}

export function setWindColor(speed: number, theme: MapTheme, color: Float32Array): void {
  let upper = 1
  while (upper < BEAUFORT_STOPS.length - 1 && speed > BEAUFORT_STOPS[upper]!) upper++
  const lowerSpeed = BEAUFORT_STOPS[upper - 1]!
  const upperSpeed = BEAUFORT_STOPS[upper]!
  const mix = Math.max(0, Math.min(1, (speed - lowerSpeed) / (upperSpeed - lowerSpeed)))
  const ramp = theme === 'dark' ? DARK_RAMP : LIGHT_RAMP
  const left = ramp[upper - 1]!
  const right = ramp[upper]!
  color[0] = (left[0] + (right[0] - left[0]) * mix) / 255
  color[1] = (left[1] + (right[1] - left[1]) * mix) / 255
  color[2] = (left[2] + (right[2] - left[2]) * mix) / 255
}

export const MIN_PARTICLES = 96


export const MAX_PARTICLES = 2_400


export const ADVECTION_SCALE = 7_000


export const WORLD_TILE_SIZE = 512


export const DAMPING_REFERENCE_SPEED = 3


export const WEAK_WIND_SPEED = 6


export const WEAK_WIND_MAX_BOOST = 2.5


export const MERCATOR_SCALE = 1 / (2 * Math.PI * 6_378_137)


export const BEAUFORT_STOPS = [0, 3.4, 8, 13.9, 20.8, 32.7] as const


export const LIGHT_RAMP = [
  [3, 48, 102], [0, 76, 108], [9, 91, 44], [119, 73, 0], [162, 39, 8], [108, 15, 73],
] as const


export const DARK_RAMP = [
  [255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255],
] as const


export interface ParticleLife {
  age: number
  travelled: number
  distance: number
  remaining: number
}
