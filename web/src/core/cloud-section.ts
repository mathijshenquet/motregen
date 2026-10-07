import type { TimelineFrame } from './contract'
import { seriesValueAt } from './time-model'

// Wolkendoorsnede in de scrubber (U37, hersteek U47/MIP-18): de bedekking van een laag wordt getekend als
// losse wolken met lucht ertussen, niet als doorzichtigheid; pas vanaf CLOSED_FRACTION sluit de laag.

export type CloudLayer = 'high' | 'mid' | 'low'
export const CLOUD_LAYERS: readonly CloudLayer[] = ['high', 'mid', 'low']

export interface CloudSeries {
  timeline: Record<CloudLayer, TimelineFrame[]>
  values: Record<CloudLayer, Array<number | null>>
}

/** Vanaf deze fractie is de laag een gesloten band. */
export const CLOSED_FRACTION = 0.9
// Onder deze fractie worden de wolken niet kleiner maar zeldzamer: een vak blijft dan soms leeg.
const SPARSE_FRACTION = 0.3
// Deel van de vrije ruimte in een vak dat minstens aan weerszijden van de wolk open blijft.
const SLOT_MARGIN = 0.25

export interface CloudSpan {
  /** Begin en eind van de wolk als deel van het vak, 0–1. */
  from: number
  to: number
  closed: boolean
}

/**
 * De tijdas is per laag in vakken verdeeld; elk vak draagt hoogstens één wolk. De verwachte bewolkte
 * lengte per vak is gelijk aan de fractie, zodat de gaten de bedekking eerlijk weergeven.
 */
export function cloudSpanInSlot(fraction: number, slot: number, layer: CloudLayer): CloudSpan | null {
  if (!(fraction > 0)) return null
  if (fraction >= CLOSED_FRACTION) return { from: 0, to: 1, closed: true }
  const occupancy = Math.min(1, fraction / SPARSE_FRACTION)
  if (unitHash(slot + LAYER_SEEDS[layer]) >= occupancy) return null
  const length = fraction / occupancy
  const free = 1 - length
  const from = free * (SLOT_MARGIN + (1 - 2 * SLOT_MARGIN) * unitHash(slot + LAYER_SEEDS[layer] + 0.37))
  return { from, to: from + length, closed: false }
}

// Deel van het licht dat een gesloten laag tegenhoudt (cirrus τ < 3,6; altostratus 3,6–23; stratus > 23,
// ISCCP; één gesloten lage laag laat ~25 % door, Kasten & Czeplak 1980). Alleen voor uren zonder straling.
const LAYER_BLOCKING: Record<CloudLayer, number> = { high: 0.25, mid: 0.6, low: 0.75 }
// Elke halvering van het licht telt even zwaar (Weber-Fechner); na zoveel halveringen is het "Mordor".
const DARKEST_HALVINGS = 3
// Zoveel halvering telt nog als mooi weer en kleurt niet grijs (PO 2026-10-07 live: een lekkere dag met
// sluierbewolking oogde blauwgrijs). 0,35 halvering ≈ 78 % van het licht.
const FAIR_HALVINGS = 0.35
// Deel van de schemergloed dat een loodgrijze lucht wegneemt.
const GLOW_DAMPING = 0.7

/** Geschatte lichtdoorlating (0–1) uit de bedekking per laag (fracties), voor nacht en verleden. */
export function layerTransmission(cover: Record<CloudLayer, number>): number {
  return CLOUD_LAYERS.reduce((light, layer) => light * (1 - LAYER_BLOCKING[layer] * Math.max(0, Math.min(1, cover[layer]))), 1)
}

/** Lichtfactor (CMF, 0–1) → donkerte 0–1 op een perceptuele (logaritmische) schaal; ook de dagtint van de tabel (U42). */
export function lightDarkness(light: number): number {
  if (!(light > 0)) return 1
  return Math.max(0, Math.min(1, -Math.log2(Math.min(1, light)) / DARKEST_HALVINGS))
}

