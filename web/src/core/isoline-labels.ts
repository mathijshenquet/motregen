import type { Map as MapLibreMap } from 'maplibre-gl'
import { Marker } from 'maplibre-gl'
import type { Grid } from './contract'
import type { PreparedField } from './isoline-field'
import type { MapTheme } from './basemap'
import { isolineColor, type FrameWeight, type IsolineFeatureCollection } from './isolines'

const EARTH_RADIUS = 6378137

/** De snede op tijd t: uurvelden met hun (temporele) gewichten, zoals de shader ze mengt. */
export interface FieldSlice {
  width: number
  height: number
  fields: PreparedField[]
  weights: number[]
}

export interface SliceSample {
  value: number
  /** ∂T/∂kolom, ∂T/∂rij (°C per cel). */
  gx: number
  gy: number
  valid: number
}

function basis(t: number): [number, number, number, number] {
  const t2 = t * t, t3 = t2 * t
  return [(1 - 3 * t + 3 * t2 - t3) / 6, (4 - 6 * t2 + 3 * t3) / 6, (1 + 3 * t + 3 * t2 - 3 * t3) / 6, t3 / 6]
}

function derivative(t: number): [number, number, number, number] {
  const t2 = t * t
  return [(-3 + 6 * t - 3 * t2) / 6, (-12 * t + 9 * t2) / 6, (3 + 6 * t - 9 * t2) / 6, 3 * t2 / 6]
}

/**
 * Kubische B-spline in de ruimte (celcentra op gehele coördinaten, zoals de shader) met
 * analytische gradiënt, gemengd over de uurvelden van de snede.
 */
export function sampleSlice(slice: FieldSlice, column: number, row: number): SliceSample {
  const { width, height } = slice
  const i = Math.floor(column), j = Math.floor(row)
  const bx = basis(column - i), by = basis(row - j), dx = derivative(column - i), dy = derivative(row - j)
  let value = 0, gx = 0, gy = 0, valid = 0
  for (let b = 0; b < 4; b++) {
    const r = Math.max(0, Math.min(height - 1, j - 1 + b))
    for (let a = 0; a < 4; a++) {
      const c = Math.max(0, Math.min(width - 1, i - 1 + a))
      let v = 0, ok = 0
      for (let frame = 0; frame < slice.fields.length; frame++) {
        v += slice.fields[frame]!.values[r * width + c]! * slice.weights[frame]!
        ok += slice.fields[frame]!.valid[r * width + c]! * slice.weights[frame]!
      }
      value += v * bx[a]! * by[b]!
      gx += v * dx[a]! * by[b]!
      gy += v * bx[a]! * dy[b]!
      valid += ok * bx[a]! * by[b]!
    }
  }
  return { value, gx, gy, valid }
}

/**
 * Kraal op een draad: schuif een punt met Newton-stappen langs de gradiënt naar T = level.
 * Geeft undefined als het niveau hier niet (meer) bestaat.
 */
export function projectToLevel(slice: FieldSlice, column: number, row: number, level: number, step: number, iterations = 2): { column: number; row: number; sample: SliceSample } | undefined {
  let x = column, y = row
  for (let iteration = 0; iteration < iterations; iteration++) {
    const sample = sampleSlice(slice, x, y)
    const norm = sample.gx * sample.gx + sample.gy * sample.gy
    if (sample.valid < 0.5 || norm < 1e-8) return undefined
    const delta = (sample.value - level) / norm
    // Meer dan twee cellen in één stap is geen meeglijden meer maar een sprong naar een andere lijn.
    if (Math.abs(delta) * Math.sqrt(norm) > 2) return undefined
    x -= delta * sample.gx
    y -= delta * sample.gy
    if (x < 0 || y < 0 || x > slice.width - 1 || y > slice.height - 1) return undefined
  }
  const sample = sampleSlice(slice, x, y)
  if (sample.valid < 0.5 || Math.abs(sample.value - level) > step * 0.1) return undefined
  return { column: x, row: y, sample }
}

export interface IsolineLabelTuning {
  /** Minimale afstand tussen twee labels, in CSS-pixels. */
  minDistancePx: number
  /** Afstand langs een lijn tussen kandidaat-ankers bij het spawnen. */
  spacingPx: number
}

