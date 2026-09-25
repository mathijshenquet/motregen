import type { MapTheme } from './basemap'
import type { Grid } from './contract'

export const ISOLINE_STEPS = [1, 2, 5] as const
export type IsolineStep = typeof ISOLINE_STEPS[number]

export interface IsolineTuning {
  step: IsolineStep
  /** Vulling als vlakke banden (default) of continu verloop; PO-optie, eigenaar U25b/U30. */
  fillStyle: IsolineFillStyle
  /** Lijnen en vulling vervagen waar het veld vlak is (|∇T| klein). */
  fade: IsolineFade
}

export const ISOLINE_FILL_STYLES = ['banden', 'verloop'] as const
export type IsolineFillStyle = typeof ISOLINE_FILL_STYLES[number]

export const ISOLINE_FADES = ['uit', 'gradiënt'] as const
export type IsolineFade = typeof ISOLINE_FADES[number]

// Gradiënt-fade uit (PO 2026-09-24: in vlak gebied verdwijnen hele lijnen); de lusjes gaan via ISOLINE_RING_KM.
/** Temperatuur (gevoelstemperatuur, temperatuurfocus) of luchtdruk (isobaren, windfocus; U35). */
// 'cloud' (U34): bewolkingssluier, alleen vulling; geen lijnen of labels.
export type IsolineKind = 'temperature' | 'pressure' | 'cloud'
export const ISOBAR_STEP_HPA = 4

export const DEFAULT_ISOLINE_TUNING: IsolineTuning = { step: 1, fillStyle: 'banden', fade: 'uit' }

// Vaste waarden van weggesnoeide dev-knoppen (U30/MIP-12); herkomst per regel.
/** Dekking van de vulling tussen de lijnen (Vulling; PO-keuze 2026-09-25 na U25b, main `5fcd35b`). */
export const ISOLINE_FILL_OPACITY = 0.35
/** Veldblur: 3×3-boxblur-passes per uurframe, 2 ≈ Gauss σ 1,2 cel (U8). */
export const ISOLINE_BLUR = 2
/** Tijdvenster: kubische B-spline over vier uurframes, C2 in de tijd (U8b; lineair = 0 verloor). */
export const ISOLINE_WINDOW = 1
/** Resolutie van de vulsnede t.o.v. het canvas (U8c). */
export const ISOLINE_FILL_RESOLUTION = 0.5
/** Lusjes: gesloten lijnen korter dan dit (km) vervagen, ook hun label (U13). */
export const ISOLINE_RING_KM = 60
/** Verdichting: maximale afwijking koorde ↔ lijn in CSS-px (U13). */
export const ISOLINE_TOLERANCE_PX = 0.25
/** smoothstep-grenzen voor |∇T| in °C/km bij Vervagen = gradiënt; U8c-kalibratie (lijnpixels p10/p50/p90 = 0,02/0,08/0,17). */
export const ISOLINE_GRADIENT: [number, number] = [0.02, 0.06]

/** Punten in roosterindex-coördinaten: (kolom, rij) van de celcentra. */
export interface Isoline {
  level: number
  closed: boolean
  points: Array<[number, number]>
}

export interface ScalarField {
  width: number
  height: number
  values: Float32Array
}

const MIN_LENGTH_CELLS = 2
// Gesloten ringetjes korter dan dit (in cellen) zijn kwantisatieruis, geen weer.
const MIN_RING_CELLS = 8
const CHAIKIN_ITERATIONS = 2

export interface WeightedFrame {
  data: Uint8Array
  quant: Array<number | null>
  weight: number
}

/** Gewogen som van gekwantiseerde frames; no-data in één frame met gewicht > 0 geeft no-data. */
export function blendFrames(frames: WeightedFrame[], width: number, height: number): ScalarField {
  const values = new Float32Array(width * height)
  const total = frames.reduce((sum, frame) => sum + frame.weight, 0)
  for (let index = 0; index < values.length; index++) {
    let sum = 0
    for (const frame of frames) {
      const value = frame.quant[frame.data[index]!]
      if (value == null) { sum = Number.NaN; break }
      sum += value * frame.weight
    }
    values[index] = sum / total
  }
  return { width, height, values }
}