/** Donkerte van de hemel en de wolken: dezelfde schaal, maar mooi weer blijft helder. */
export function skyDarkness(light: number): number {
  if (!(light > 0)) return 1
  return Math.max(0, Math.min(1, (-Math.log2(Math.min(1, light)) - FAIR_HALVINGS) / (DARKEST_HALVINGS - FAIR_HALVINGS)))
}

export interface SkyStop {
  /** Plaats op de tijdas, 0–1. */
  offset: number
  /** 0 = stralend, 1 = loodgrijs. */
  darkness: number
  /** 0 = nacht, 1 = dag; schemering ertussen. */
  daylight: number
  /** Gloed aan de horizon rond zonsop- en -ondergang, 0–1; een zwaar dek dooft hem. */
  glow: number
}

export interface SkyInputs {
  /** Bewolkingsfactor uit de straling, of null (nacht, geen data): dan schatten de lagen het licht. */
  lightAt: (epoch: number) => number | null
  coverAt: (epoch: number) => Record<CloudLayer, number>
  sinElevation: (epoch: number) => number
}

/** Het dagverloop van de lucht, per heel uur: voedt de hemelachtergrond en de tint van de wolken. */
export function skyStops(start: number, end: number, inputs: SkyInputs): SkyStop[] {
  const span = Math.max(1, end - start)
  // SVG klemt offsets buiten 0–1; daarom de randen zelf plus de hele uren ertussen.
  const epochs = [start]
  for (let epoch = Math.floor(start / HOUR) * HOUR + HOUR; epoch < end; epoch += HOUR) epochs.push(epoch)
  epochs.push(end)
  return epochs.map((epoch) => {
    const elevation = inputs.sinElevation(epoch)
    const twilight = Math.max(0, Math.min(1, (elevation + 0.1) / 0.2))
    const daylight = twilight * twilight * (3 - 2 * twilight)
    const darkness = skyDarkness(inputs.lightAt(epoch) ?? layerTransmission(inputs.coverAt(epoch)))
    return {
      offset: round((epoch - start) / span, 4),
      darkness: round(darkness, 3),
      daylight: round(daylight, 3),
      glow: round(4 * daylight * (1 - daylight) * (1 - GLOW_DAMPING * darkness), 3),
    }
  })
}

interface LayerStyle {
  /** Lengte van een vak in uren bij ruime tijdas; wordt opgerekt als de uren smal worden. */
  slotHours: number
  /** Grootste dikte als deel van de strook: van een gesloten band en van een losse wolk. */
  closedBody: number
  looseBody: number
  /** Een losse wolk is hoogstens lengte / aspect dik: cirrus blijft een veeg, een stapelwolk mag bol. */
  aspect: number
  /** Hoogte van de middellijn (of de vlakke basis van stapelwolken) in de strook, van boven gemeten. */
  baseline: number
  /**
   * Wolken zijn een rij overlappende bollen (stapelwolk: op een vlakke basis; midden: afgeplatte lenzen
   * rond de middellijn). `puffAspect` is de halve breedte van een bol als veelvoud van de wolkdikte;
   * `underside` de onderkant als deel van de bovenkant. Zonder bollen bestaat de wolk uit cirrusvegen.
   */
  puffs?: { puffAspect: number; underside: number }
}

