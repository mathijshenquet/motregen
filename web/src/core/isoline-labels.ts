import { DEFAULT_LABEL_TUNING, lineLabelCandidates, LABEL_MIN_DISTANCE_PX, MAX_LABEL_ANCHORS, pointLabelCandidates, type LabelTuning } from './isoline-label-anchors.js'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { Marker } from 'maplibre-gl'
import type { Grid } from './contract'
import type { MapTheme } from './basemap'
import { isolineColor, isolineLabelText, type IsolineFeatureCollection, type IsolineKind } from './isolines'
import { ringFadeAt, type ShortRing } from './isoline-contours'
import { projectToLevel, sampleSlice, type FieldSlice, type SliceSample } from './isoline-spline'
import { markLayerDrawn } from './perf'

const EARTH_RADIUS = 6378137

const FADE_MS = 300

const SPAWN_INTERVAL_MS = 750

interface Anchor {
  level: number
  column: number
  row: number
  born: number
  /** Lengte-fade van de ring waar het anker op ligt (1 op lange en open lijnen). */
  ringFade: number
  marker: Marker
  text: HTMLElement
  dying: boolean
}

/** Puntlabel (U100-proef): de veldwaarde op een vaste plek waar geen lijnlabel in de buurt staat. */
interface PointLabel {
  column: number
  row: number
  value: number
  marker: Marker
  text: HTMLElement
  dying: boolean
}