export interface FrameWeight {
  index: number
  weight: number
}

function cubicBSpline(x: number): number {
  const a = Math.abs(x)
  if (a < 1) return (4 - 6 * a * a + 3 * a * a * a) / 6
  if (a < 2) return (2 - a) ** 3 / 6
  return 0
}

/**
 * Tijdgewichten voor `epoch`. `window` 0 is de lineaire blend tussen de twee buurframes (C0:
 * een knik op elk frame). Daarboven een kubische B-spline-kern met schaal `window` × het
 * frame-interval: C2 in de tijd, dus de lijnen veranderen niet per frame van richting, ten
 * koste van wat demping van pieken (niet-interpolerend). Genormaliseerd, ook aan de randen.
 */
export function temporalWeights(epochs: readonly number[], epoch: number, window: number): FrameWeight[] {
  if (!epochs.length || !Number.isFinite(epoch)) return []
  const last = epochs.length - 1
  if (window <= 0 || epochs.length < 2) {
    if (epoch <= epochs[0]!) return [{ index: 0, weight: 1 }]
    if (epoch >= epochs[last]!) return [{ index: last, weight: 1 }]
    let right = 1
    while (epochs[right]! < epoch) right++
    const mix = (epoch - epochs[right - 1]!) / (epochs[right]! - epochs[right - 1]!)
    return mix === 1 ? [{ index: right, weight: 1 }] : [{ index: right - 1, weight: 1 - mix }, { index: right, weight: mix }]
  }
  const interval = (epochs[last]! - epochs[0]!) / last
  const scale = window * interval
  const weights: FrameWeight[] = []
  let total = 0
  for (let index = 0; index < epochs.length; index++) {
    const weight = cubicBSpline((epoch - epochs[index]!) / scale)
    if (weight <= 1e-6) continue
    weights.push({ index, weight })
    total += weight
  }
  if (!total) return [{ index: epoch < epochs[0]! ? 0 : last, weight: 1 }]
  for (const entry of weights) entry.weight /= total
  return weights
}

/**
 * Separabele boxblur die no-data respecteert: een cel met waarde wordt het gemiddelde van
 * zijn geldige buren, een no-data-cel blijft no-data (de kustlijn van het veld schuift niet).
 */
export function blurField(field: ScalarField, passes: number): ScalarField {
  const { width, height } = field
  let current = field.values
  for (let pass = 0; pass < passes; pass++) {
    const horizontal = new Float32Array(current.length)
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        const index = row * width + column
        if (Number.isNaN(current[index]!)) { horizontal[index] = Number.NaN; continue }
        let sum = 0, count = 0
        for (let offset = -1; offset <= 1; offset++) {
          const neighbour = column + offset
          if (neighbour < 0 || neighbour >= width) continue
          const value = current[index + offset]!
          if (!Number.isNaN(value)) { sum += value; count++ }
        }
        horizontal[index] = sum / count
      }
    }
    const vertical = new Float32Array(current.length)
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        const index = row * width + column
        if (Number.isNaN(horizontal[index]!)) { vertical[index] = Number.NaN; continue }
        let sum = 0, count = 0
        for (let offset = -1; offset <= 1; offset++) {
          const neighbour = row + offset
          if (neighbour < 0 || neighbour >= height) continue
          const value = horizontal[index + offset * width]!
          if (!Number.isNaN(value)) { sum += value; count++ }
        }
        vertical[index] = sum / count
      }
    }
    current = vertical
  }
  return { width, height, values: current }
}

export function isolineLevels(field: ScalarField, step: number): number[] {
  let min = Infinity, max = -Infinity
  for (const value of field.values) {
    if (Number.isNaN(value)) continue
    if (value < min) min = value
    if (value > max) max = value
  }
  if (min > max) return []
  const levels: number[] = []
  for (let level = Math.ceil(min / step) * step; level <= max; level += step) levels.push(level)
  return levels
}