const LAYER_STYLES: Record<CloudLayer, LayerStyle> = {
  // Maten naar de PO (2026-10-07 live): fysiek groot, zoals de doorsnede van vóór U47.
  high: { slotHours: 1.25, closedBody: 0.24, looseBody: 0.24, aspect: 7, baseline: 0.5 },
  mid: { slotHours: 1.75, closedBody: 0.74, looseBody: 0.6, aspect: 2.6, baseline: 0.64, puffs: { puffAspect: 0.8, underside: 0.3 } },
  // De basis ligt ruim boven de onderrand van het plot (PO 2026-10-07 live): onder de wolk blijft lucht,
  // anders valt de vlakke onderkant, het kenmerk van een stapelwolk, tegen de rand weg.
  low: { slotHours: 1, closedBody: 0.66, looseBody: 0.66, aspect: 1.7, baseline: 0.78, puffs: { puffAspect: 0.6, underside: 0 } },
}
const LAYER_SEEDS: Record<CloudLayer, number> = { high: 11.3, mid: 47.9, low: 83.1 }
const MIN_SLOT_PX = 44
const SAMPLE_PX = 1.5
const MIN_PUFF_RADIUS_PX = 4
// Afstand tussen bolcentra als veelvoud van de straal: groter geeft diepere dalen tussen de bollen.
const PUFF_SPACING = 1.35
// Laagste punt van een gesloten dek als deel van zijn dikte.
const CLOSED_BODY_FLOOR = 0.55
// Ook het kleinste wolkje houdt deze dikte (deel van de grootste), anders wordt het een streepje.
const MIN_LOOSE_THICKNESS = 0.35
// Cirrus: een wolk is een bundel dunne vegen die allemaal dezelfde kant op hellen (één wind).
const CIRRUS_STRAND_PITCH_PX = 30
const CIRRUS_STRAND_LENGTH_PX = 76
const CIRRUS_SLANT = 0.16
// Verticale spreiding van de vegen als deel van de strook.
const CIRRUS_SPREAD = 0.42
const HOUR = 3_600_000

export interface CloudBandGeometry {
  width: number
  /** Bovenkant en hoogte van de strook voor deze laag, in px. */
  top: number
  height: number
  start: number
  end: number
}

export interface CloudBand {
  /** Gesloten paden: één per losse wolk of aaneengesloten band. */
  paths: string[]
}

interface CloudExtent { from: number; to: number; closed: boolean }

/** Wolken van één laag op de tijdas (epoch-ms); aangrenzende gesloten vakken vormen één band. */
export function cloudExtents(frames: TimelineFrame[], values: Array<number | null>, layer: CloudLayer, start: number, end: number, slotMs: number): CloudExtent[] {
  const extents: CloudExtent[] = []
  let closedThroughSlot: number | undefined
  for (let slot = Math.floor(start / slotMs); slot * slotMs < end; slot++) {
    const slotStart = slot * slotMs
    const percent = seriesValueAt(frames, values, Math.max(start, Math.min(end, slotStart + slotMs / 2)), 30 * 60_000)
    const fraction = percent == null || !Number.isFinite(percent) ? 0 : Math.min(1, percent / 100)
    const span = cloudSpanInSlot(fraction, slot, layer)
    if (!span) continue
    if (span.closed && closedThroughSlot === slot - 1) extents.at(-1)!.to = slotStart + slotMs
    else extents.push({ from: slotStart + span.from * slotMs, to: slotStart + span.to * slotMs, closed: span.closed })
    if (span.closed) closedThroughSlot = slot
  }
  return extents
}

/** Omtrek van één vorm: hoogte boven en diepte onder de eigen middellijn op elk monsterpunt, in px. */
interface Outline { xs: number[]; up: number[]; down: number[]; centre: number[] }

// De omtrek van een wolk hangt alleen af van haar eigen vak en de maten van de strook. Een aanvulling van
// de reeks raakt een paar uren; de overige wolken komen uit deze cache in plaats van opnieuw bemonsterd te
// worden (PO-opname 2026-10-07: puffOutline + cirrusStrands ~0,9 s tijdens het laden).
const SHAPE_PATH_CACHE_LIMIT = 2_000
const shapePathCache = new Map<string, string[]>()