export const DEFAULT_LABEL_TUNING: IsolineLabelTuning = { minDistancePx: 90, spacingPx: 260 }

const FADE_MS = 300
const MAX_ANCHORS = 60
const SPAWN_INTERVAL_MS = 750

interface Anchor {
  level: number
  column: number
  row: number
  born: number
  marker: Marker
  text: HTMLElement
  dying: boolean
}

/**
 * Lijnlabels als persistente ankers op het (x, y, t)-oppervlak van hun isolijn: elke snede
 * schuift het anker met een Newton-stap terug op de lijn, zodat labels meeglijden i.p.v. per
 * frame opnieuw geplaatst te worden. Spawnen uit de uurgeometrie, despawnen (met fade) als
 * de lijn verdwijnt of twee ankers te dicht naderen; de oudste blijft staan.
 */
export class IsolineLabels {
  private anchors: Anchor[] = []
  private lastSpawn = -Infinity
  private lines?: IsolineFeatureCollection
  private linesChanged = false
  private opacity = 0
  private step = 1

  constructor(
    private readonly map: MapLibreMap,
    private readonly grid: Grid,
    private tuning: IsolineLabelTuning,
    private readonly theme: MapTheme,
    private readonly reducedMotion: () => boolean,
  ) {}

  get count(): number {
    return this.anchors.filter((anchor) => !anchor.dying).length
  }

  setLines(lines: IsolineFeatureCollection, step: number): void {
    if (step !== this.step) this.clear()
    this.step = step
    this.lines = lines
    this.linesChanged = true
  }

  /** Na een pan/zoom: gaten in beeld mogen meteen gevuld worden. */
  requestSpawn(): void {
    this.linesChanged = true
  }

  setTuning(tuning: IsolineLabelTuning): void {
    this.tuning = tuning
    this.linesChanged = true
  }

  setOpacity(opacity: number): void {
    if (opacity === this.opacity) return
    this.opacity = opacity
    for (const anchor of this.anchors) anchor.marker.getElement().style.opacity = String(opacity)
  }

  clear(): void {
    for (const anchor of this.anchors) anchor.marker.remove()
    this.anchors = []
    this.lines = undefined
  }

  /** Eén snede: ankers meeschuiven, botsingen opruimen en zo nodig bijspawnen. */
  update(slice: FieldSlice, now = performance.now()): void {
    const pxPerCell = this.pxPerCell()
    for (const anchor of this.anchors) {
      if (anchor.dying) continue
      const projected = projectToLevel(slice, anchor.column, anchor.row, anchor.level, this.step)
      if (!projected) { this.kill(anchor); continue }
      anchor.column = projected.column
      anchor.row = projected.row
      this.place(anchor, projected.sample)
    }
    const minCells = this.tuning.minDistancePx / pxPerCell
    const living = this.anchors.filter((anchor) => !anchor.dying).sort((a, b) => a.born - b.born)
    for (let index = 0; index < living.length; index++) {
      const anchor = living[index]!
      if (anchor.dying) continue
      for (let other = index + 1; other < living.length; other++) {
        const younger = living[other]!
        if (!younger.dying && Math.hypot(anchor.column - younger.column, anchor.row - younger.row) < minCells) this.kill(younger)
      }
    }
    if (this.lines && (this.linesChanged || now - this.lastSpawn > SPAWN_INTERVAL_MS)) this.spawn(slice, pxPerCell, now)
  }

  private spawn(slice: FieldSlice, pxPerCell: number, now: number): void {
    this.lastSpawn = now
    this.linesChanged = false
    const view = this.viewInCells()
    const spacing = this.tuning.spacingPx / pxPerCell
    const minCells = this.tuning.minDistancePx / pxPerCell
    const living = () => this.anchors.filter((anchor) => !anchor.dying)
    for (const feature of this.lines!.features) {
      const points = feature.geometry.coordinates.map(([lng, lat]) => this.toCell(lng, lat))
      // Eerste kandidaat een halve spatiëring in, zodat korte lijnen er één in het midden krijgen.
      let until = spacing / 2
      for (let index = 1; index < points.length && living().length < MAX_ANCHORS; index++) {
        const [ax, ay] = points[index - 1]!, [bx, by] = points[index]!
        const length = Math.hypot(bx - ax, by - ay)
        while (until <= length) {
          const t = until / length
          const column = ax + (bx - ax) * t, row = ay + (by - ay) * t
          until += spacing
          if (column < view.left || column > view.right || row < view.top || row > view.bottom) continue
          if (living().some((anchor) => Math.hypot(anchor.column - column, anchor.row - row) < minCells)) continue
          const projected = projectToLevel(slice, column, row, feature.properties.level, this.step)
          if (!projected) continue
          this.add(feature.properties.level, projected.column, projected.row, projected.sample, now)
        }
        until -= length
      }
    }
  }