// Hoeken: tl=8, tr=4, br=2, bl=1 (bit gezet als waarde ≥ niveau). Edges: 0 boven,
// 1 rechts, 2 onder, 3 links. Zadels (5, 10) worden via het celgemiddelde beslist.
const SEGMENTS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [], [[3, 2]], [[2, 1]], [[3, 1]], [[0, 1]], [], [[0, 2]], [[3, 0]],
  [[3, 0]], [[0, 2]], [], [[0, 1]], [[3, 1]], [[2, 1]], [[3, 2]], [],
]

export interface Workspace {
  first: Int32Array
  second: Int32Array
  visited: Uint8Array
  xs: Float32Array
  ys: Float32Array
}

export function workspace(field: ScalarField): Workspace {
  const edges = field.width * field.height * 2
  return {
    first: new Int32Array(edges).fill(-1),
    second: new Int32Array(edges).fill(-1),
    visited: new Uint8Array(edges),
    xs: new Float32Array(edges),
    ys: new Float32Array(edges),
  }
}

/** `cells` (index rij·breedte + kolom): alleen deze cellen bezoeken, bv. de cellen die het niveau kruisen. */
export function marchingSquares(field: ScalarField, level: number, minLength = 0, minRingLength = minLength, buffers = workspace(field), cells?: ArrayLike<number>): Isoline[] {
  const { width, height, values } = field
  // Een kruising ligt op precies één rooster-edge (id = knoop·2 + richting) en elke edge
  // wordt door hooguit twee cellen gedeeld: graad ≤ 2, dus twee link-slots volstaan.
  const { first, second, visited, xs, ys } = buffers
  const touched: number[] = []
  const crossing = (row: number, column: number, side: number): number => {
    const horizontal = side === 0 || side === 2
    const r = side === 2 ? row + 1 : row
    const c = side === 1 ? column + 1 : column
    const key = (r * width + c) * 2 + (horizontal ? 0 : 1)
    if (first[key] === -1) {
      const a = values[r * width + c]!
      const b = horizontal ? values[r * width + c + 1]! : values[(r + 1) * width + c]!
      const t = (level - a) / (b - a)
      xs[key] = horizontal ? c + t : c
      ys[key] = horizontal ? r : r + t
      touched.push(key)
    }
    return key
  }
  const attach = (from: number, to: number) => {
    if (first[from] === -1) first[from] = to; else second[from] = to
  }
  const visit = (row: number, column: number) => {
    const tl = values[row * width + column]!
    const tr = values[row * width + column + 1]!
    const br = values[(row + 1) * width + column + 1]!
    const bl = values[(row + 1) * width + column]!
    if (Number.isNaN(tl) || Number.isNaN(tr) || Number.isNaN(br) || Number.isNaN(bl)) return
    const index = (tl >= level ? 8 : 0) | (tr >= level ? 4 : 0) | (br >= level ? 2 : 0) | (bl >= level ? 1 : 0)
    if (index === 0 || index === 15) return
    let pairs = SEGMENTS[index]!
    if (index === 5 || index === 10) {
      const centerHigh = (tl + tr + br + bl) / 4 >= level
      // 5 = tr+bl hoog, 10 = tl+br hoog. Hoog midden verbindt de hoge hoeken, dus de lage worden afgesneden.
      const cutTopLeft = index === 5 ? centerHigh : !centerHigh
      pairs = cutTopLeft ? [[3, 0], [2, 1]] : [[0, 1], [3, 2]]
    }
    for (const [from, to] of pairs) {
      const a = crossing(row, column, from), b = crossing(row, column, to)
      attach(a, b); attach(b, a)
    }
  }
  if (cells) {
    for (let index = 0; index < cells.length; index++) visit(Math.floor(cells[index]! / width), cells[index]! % width)
  } else {
    for (let row = 0; row < height - 1; row++) for (let column = 0; column < width - 1; column++) visit(row, column)
  }
  const lines: Isoline[] = []
  const walk = (start: number) => {
    const keys = [start]
    visited[start] = 1
    let current = start
    for (;;) {
      const a = first[current]!, b = second[current]!
      const next = a !== -1 && !visited[a] ? a : b !== -1 && !visited[b] ? b : -1
      if (next === -1) break
      visited[next] = 1
      keys.push(next)
      current = next
    }
    const closed = keys.length > 2 && (first[current] === start || second[current] === start)
    const points = keys.map((key): [number, number] => [xs[key]!, ys[key]!])
    if (polylineLength(points, closed) >= (closed ? minRingLength : minLength)) lines.push({ level, closed, points })
  }
  // Eerst open lijnen vanaf hun uiteinde (graad 1), daarna de overgebleven ringen.
  for (const key of touched) if (!visited[key] && second[key] === -1) walk(key)
  for (const key of touched) if (!visited[key]) walk(key)
  for (const key of touched) {
    first[key] = -1; second[key] = -1; visited[key] = 0
  }
  return lines
}