/** Tekent één laag als losse wolkvormen; de fractie per uur wordt lineair geïnterpoleerd naar de tijdas. */
export function cloudBand(frames: TimelineFrame[], values: Array<number | null>, layer: CloudLayer, geometry: CloudBandGeometry): CloudBand {
  const { width, top, height, start, end } = geometry
  const span = Math.max(1, end - start)
  const style = LAYER_STYLES[layer]
  const pxPerHour = width / (span / HOUR)
  const slotMs = Math.max(style.slotHours, MIN_SLOT_PX / pxPerHour) * HOUR
  const bottom = top + height
  const baseline = top + height * style.baseline
  const paths: string[] = []
  for (const cloud of cloudExtents(frames, values, layer, start, end, slotMs)) {
    const fromX = (cloud.from - start) / span * width
    const toX = (cloud.to - start) / span * width
    if (Math.min(width, toX) - Math.max(0, fromX) < 1) continue
    const largest = height * style.looseBody
    const thickness = cloud.closed ? height * style.closedBody : largest * Math.max(MIN_LOOSE_THICKNESS, Math.min(1, (toX - fromX) / (largest * style.aspect)))
    const shape = { fromX, toX, thickness, closed: cloud.closed, key: cloud.from / HOUR + LAYER_SEEDS[layer] }
    const cacheKey = `${layer}|${fromX}|${toX}|${thickness}|${cloud.closed}|${shape.key}|${width}|${top}|${height}`
    let shapePaths = shapePathCache.get(cacheKey)
    if (!shapePaths) {
      shapePaths = []
      const outlines = style.puffs ? [puffOutline(shape, width, style.puffs)] : cirrusStrands(shape, width, height * CIRRUS_SPREAD)
      for (const outline of outlines) {
        if (outline.xs.length < 2) continue
        const upper = outline.xs.map((x, index) => `${round(x)} ${round(Math.max(top, baseline + outline.centre[index]! - outline.up[index]!))}`)
        const lower = outline.xs.map((x, index) => `${round(x)} ${round(Math.min(bottom, baseline + outline.centre[index]! + outline.down[index]!))}`)
        shapePaths.push(`M${upper.join('L')}L${lower.reverse().join('L')}Z`)
      }
      if (shapePathCache.size >= SHAPE_PATH_CACHE_LIMIT) shapePathCache.clear()
      shapePathCache.set(cacheKey, shapePaths)
    }
    paths.push(...shapePaths)
  }
  return { paths }
}

/** Monsterpunten over [from, to], afgekapt op de tijdlijn [0, width]. */
function sampleXs(from: number, to: number, width: number): number[] {
  const left = Math.max(0, from)
  const right = Math.min(width, to)
  if (right - left < 1) return []
  const steps = Math.max(4, Math.ceil((right - left) / SAMPLE_PX))
  return Array.from({ length: steps + 1 }, (_, step) => left + (right - left) * step / steps)
}

interface CloudShape { fromX: number; toX: number; thickness: number; closed: boolean; key: number }

/** Rij overlappende bollen: de omtrek is de bovenrand van hun vereniging. */
function puffOutline(shape: CloudShape, width: number, puffs: { puffAspect: number; underside: number }): Outline {
  const xs = sampleXs(shape.fromX, shape.toX, width)
  const length = shape.toX - shape.fromX
  // Zonder onderkant staat de hele bol boven de basis; anders ligt hij half boven, half onder de middellijn.
  const reach = puffs.underside === 0 ? shape.thickness : shape.thickness / 2
  const nominalRadius = Math.min(length / 2, Math.max(MIN_PUFF_RADIUS_PX, shape.thickness * puffs.puffAspect))
  const count = Math.max(1, Math.round((length - 2 * nominalRadius) / (PUFF_SPACING * nominalRadius)) + 1)
  const up = xs.map(() => 0)
  const down = xs.map(() => 0)
  for (let index = 0; index < count; index++) {
    const along = count === 1 ? 0.5 : index / (count - 1)
    const radius = Math.min(length / 2, nominalRadius * (0.75 + 0.5 * unitHash(shape.key + index * 7.13)))
    const centre = shape.fromX + radius + (length - 2 * radius) * along
    // Een losse wolk is in het midden het hoogst; in een gesloten dek wisselen de bollen willekeurig.
    const crown = shape.closed || count === 1 ? 1 : 0.55 + 0.45 * Math.sin(Math.PI * along)
    const puffHeight = reach * crown * (0.6 + 0.4 * unitHash(shape.key + index * 7.13 + 0.61))
    xs.forEach((x, sample) => {
      const offset = (x - centre) / radius
      if (Math.abs(offset) >= 1) return
      const arc = Math.sqrt(1 - offset * offset)
      up[sample] = Math.max(up[sample]!, puffHeight * arc)
      down[sample] = Math.max(down[sample]!, puffHeight * puffs.underside * arc)
    })
  }
  if (shape.closed) {
    // Een gesloten dek heeft een doorlopend lijf: tussen kleine bollen mag geen gat tot op de basis vallen.
    xs.forEach((x, sample) => {
      const body = reach * CLOSED_BODY_FLOOR * roundedEnd(Math.min(x - shape.fromX, shape.toX - x) / reach)
      up[sample] = Math.max(up[sample]!, body)
      down[sample] = Math.max(down[sample]!, body * puffs.underside)
    })
  }
  return { xs, up, down, centre: xs.map(() => 0) }
}

