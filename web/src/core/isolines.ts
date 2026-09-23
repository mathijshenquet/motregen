import type { LineLayerSpecification, SymbolLayerSpecification } from 'maplibre-gl'
import type { MapTheme } from './basemap'
import type { Grid, MrfHeader } from './contract'

export const ISOLINE_STEPS = [1, 2, 5] as const
export type IsolineStep = typeof ISOLINE_STEPS[number]

export interface IsolineTuning {
  step: IsolineStep
  /** Chaikin op de lijnen. */
  smoothing: boolean
  /** Aantal 3×3-boxblur-passes op het veld vóór het contouren (2 ≈ Gauss σ 1,2 cel). */
  blur: number
}

export const DEFAULT_ISOLINE_TUNING: IsolineTuning = { step: 2, smoothing: true, blur: 2 }

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

export function blendField(left: Uint8Array, right: Uint8Array, leftHeader: Pick<MrfHeader, 'grid' | 'quant'>, rightHeader: Pick<MrfHeader, 'grid' | 'quant'>, mix: number): ScalarField {
  const { width, height } = leftHeader.grid
  const values = new Float32Array(width * height)
  const sameFrame = left === right || mix === 0
  for (let index = 0; index < values.length; index++) {
    const first = leftHeader.quant[left[index]!]
    if (sameFrame) {
      values[index] = first ?? Number.NaN
      continue
    }
    const second = rightHeader.quant[right[index]!]
    values[index] = first == null || second == null ? Number.NaN : first * (1 - mix) + second * mix
  }
  return { width, height, values }
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

interface Workspace {
  first: Int32Array
  second: Int32Array
  visited: Uint8Array
  xs: Float32Array
  ys: Float32Array
}

function workspace(field: ScalarField): Workspace {
  const edges = field.width * field.height * 2
  return {
    first: new Int32Array(edges).fill(-1),
    second: new Int32Array(edges).fill(-1),
    visited: new Uint8Array(edges),
    xs: new Float32Array(edges),
    ys: new Float32Array(edges),
  }
}

export function marchingSquares(field: ScalarField, level: number, minLength = 0, minRingLength = minLength, buffers = workspace(field)): Isoline[] {
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
  for (let row = 0; row < height - 1; row++) {
    for (let column = 0; column < width - 1; column++) {
      const tl = values[row * width + column]!
      const tr = values[row * width + column + 1]!
      const br = values[(row + 1) * width + column + 1]!
      const bl = values[(row + 1) * width + column]!
      if (Number.isNaN(tl) || Number.isNaN(tr) || Number.isNaN(br) || Number.isNaN(bl)) continue
      const index = (tl >= level ? 8 : 0) | (tr >= level ? 4 : 0) | (br >= level ? 2 : 0) | (bl >= level ? 1 : 0)
      if (index === 0 || index === 15) continue
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

export const emptyIsolineData: IsolineFeatureCollection = { type: 'FeatureCollection', features: [] }

export function isolineFeatures(field: ScalarField, grid: Grid, tuning: IsolineTuning): IsolineFeatureCollection {
  const features: IsolineFeatureCollection['features'] = []
  const buffers = workspace(field)
  const toLngLat = gridProjection(grid)
  for (const level of isolineLevels(field, tuning.step)) {
    for (const line of marchingSquares(field, level, MIN_LENGTH_CELLS, MIN_RING_CELLS, buffers)) {
      const smoothed = tuning.smoothing ? chaikin(line.points, line.closed) : line.points
      const coordinates = smoothed.map(([column, row]) => toLngLat(column, row))
      if (line.closed) coordinates.push(coordinates[0]!)
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates },
        properties: { level, label: `${level}°` },
      })
    }
  }
  return { type: 'FeatureCollection', features }
}

export interface IsolineRequest {
  left: Uint8Array
  right: Uint8Array
  leftQuant: Array<number | null>
  rightQuant: Array<number | null>
  grid: Grid
  mix: number
  tuning: IsolineTuning
}

export function computeIsolines(request: IsolineRequest): IsolineFeatureCollection {
  const field = blendField(request.left, request.right, { grid: request.grid, quant: request.leftQuant }, { grid: request.grid, quant: request.rightQuant }, request.mix)
  return isolineFeatures(blurField(field, request.tuning.blur), request.grid, request.tuning)
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
    const left = request.left.slice(), right = request.right === request.left ? left : request.right.slice()
    const transfer = right === left ? [left.buffer] : [left.buffer, right.buffer]
    this.worker.postMessage({ ...request, left, right }, transfer)
  }
}

export function isolineLayers(theme: MapTheme): [LineLayerSpecification, SymbolLayerSpecification] {
  const dark = theme === 'dark'
  // Neutraal en gedempt: warm/koud niet inkleuren, de labels dragen de waarde.
  const color = dark ? '#d5e2e6' : '#33474f'
  return [{
    id: 'motregen-isolines',
    type: 'line',
    source: 'motregen-isolines',
    layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'none' },
    paint: {
      'line-color': color,
      'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1, 9, 1.6],
      'line-opacity': 0,
      'line-opacity-transition': { duration: 0 },
    },
  }, {
    id: 'motregen-isoline-labels',
    type: 'symbol',
    source: 'motregen-isolines',
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': 280,
      'text-field': ['get', 'label'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 9, 12],
      'text-font': ['Noto Sans Regular'],
      'text-keep-upright': true,
      'text-max-angle': 35,
      'text-padding': 2,
      visibility: 'none',
    },
    paint: {
      'text-color': color,
      'text-halo-color': dark ? '#102027' : '#ffffff',
      'text-halo-width': 1.6,
      'text-opacity': 0,
      'text-opacity-transition': { duration: 0 },
    },
  }]
}

export const ISOLINE_LINE_OPACITY = 0.62

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