export function chaikin(points: Array<[number, number]>, closed: boolean, iterations = CHAIKIN_ITERATIONS): Array<[number, number]> {
  let current = points
  for (let iteration = 0; iteration < iterations; iteration++) {
    if (current.length < 3) return current
    const next: Array<[number, number]> = closed ? [] : [current[0]!]
    const segments = closed ? current.length : current.length - 1
    for (let index = 0; index < segments; index++) {
      const [ax, ay] = current[index]!
      const [bx, by] = current[(index + 1) % current.length]!
      next.push([0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by], [0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by])
    }
    if (!closed) next.push(current.at(-1)!)
    current = next
  }
  return current
}

export interface IsolineFeatureCollection {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: { type: 'LineString'; coordinates: Array<[number, number]> }
    properties: { level: number; label: string }
  }>
}

/** Labelgeometrie (Chaikin-geglad, U13); lusjes korter dan `ringKm` krijgen geen label. */
export function isolineFeatures(field: ScalarField, grid: Grid, step: number, ringKm = 0, kind: IsolineKind = 'temperature'): IsolineFeatureCollection {
  const features: IsolineFeatureCollection['features'] = []
  const buffers = workspace(field)
  const toLngLat = gridProjection(grid)
  // De lijnen vervagen lusjes korter dan ringKm; een label op zo'n lusje zou los zweven.
  const centerLat = 2 * Math.atan(Math.exp((grid.y0 + grid.dy * grid.height / 2) / 6378137)) - Math.PI / 2
  const kmPerCell = Math.abs(grid.dx) * Math.cos(centerLat) / 1000
  const minRingCells = ringKm ? Math.max(MIN_RING_CELLS, ringKm / kmPerCell) : MIN_RING_CELLS
  for (const level of isolineLevels(field, step)) {
    for (const line of marchingSquares(field, level, MIN_LENGTH_CELLS, minRingCells, buffers)) {
      const coordinates = chaikin(line.points, line.closed).map(([column, row]) => toLngLat(column, row))
      if (line.closed) coordinates.push(coordinates[0]!)
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates },
        properties: { level, label: isolineLabelText(kind, level) },
      })
    }
  }
  return { type: 'FeatureCollection', features }
}

export interface IsolineRequest {
  frames: WeightedFrame[]
  grid: Grid
  step: number
  kind?: IsolineKind
}

export function computeIsolines(request: IsolineRequest): IsolineFeatureCollection {
  const field = blendFrames(request.frames, request.grid.width, request.grid.height)
  return isolineFeatures(blurField(field, ISOLINE_BLUR), request.grid, request.step, ISOLINE_RING_KM, request.kind)
}

/**
 * Rekent in een worker (op mobiel kost een ruizig veld tientallen ms). Latest-wins: er
 * staat hooguit één verzoek uit en één te wachten; tussenliggende verzoeken vervallen.
 */