/** Kwartcirkel van 0 naar 1 over het uiteinde van een vorm. */
function roundedEnd(t: number): number {
  if (t >= 1) return 1
  return Math.sqrt(Math.max(0, 1 - (1 - t) ** 2))
}

/** Cirrus: een bundel dunne, spitse vegen op wisselende hoogte; gesloten overlappen ze tot een sluier. */
function cirrusStrands(shape: CloudShape, width: number, spread: number): Outline[] {
  const length = shape.toX - shape.fromX
  const count = Math.max(1, Math.round(length / CIRRUS_STRAND_PITCH_PX))
  const strandLength = Math.min(length, CIRRUS_STRAND_LENGTH_PX)
  const strands: Outline[] = []
  for (let index = 0; index < count; index++) {
    const strandKey = shape.key + index * 3.71
    const from = shape.fromX + (length - strandLength) * (count === 1 ? 0.5 : index / (count - 1))
    const xs = sampleXs(from, from + strandLength, width)
    const offset = count === 1 ? 0 : (unitHash(strandKey) - 0.5) * spread
    const half = shape.thickness * (0.55 + 0.45 * unitHash(strandKey + 0.61)) / 2
    const along = xs.map((x) => (x - from) / strandLength)
    const profile = along.map((position) => half * Math.max(0, Math.sin(Math.PI * position)) ** 1.5)
    // De staart hangt lager dan de kop: de veeg helt naar rechts omhoog.
    strands.push({ xs, up: profile, down: profile, centre: along.map((position) => offset + strandLength * CIRRUS_SLANT * (0.5 - position)) })
  }
  return strands
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

/** Deterministische waarde in [0, 1) per (niet noodzakelijk gehele) sleutel. */
function unitHash(key: number): number {
  const s = Math.sin(key * 127.1 + 311.7) * 43_758.5453
  return s - Math.floor(s)
}

/** De lucht op een plek op de tijdas (0–1), lineair tussen de uurstops. */
export function skyAt(stops: SkyStop[], offset: number): SkyStop {
  const next = stops.findIndex((stop) => stop.offset >= offset)
  if (next <= 0) return stops[next === 0 ? 0 : stops.length - 1] ?? { offset, darkness: 0, daylight: 1, glow: 0 }
  const from = stops[next - 1]!
  const to = stops[next]!
  const mix = (offset - from.offset) / Math.max(1e-9, to.offset - from.offset)
  const between = (left: number, right: number) => left + (right - left) * mix
  return { offset, darkness: between(from.darkness, to.darkness), daylight: between(from.daylight, to.daylight), glow: between(from.glow, to.glow) }
}

// Penseelstreken over de lucht (U47, PO: "te gradient, meer grain en detail"): rijen spitse vegen die het
// verloop breken. Dun, lang en zacht: textuur, geen vormen die met de wolken concurreren (PO: "te druk").
// Een kalme lucht krijgt vlakke streken, een zware lucht licht golvende.
const STROKE_ROW_PX = 13
const STROKE_SAMPLE_PX = 3
// Golflengte van een streek als veelvoud van de rijhoogte: korter wordt een zaagtand in plaats van een veeg.
const STROKE_WAVELENGTH_ROWS = 7
const STROKE_SEED = 5.7

export interface SkyStroke {
  path: string
  /** Lichter (true) of donkerder dan de lucht eronder, en hoe sterk (0–1). */
  light: boolean
  strength: number
}

export function skyStrokes(width: number, height: number, pxPerHour: number, stops: SkyStop[]): SkyStroke[] {
  if (!stops.length || width <= 0 || height <= 0) return []
  const rows = Math.max(3, Math.round(height / STROKE_ROW_PX))
  const rowHeight = height / rows
  const strokes: SkyStroke[] = []
  for (let row = 0; row < rows; row++) {
    let from = -pxPerHour * unitHash(row * 3.3 + STROKE_SEED)
    for (let index = 0; from < width; index++) {
      const key = row * 101.3 + index * 7.77 + STROKE_SEED
      const here = skyAt(stops, Math.max(0, Math.min(1, (from + pxPerHour / 2) / width)))
      const turbulence = here.darkness
      const length = Math.max(rowHeight * 5, pxPerHour * (1.4 + 1.8 * unitHash(key)))
      const centreY = (row + 0.5) * rowHeight + (unitHash(key + 0.21) - 0.5) * rowHeight * 0.6
      const half = rowHeight * (0.08 + 0.16 * unitHash(key + 0.43))
      const wave = rowHeight * (0.05 + 0.22 * turbulence)
      const waves = length / (rowHeight * STROKE_WAVELENGTH_ROWS) * (0.7 + 0.6 * unitHash(key + 0.65))
      const phase = 2 * Math.PI * unitHash(key + 0.87)
      const steps = Math.max(4, Math.ceil(length / STROKE_SAMPLE_PX))
      const upper: string[] = []
      const lower: string[] = []
      for (let step = 0; step <= steps; step++) {
        const along = step / steps
        const middle = centreY + wave * Math.sin(2 * Math.PI * waves * along + phase)
        const thickness = half * Math.max(0, Math.sin(Math.PI * along)) ** 0.7
        upper.push(`${round(from + length * along)} ${round(middle - thickness)}`)
        lower.push(`${round(from + length * along)} ${round(middle + thickness)}`)
      }
      const tone = unitHash(key + 0.99) * 2 - 1
      from += length * 0.6
      // Alleen overdag (PO 2026-10-07 live): de nacht is van de sterren.
      if (here.daylight < 0.05) continue
      strokes.push({ path: `M${upper.join('L')}L${lower.reverse().join('L')}Z`, light: tone > 0, strength: round(Math.abs(tone) * here.daylight, 3) })
    }
  }
  return strokes
}

const STARS_PER_HOUR = 5
const STAR_TWILIGHT_LIMIT = 0.12

export interface SkyStar { x: number; y: number; radius: number; brightness: number }

/** Sterren in een heldere nacht; bewolking en daglicht doven ze. */
export function skyStars(width: number, height: number, pxPerHour: number, stops: SkyStop[]): SkyStar[] {
  if (!stops.length) return []
  const stars: SkyStar[] = []
  for (let index = 0; index * pxPerHour / STARS_PER_HOUR < width; index++) {
    const x = (index + unitHash(index * 1.37 + 2.9)) * pxPerHour / STARS_PER_HOUR
    const sky = skyAt(stops, Math.min(1, x / width))
    // Pas als de schemering vrijwel voorbij is: geen sterren in de gloed van de zonsondergang.
    const visibility = Math.max(0, 1 - sky.daylight / STAR_TWILIGHT_LIMIT) * (1 - sky.darkness) ** 2
    const twinkle = unitHash(index * 2.11 + 8.3)
    if (twinkle > visibility) continue
    stars.push({ x: round(x), y: round(height * 0.72 * unitHash(index * 3.03 + 4.1)), radius: round(0.5 + 0.9 * unitHash(index * 4.7 + 1.9), 2), brightness: round(0.45 + 0.55 * (1 - twinkle), 2) })
  }
  return stars
}

/** Momenten waarop de zon door de horizon gaat, voor de gloed bij zonsop- en -ondergang. */
export function sunCrossings(start: number, end: number, sinElevation: (epoch: number) => number): Array<{ epoch: number; rising: boolean }> {
  const step = 10 * 60_000
  const crossings: Array<{ epoch: number; rising: boolean }> = []
  let previous = sinElevation(start)
  for (let epoch = start + step; epoch <= end; epoch += step) {
    const current = sinElevation(epoch)
    if ((previous <= 0) !== (current <= 0)) crossings.push({ epoch: epoch - step + step * previous / (previous - current), rising: current > 0 })
    previous = current
  }
  return crossings
}