  private add(level: number, column: number, row: number, sample: SliceSample, now: number): void {
    const element = document.createElement('div')
    element.className = `isoline-label isoline-label-${this.theme}`
    element.style.color = isolineColor(this.theme)
    element.style.opacity = String(this.opacity)
    const text = document.createElement('span')
    text.textContent = `${level}°`
    text.style.opacity = '0'
    if (!this.reducedMotion()) text.style.transition = `opacity ${FADE_MS}ms ease-out`
    element.append(text)
    const anchor: Anchor = { level, column, row, born: now, text, dying: false, marker: new Marker({ element, rotationAlignment: 'map', pitchAlignment: 'map' }) }
    this.place(anchor, sample)
    anchor.marker.addTo(this.map)
    this.anchors.push(anchor)
    requestAnimationFrame(() => { text.style.opacity = '1' })
  }

  private kill(anchor: Anchor): void {
    anchor.dying = true
    anchor.text.style.opacity = '0'
    window.setTimeout(() => {
      anchor.marker.remove()
      this.anchors = this.anchors.filter((candidate) => candidate !== anchor)
    }, this.reducedMotion() ? 0 : FADE_MS)
  }

  private place(anchor: Anchor, sample: SliceSample): void {
    anchor.marker.setLngLat(this.toLngLat(anchor.column, anchor.row))
    // Het 3857-rooster is op schermschaal conform: rij omlaag = scherm omlaag. De tekst loopt
    // langs de raaklijn (loodrecht op de gradiënt) en blijft rechtop leesbaar.
    let angle = Math.atan2(sample.gy, sample.gx) * 180 / Math.PI + 90
    if (angle > 90) angle -= 180
    if (angle <= -90) angle += 180
    anchor.marker.setRotation(angle)
  }

  private pxPerCell(): number {
    return this.grid.dx * 512 * 2 ** this.map.getZoom() / (2 * Math.PI * EARTH_RADIUS)
  }

  private viewInCells(): { left: number; right: number; top: number; bottom: number } {
    const bounds = this.map.getBounds()
    const [left, top] = this.toCell(bounds.getWest(), bounds.getNorth())
    const [right, bottom] = this.toCell(bounds.getEast(), bounds.getSouth())
    return { left: Math.min(left, right), right: Math.max(left, right), top: Math.min(top, bottom), bottom: Math.max(top, bottom) }
  }

  private toCell(lng: number, lat: number): [number, number] {
    const x = lng * Math.PI / 180 * EARTH_RADIUS
    const y = EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))
    return [(x - this.grid.x0) / this.grid.dx - 0.5, (y - this.grid.y0) / this.grid.dy - 0.5]
  }

  private toLngLat(column: number, row: number): [number, number] {
    const x = this.grid.x0 + (column + 0.5) * this.grid.dx
    const y = this.grid.y0 + (row + 0.5) * this.grid.dy
    return [x / EARTH_RADIUS * 180 / Math.PI, (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) * 180 / Math.PI]
  }
}

/** Tijdgewichten van de snede in frame-index-ruimte, gelijk aan de shader (lineair of B-spline). */
export function sliceWeights(time: number, depth: number, window: number): FrameWeight[] {
  const clamp = (index: number) => Math.max(0, Math.min(depth - 1, index))
  if (window < 1) {
    const left = Math.floor(time), mix = time - left
    return [{ index: clamp(left), weight: 1 - mix }, { index: clamp(left + 1), weight: mix }]
  }
  const base = Math.floor(time)
  return basis(time - base).map((weight, offset) => ({ index: clamp(base - 1 + offset), weight }))
}