export class IsolineWorker {
  private worker?: Worker
  private busy = false
  private queued?: { request: IsolineRequest; resolve: (data: IsolineFeatureCollection | undefined) => void }
  private current?: (data: IsolineFeatureCollection | undefined) => void

  compute(request: IsolineRequest): Promise<IsolineFeatureCollection | undefined> {
    return new Promise((resolve) => {
      this.queued?.resolve(undefined)
      this.queued = { request, resolve }
      this.pump()
    })
  }

  dispose(): void {
    this.worker?.terminate()
    this.worker = undefined
    this.queued?.resolve(undefined)
    this.current?.(undefined)
    this.queued = undefined
    this.current = undefined
    this.busy = false
  }

  private pump(): void {
    if (this.busy || !this.queued) return
    const { request, resolve } = this.queued
    this.queued = undefined
    this.busy = true
    this.current = resolve
    if (!this.worker) {
      this.worker = new Worker(new URL('./isolines.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = ({ data }: MessageEvent<IsolineFeatureCollection | { error: string }>) => {
        this.busy = false
        const done = this.current
        this.current = undefined
        done?.('error' in data ? undefined : data)
        this.pump()
      }
    }
    // Kopieën: de originele frames zitten in de MrfClient-cache en mogen niet detachen.
    const frames = request.frames.map((frame) => ({ ...frame, data: frame.data.slice() }))
    this.worker.postMessage({ ...request, frames }, frames.map((frame) => frame.data.buffer))
  }
}

/**
 * Neutraal en gedempt: warm/koud niet inkleuren, de labels dragen de waarde. Isobaren zijn één
 * egale, iets donkerdere kleur, zoals op een weerkaart (PO U35).
 */
export function isolineColor(theme: MapTheme, kind: IsolineKind = 'temperature'): string {
  if (kind === 'pressure') return theme === 'dark' ? '#b3c3c9' : '#1e2d33'
  return theme === 'dark' ? '#d5e2e6' : '#33474f'
}

/** Isobaren liggen op veelvouden van 4 hPa en dragen hun waarde zonder eenheid ("1012"). */
export function isolineLabelText(kind: IsolineKind, level: number): string {
  return kind === 'pressure' ? String(level) : `${level}°`
}

export const ISOLINE_LINE_OPACITY = 0.8
/** Uitfade van de isolijnen buiten de uurframes van de gevoelstemperatuur. */
export const ISOLINE_EDGE_FADE_MS = 20 * 60_000

function gridProjection(grid: Grid): (column: number, row: number) => [number, number] {
  const radius = 6378137
  // lat is niet-lineair in de rij; per halve cel tabelleren en lineair interpoleren
  // wijkt < 1 m af op een 6-km-grid en scheelt een exp+atan per punt.
  const latitudes = new Float64Array(grid.height * 2 + 2)
  for (let index = 0; index < latitudes.length; index++) {
    const y = grid.y0 + (index / 2 + 0.5) * grid.dy
    latitudes[index] = (2 * Math.atan(Math.exp(y / radius)) - Math.PI / 2) * 180 / Math.PI
  }
  const degreesPerColumn = grid.dx / radius * 180 / Math.PI
  const west = (grid.x0 + 0.5 * grid.dx) / radius * 180 / Math.PI
  return (column, row) => {
    const position = Math.max(0, Math.min(latitudes.length - 1.000001, row * 2))
    const lower = Math.floor(position)
    const lat = latitudes[lower]! + (latitudes[lower + 1]! - latitudes[lower]!) * (position - lower)
    return [west + column * degreesPerColumn, lat]
  }
}

function polylineLength(points: Array<[number, number]>, closed: boolean): number {
  let length = 0
  for (let index = 1; index < points.length; index++) length += Math.hypot(points[index]![0] - points[index - 1]![0], points[index]![1] - points[index - 1]![1])
  if (closed && points.length > 1) length += Math.hypot(points[0]![0] - points.at(-1)![0], points[0]![1] - points.at(-1)![1])
  return length
}