const MAX_POINT_LABELS = 80
/** Geen puntlabel zo dicht op een isolijn: de tekst zou over de lijn vallen. */
const POINT_LINE_CLEARANCE_PX = 14
const VISIBLE_RING_FADE = 0.5

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
  private rings: readonly ShortRing[] = []
  private points: PointLabel[] = []
  /** Maaswijdte (cellen) waarop de puntlabels staan; bij zoom of een andere straal begint het rooster opnieuw. */
  private pointSpacing = 0

  constructor(
    private readonly map: MapLibreMap,
    private readonly grid: Grid,
    private theme: MapTheme,
    private readonly reducedMotion: () => boolean,
    private readonly kind: IsolineKind = 'temperature',
    private readonly tuning: () => LabelTuning = () => DEFAULT_LABEL_TUNING,
  ) {}

  /** De kaart eronder is van licht naar donker gegaan (of terug): bestaande labels kleuren mee. */
  setTheme(theme: MapTheme): void {
    if (theme === this.theme) return
    const previous = this.theme
    this.theme = theme
    for (const { marker } of [...this.anchors, ...this.points]) {
      const element = marker.getElement()
      element.classList.replace(`isoline-label-${previous}`, `isoline-label-${theme}`)
      element.style.color = isolineColor(theme, this.kind)
    }
  }

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

  setOpacity(opacity: number): void {
    if (opacity === this.opacity) return
    this.opacity = opacity
    for (const anchor of this.anchors) this.applyOpacity(anchor)
    for (const point of this.points) point.marker.setOpacity(this.opacity)
    this.noteDrawn()
  }

  /** Tekenmeting (U109): de getallen van Gevoel staan als labels op de lijnen. */
  private noteDrawn(): void {
    if (this.kind === 'temperature' && this.opacity > 0 && (this.anchors.length || this.points.length)) markLayerDrawn('temperatuurgetallen')
  }

  clear(): void {
    for (const anchor of this.anchors) anchor.marker.remove()
    this.anchors = []
    this.lines = undefined
    this.clearPoints()
  }

  private clearPoints(): void {
    for (const point of this.points) point.marker.remove()
    this.points = []
  }

  /**
   * Eén snede: ankers meeschuiven, botsingen opruimen en zo nodig bijspawnen. `rings` zijn de
   * korte ringen van dezelfde snede; een anker vervaagt met zijn ring en despawnt als die weg is.
   */
  update(slice: FieldSlice, rings: readonly ShortRing[] = [], now = performance.now()): void {
    this.rings = rings
    const pxPerCell = this.pxPerCell()
    for (const anchor of this.anchors) {
      if (anchor.dying) continue
      const projected = projectToLevel(slice, anchor.column, anchor.row, anchor.level, this.step)
      if (!projected) { this.kill(anchor); continue }
      anchor.column = projected.column
      anchor.row = projected.row
      this.place(anchor, projected.sample)
      if (anchor.ringFade <= 0) this.kill(anchor)
    }
    const minCells = LABEL_MIN_DISTANCE_PX / pxPerCell
    const living = this.anchors.filter((anchor) => !anchor.dying).sort((a, b) => a.born - b.born)
    for (let index = 0; index < living.length; index++) {
      const anchor = living[index]!
      if (anchor.dying) continue
      for (let other = index + 1; other < living.length; other++) {
        const younger = living[other]!
        if (!younger.dying && Math.hypot(anchor.column - younger.column, anchor.row - younger.row) < minCells) this.kill(younger)
      }
    }
    this.updatePoints(slice, pxPerCell)
    if (this.lines && (this.linesChanged || now - this.lastSpawn > SPAWN_INTERVAL_MS)) {
      this.spawn(slice, pxPerCell, now)
      this.spawnPoints(slice, pxPerCell)
    }
  }

  /** Puntlabels volgen de waarde op hun plek en wijken voor een lijnlabel of een isolijn die dichtbij komt. */
  private updatePoints(slice: FieldSlice, pxPerCell: number): void {
    const radius = this.tuning().fill / pxPerCell
    if (radius <= 0 || this.kind !== 'temperature' || Math.abs(radius - this.pointSpacing) > this.pointSpacing * 0.05) {
      if (this.points.length) this.clearPoints()
      this.pointSpacing = radius
      return
    }
    for (const point of this.points) {
      if (point.dying) continue
      const value = this.pointValue(slice, point.column, point.row, pxPerCell)
      if (value === undefined || this.nearLineLabel(point.column, point.row, radius)) { this.killPoint(point); continue }
      if (value !== point.value) {
        point.value = value
        point.text.textContent = isolineLabelText(this.kind, value)
      }
    }
  }

  private spawnPoints(slice: FieldSlice, pxPerCell: number): void {
    const radius = this.pointSpacing
    if (radius <= 0) return
    const view = this.viewInCells()
    // Een rooster op halve straal vindt elk gat van straal R; puntlabels houden onderling R afstand.
    for (const [column, row] of pointLabelCandidates(view, radius / 2)) {
      if (this.points.filter((point) => !point.dying).length >= MAX_POINT_LABELS) break
      if (column < 0 || row < 0 || column > slice.width - 1 || row > slice.height - 1) continue
      if (this.points.some((point) => !point.dying && Math.hypot(point.column - column, point.row - row) < radius)) continue
      if (this.nearLineLabel(column, row, radius)) continue
      const value = this.pointValue(slice, column, row, pxPerCell)
      if (value !== undefined) this.addPoint(column, row, value)
    }
  }

  /** Afgeronde waarde op (column, row), of undefined zonder data of te dicht bij een isolijn. */
  private pointValue(slice: FieldSlice, column: number, row: number, pxPerCell: number): number | undefined {
    const sample = sampleSlice(slice, column, row)
    if (sample.valid < 0.5) return undefined
    const level = Math.round(sample.value / this.step) * this.step
    const gradient = Math.hypot(sample.gx, sample.gy)
    if (gradient > 1e-6 && Math.abs(sample.value - level) / gradient * pxPerCell < POINT_LINE_CLEARANCE_PX) return undefined
    return Math.round(sample.value)
  }

  /** Een label op een vervaagd kort ringetje is nauwelijks te lezen en telt niet als getal in de buurt. */
  private nearLineLabel(column: number, row: number, radius: number): boolean {
    return this.anchors.some((anchor) => !anchor.dying && anchor.ringFade >= VISIBLE_RING_FADE && Math.hypot(anchor.column - column, anchor.row - row) < radius)
  }

  private addPoint(column: number, row: number, value: number): void {
    const element = document.createElement('div')
    element.className = `isoline-label isoline-point-label isoline-label-${this.theme}`
    element.style.color = isolineColor(this.theme, this.kind)
    const text = document.createElement('span')
    text.textContent = isolineLabelText(this.kind, value)
    text.style.opacity = '0'
    if (!this.reducedMotion()) text.style.transition = `opacity ${FADE_MS}ms ease-out`
    element.append(text)
    const marker = new Marker({ element }).setLngLat(this.toLngLat(column, row)).setOpacity(this.opacity).addTo(this.map)
    this.points.push({ column, row, value, marker, text, dying: false })
    this.noteDrawn()
    requestAnimationFrame(() => { text.style.opacity = '1' })
  }

  private killPoint(point: PointLabel): void {
    point.dying = true
    point.text.style.opacity = '0'
    window.setTimeout(() => {
      point.marker.remove()
      this.points = this.points.filter((candidate) => candidate !== point)
    }, this.reducedMotion() ? 0 : FADE_MS)
  }

  private spawn(slice: FieldSlice, pxPerCell: number, now: number): void {
    this.lastSpawn = now
    this.linesChanged = false
    const view = this.viewInCells()
    const spacing = this.tuning().spacing / pxPerCell
    const minCells = LABEL_MIN_DISTANCE_PX / pxPerCell
    const living = () => this.anchors.filter((anchor) => !anchor.dying)
    for (const feature of this.lines!.features) {
      const points = feature.geometry.coordinates.map(([lng, lat]) => this.toCell(lng, lat))
      for (const [column, row] of lineLabelCandidates(points, spacing)) {
        if (living().length >= MAX_LABEL_ANCHORS) break
        if (column < view.left || column > view.right || row < view.top || row > view.bottom) continue
        if (living().some((anchor) => Math.hypot(anchor.column - column, anchor.row - row) < minCells)) continue
        const projected = projectToLevel(slice, column, row, feature.properties.level, this.step)
        if (!projected || ringFadeAt(this.rings, feature.properties.level, projected.column, projected.row) <= 0) continue
        this.add(feature.properties.level, projected.column, projected.row, projected.sample, now)
      }
    }
  }

  private add(level: number, column: number, row: number, sample: SliceSample, now: number): void {
    const element = document.createElement('div')
    element.className = `isoline-label isoline-label-${this.theme}${this.kind === 'pressure' ? ' isobar-label' : ''}`
    element.style.color = isolineColor(this.theme, this.kind)
    element.style.opacity = '0'
    if (this.reducedMotion()) element.style.transition = 'none'
    const text = document.createElement('span')
    text.textContent = isolineLabelText(this.kind, level)
    text.style.opacity = '0'
    if (!this.reducedMotion()) text.style.transition = `opacity ${FADE_MS}ms ease-out`
    element.append(text)
    const anchor: Anchor = { level, column, row, born: now, text, dying: false, ringFade: 1, marker: new Marker({ element, rotationAlignment: 'map', pitchAlignment: 'map' }) }
    this.place(anchor, sample)
    anchor.marker.addTo(this.map)
    this.anchors.push(anchor)
    this.noteDrawn()
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
    const lngLat = this.toLngLat(anchor.column, anchor.row)
    anchor.marker.setLngLat(lngLat)
    anchor.ringFade = ringFadeAt(this.rings, anchor.level, anchor.column, anchor.row)
    this.applyOpacity(anchor)
    // Het 3857-rooster is op schermschaal conform: rij omlaag = scherm omlaag. De tekst loopt
    // langs de raaklijn (loodrecht op de gradiënt) en blijft rechtop leesbaar.
    let angle = Math.atan2(sample.gy, sample.gx) * 180 / Math.PI + 90
    if (angle > 90) angle -= 180
    if (angle <= -90) angle += 180
    anchor.marker.setRotation(angle)
  }

  private applyOpacity(anchor: Anchor): void {
    anchor.marker.setOpacity(this.opacity * anchor.ringFade)
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
