import type { TimelineFrame } from './contract'
import { seriesValueAt } from './time-model'

// Wolkendoorsnede in de scrubber (U37, weermodus; PO-keuze variant A): per laag een zachte, licht
// gerafelde vorm waarvan dikte en dekking de bewolkingsfractie volgen.

export type CloudLayer = 'high' | 'mid' | 'low'
export const CLOUD_LAYERS: readonly CloudLayer[] = ['high', 'mid', 'low']

export interface CloudSeries {
  timeline: Record<CloudLayer, TimelineFrame[]>
  values: Record<CloudLayer, Array<number | null>>
}

export interface CloudDrawParams {
  /** Dekking van de vulling, 0–1. */
  opacity: number
  /** Dikte als deel van de laaghoogte, 0–1. */
  thickness: number
  /** Rafeligheid van de rand als deel van de dikte: gebroken bewolking rafelt het meest. */
  ragged: number
}

/** Fractie in procent → tekenparameters; 0 % of geen data tekent niets. */
export function cloudDrawParams(percent: number | null | undefined): CloudDrawParams {
  const fraction = percent == null || !Number.isFinite(percent) ? 0 : Math.max(0, Math.min(1, percent / 100))
  if (fraction === 0) return { opacity: 0, thickness: 0, ragged: 0 }
  return {
    opacity: 0.9 * fraction,
    // Ook een sliertje blijft zichtbaar; de wortel laat halfbewolkt al ruim ogen.
    thickness: 0.18 + 0.82 * Math.sqrt(fraction),
    ragged: 4 * fraction * (1 - fraction),
  }
}

interface LayerStyle {
  /** Bulten per uur bij ruime tijdas; wordt teruggeschaald als de uren smal worden. */
  bumpsPerHour: number
  /** Dikte bij volle bewolking als deel van de strook. */
  body: number
  /** Randuitslag als deel van de halve dikte, boven en onder. */
  top: number
  base: number
  /** Stapelwolk: bolle toppen op een vlakke basis. Anders een sliert/deken met ruisranden. */
  puffy: boolean
}

// Laag = stapelwolken (bolle toppen, vlakke basis), midden = deken, hoog = dunne cirrussliert.
const LAYER_STYLES: Record<CloudLayer, LayerStyle> = {
  high: { bumpsPerHour: 3, body: 0.6, top: 0.45, base: 0.45, puffy: false },
  mid: { bumpsPerHour: 2, body: 0.8, top: 0.3, base: 0.2, puffy: false },
  low: { bumpsPerHour: 1.25, body: 0.8, top: 0.5, base: 0.05, puffy: true },
}
const LAYER_SEEDS: Record<CloudLayer, number> = { high: 11.3, mid: 47.9, low: 83.1 }
// Kleiner dan dit wordt de rand korrelig in plaats van rafelig.
const MIN_BUMP_PX = 9
const SAMPLE_PX = 3

export interface CloudBandGeometry {
  width: number
  /** Bovenkant en hoogte van de strook voor deze laag, in px. */
  top: number
  height: number
  start: number
  end: number
}

export interface CloudBand {
  /** Gesloten paden, één per aaneengesloten bewolkt stuk. */
  paths: string[]
  /** Horizontaal verloop van de dekking (offset 0–1 over de breedte). */
  stops: Array<{ offset: number; opacity: number }>
}

/** Tekent één laag: de fractie per uur wordt lineair geïnterpoleerd naar de x-as. */
export function cloudBand(frames: TimelineFrame[], values: Array<number | null>, layer: CloudLayer, geometry: CloudBandGeometry): CloudBand {
  const { width, top, height, start, end } = geometry
  const span = Math.max(1, end - start)
  const percentAt = (epoch: number) => seriesValueAt(frames, values, epoch, 30 * 60_000)
  const style = LAYER_STYLES[layer]
  const pxPerHour = width / (span / 3_600_000)
  const bumpsPerHour = Math.min(style.bumpsPerHour, pxPerHour / MIN_BUMP_PX)
  const centre = top + height / 2
  const steps = Math.max(2, Math.ceil(width / SAMPLE_PX))
  const paths: string[] = []
  let upper: string[] = []
  let lower: string[] = []
  const flush = () => {
    if (upper.length > 1) paths.push(`M${upper.join('L')}L${lower.reverse().join('L')}Z`)
    upper = []
    lower = []
  }
  for (let step = 0; step <= steps; step++) {
    const x = width * step / steps
    const epoch = start + span * step / steps
    const params = cloudDrawParams(percentAt(epoch))
    if (params.thickness === 0) { flush(); continue }
    const half = height / 2 * style.body * params.thickness
    const phase = epoch / 3_600_000 * bumpsPerHour + LAYER_SEEDS[layer]
    const fray = 0.5 + params.ragged
    // Een bolle top per bult, met wisselende hoogte; de basis blijft vrijwel vlak.
    const topShape = style.puffy ? scallop(phase) * (0.75 + 0.25 * valueNoise(phase * 0.5)) * 2 - 1 : valueNoise(phase)
    const upperY = centre - half * (1 + style.top * fray * topShape)
    const lowerY = centre + half * (1 + style.base * fray * valueNoise(phase * 1.3 + 101.7))
    upper.push(`${round(x)} ${round(Math.max(top, upperY))}`)
    lower.push(`${round(x)} ${round(Math.min(top + height, lowerY))}`)
  }
  flush()
  const hour = 3_600_000
  // SVG klemt offsets buiten 0–1; daarom de randen zelf plus de hele uren ertussen.
  const epochs = [start]
  for (let epoch = Math.floor(start / hour) * hour + hour; epoch < end; epoch += hour) if (epoch > start) epochs.push(epoch)
  epochs.push(end)
  const stops = epochs.map((epoch) => ({ offset: round((epoch - start) / span, 4), opacity: round(cloudDrawParams(percentAt(epoch)).opacity, 3) }))
  return { paths, stops }
}

function scallop(phase: number): number {
  const t = phase - Math.floor(phase)
  return Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2))
}

/** Gladde 1D-ruis in [−1, 1], deterministisch (zelfde vorm bij elke render). */
export function valueNoise(x: number): number {
  const cell = Math.floor(x)
  const t = x - cell
  const eased = t * t * (3 - 2 * t)
  return lattice(cell) + (lattice(cell + 1) - lattice(cell)) * eased
}

function lattice(cell: number): number {
  const s = Math.sin(cell * 127.1 + 311.7) * 43_758.5453
  return (s - Math.floor(s)) * 2 - 1
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
