import { Marker, type Map as MapLibreMap } from 'maplibre-gl'
import type { Grid } from './contract'
import type { MapTheme } from './basemap'
import type { ShortRing } from './isoline-contours'
import type { LabelTuning } from './isoline-label-anchors'
import { TEMPERATURE_ISOLINE_STEP, type IsolineFeatureCollection } from './isolines'
import type { IsolineBubble } from './isoline-layer'
import { sampleSlice, type FieldSlice } from './isoline-spline'
import { selectTemperaturePlaces, temperaturePlaces, type TemperaturePlace } from './temperature'

/**
 * ?dev-proef U100 ronde 3 (`?dev&templabels=`, vervalt 2026-11-23): waar de temperatuurgetallen in Gevoel staan.
 * `lijn` is het huidige beeld (getal op de isolijn); de andere drie zetten een getal met een halo op een plek
 * en laten de isolijnen ongelabeld. `-half`/`vlakken`: isolijnen op x,5 °C, zodat elk vlak één heel getal is.
 */
export const TEMPERATURE_LABEL_LOOKS = ['lijn', 'plekken', 'vlakken', 'plekken-half'] as const
export type TemperatureLabelLook = typeof TEMPERATURE_LABEL_LOOKS[number]

export function temperatureLabelLook(search: string): TemperatureLabelLook | undefined {
  const value = new URLSearchParams(search).get('templabels')
  return TEMPERATURE_LABEL_LOOKS.find((look) => look === value)
}

export interface TemperatureLabelPlan {
  numbers?: 'plekken' | 'vlakken'
  /** Isolijnen op k + offset °C. */
  offset: number
}

export const TEMPERATURE_LABEL_PLANS: Record<TemperatureLabelLook, TemperatureLabelPlan> = {
  lijn: { offset: 0 },
  plekken: { numbers: 'plekken', offset: 0 },
  vlakken: { numbers: 'vlakken', offset: 0.5 },
  'plekken-half': { numbers: 'plekken', offset: 0.5 },
}

/** PO 2026-11-09: 13 px voelt op desktop goed; op de telefoon (kortste zijde < 600 px) één stap kleiner. */
export function temperatureLabelSize(width: number, height: number): number {
  return Math.min(width, height) < 600 ? 12 : 13
}

/** Startwaarden van de schuiven onder `templabels`: 13/12 px, 160 px langs de lijn (ronde 2: 140–200 px). */
export function lookLabelTuning(width: number, height: number): LabelTuning {
  return { size: temperatureLabelSize(width, height), spacing: 160, fill: 0 }
}

/**
 * Dezelfde plekken als de windzakken van de windmodus-proef (U101 `windVanePlaces`, nog niet op main): de
 * stadstemperaturen plus water, zodat de zee ook een getal krijgt. Bij acceptatie van beide één lijst.
 */
export const TEMPERATURE_NUMBER_PLACES: readonly TemperaturePlace[] = [
  ...temperaturePlaces,
  { name: 'Noordzee west', lng: 3.3, lat: 52.3 },
  { name: 'Noordzee noord', lng: 4.3, lat: 53.5 },
  { name: 'Waddenzee noord', lng: 5.9, lat: 53.6 },
  { name: 'Noordzee zuid', lng: 2.9, lat: 51.7 },
  { name: 'IJsselmeer', lng: 5.35, lat: 52.85 },
  { name: 'Markermeer', lng: 5.25, lat: 52.55 },
  { name: 'Noordzee kust', lng: 3.9, lat: 52.7 },
  { name: 'Eems', lng: 6.75, lat: 53.6 },
]

/** Dichtheid van de windzakken (U101 `WIND_VANE_SPACING`): ±30–40 over NL op telefoon en desktop. */
export function placeNumberSpacingPx(width: number, height: number): number {
  return Math.round(Math.max(40, Math.min(64, Math.min(width, height) / 16)))
}

export interface NumberLabel { x: number; y: number; value: number }

export interface RegionOptions {
  /** Maaswijdte van het schermraster waarop de vlakken bepaald worden. */
  cellPx: number
  /** Een nieuw getal staat minstens zo ver van de rand van zijn vlak (en van de beeldrand). */
  insetPx: number
  /** Een bestaand getal blijft staan zolang het minstens zo ver van de rand zit: geen gespring bij afspelen. */
  keepInsetPx: number
  /** Minimale afstand tussen twee getallen. */
  minDistancePx: number
  /** Minimale afstand tussen twee getallen in hetzelfde vlak (herhaling bij grote vlakken). */
  repeatPx: number
  max: number
  /** Extra afwijzing (plaatsnamen, pin); true = hier niet. */
  blocked?: (x: number, y: number, value: number) => boolean
}

/**
 * Eén getal per vlak (vlak = samenhangend gebied met dezelfde afgeronde waarde) op het punt dat het verst van de
 * rand ligt (pole of inaccessibility, op een raster met chamferafstand), herhaald in grote vlakken. Gretig op
 * afstand tot de rand, zodat elk vlak eerst zijn beste punt krijgt. Scherm-px in, scherm-px uit.
 */
export function regionNumbers(
  sample: (x: number, y: number) => number | undefined,
  width: number,
  height: number,
  options: RegionOptions,
  previous: readonly NumberLabel[] = [],
): NumberLabel[] {
  const { cellPx } = options
  const columns = Math.max(1, Math.ceil(width / cellPx)), rows = Math.max(1, Math.ceil(height / cellPx))
  const count = columns * rows
  const band = new Int32Array(count)
  const valid = new Uint8Array(count)
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const value = sample((column + 0.5) * cellPx, (row + 0.5) * cellPx)
      if (value === undefined || !Number.isFinite(value)) continue
      valid[row * columns + column] = 1
      band[row * columns + column] = Math.round(value)
    }
  }
  const component = new Int32Array(count).fill(-1)
  const stack: number[] = []
  let components = 0
  for (let start = 0; start < count; start++) {
    if (!valid[start] || component[start]! >= 0) continue
    component[start] = components
    stack.push(start)
    while (stack.length) {
      const index = stack.pop()!
      const column = index % columns, row = (index - column) / columns
      for (const [dx, dy] of NEIGHBOURS) {
        const x = column + dx, y = row + dy
        if (x < 0 || y < 0 || x >= columns || y >= rows) continue
        const next = y * columns + x
        if (valid[next] && component[next]! < 0 && band[next] === band[index]) {
          component[next] = components
          stack.push(next)
        }
      }
    }
    components++
  }
  const distance = new Float32Array(count)
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const index = row * columns + column
      if (!valid[index]) continue
      let value = (Math.min(column, columns - 1 - column, row, rows - 1 - row) + 0.5) * cellPx
      for (const [dx, dy] of NEIGHBOURS) {
        const x = column + dx, y = row + dy
        if (x < 0 || y < 0 || x >= columns || y >= rows) continue
        const next = y * columns + x
        if (!valid[next] || band[next] !== band[index]) { value = Math.min(value, cellPx / 2); break }
      }
      distance[index] = value
    }
  }
  const diagonal = cellPx * Math.SQRT2
  const relax = (index: number, other: number, step: number) => {
    if (distance[other]! + step < distance[index]!) distance[index] = distance[other]! + step
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const index = row * columns + column
      if (!valid[index]) continue
      if (column > 0) relax(index, index - 1, cellPx)
      if (row > 0) {
        relax(index, index - columns, cellPx)
        if (column > 0) relax(index, index - columns - 1, diagonal)
        if (column < columns - 1) relax(index, index - columns + 1, diagonal)
      }
    }
  }
  for (let row = rows - 1; row >= 0; row--) {
    for (let column = columns - 1; column >= 0; column--) {
      const index = row * columns + column
      if (!valid[index]) continue
      if (column < columns - 1) relax(index, index + 1, cellPx)
      if (row < rows - 1) {
        relax(index, index + columns, cellPx)
        if (column < columns - 1) relax(index, index + columns + 1, diagonal)
        if (column > 0) relax(index, index + columns - 1, diagonal)
      }
    }
  }
  const chosen: Array<NumberLabel & { component: number }> = []
  const fits = (x: number, y: number, region: number) => chosen.every((other) => {
    const gap = Math.hypot(other.x - x, other.y - y)
    return gap >= options.minDistancePx && (other.component !== region || gap >= options.repeatPx)
  })
  const cellAt = (x: number, y: number) => {
    const column = Math.floor(x / cellPx), row = Math.floor(y / cellPx)
    return column < 0 || row < 0 || column >= columns || row >= rows ? -1 : row * columns + column
  }
  for (const label of previous) {
    const index = cellAt(label.x, label.y)
    if (index < 0 || !valid[index] || band[index] !== label.value || distance[index]! < options.keepInsetPx) continue
    if (chosen.length >= options.max || !fits(label.x, label.y, component[index]!)) continue
    if (options.blocked?.(label.x, label.y, label.value)) continue
    chosen.push({ ...label, component: component[index]! })
  }
  const candidates: number[] = []
  for (let index = 0; index < count; index++) if (valid[index] && distance[index]! >= options.insetPx) candidates.push(index)
  candidates.sort((a, b) => distance[b]! - distance[a]! || a - b)
  for (const index of candidates) {
    if (chosen.length >= options.max) break
    const column = index % columns, row = (index - column) / columns
    const x = (column + 0.5) * cellPx, y = (row + 0.5) * cellPx
    if (!fits(x, y, component[index]!) || options.blocked?.(x, y, band[index]!)) continue
    chosen.push({ x, y, value: band[index]!, component: component[index]! })
  }
  return chosen.map(({ x, y, value }) => ({ x, y, value }))
}

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const

/**
 * Verschuivingen (in eilandjes-hoogtes) om een plaatsnaam heen, zoals text-variable-anchor van de stadslabels: eerst
 * op de plek, dan erboven/eronder, dan opzij. 1,45 hoogte valt net buiten het botsvak van een naam met padding.
 */
const PLACE_OFFSETS: ReadonlyArray<readonly [number, number]> = [[0, 0], [0, -1.45], [0, 1.45], [0, -2], [0, 2], [2.6, 0], [-2.6, 0], [3.4, 0], [-3.4, 0]]

const FADE_MS = 300
const LAYOUT_INTERVAL_MS = 750
const EARTH_RADIUS = 6378137
/** Standaardmarker van de locatiepin (MapLibre): 27 × 41 px, onderaan verankerd; met wat lucht. */
const PIN_BOX = { halfWidth: 17, above: 45, below: 4 }
/** Bediening boven de kaart (klok, knoppen, legenda, bronvermelding): daar geen getal onder. Het dev-paneel telt niet. */
const MAP_CHROME = '.map-clock, .search-box, .feels-legend, .rain-isoline-legend, .maplibregl-ctrl, button'

/**
 * text-padding van de plaatsnamen in de basiskaart (licht.json/donker.json: 24/18/14/4 px per zoomtrap). Hun
 * botsvak is zo veel groter dan de tekst; zonder aftrek kreeg geen enkele grote stad een getal ernaast.
 */
export function placeNamePaddingPx(zoom: number): number {
  return zoom < 6 ? 24 : zoom < 8 ? 18 : zoom < 10 ? 14 : 4
}
const REGION = { cellPx: 6, insetPx: 14, keepInsetPx: 9, minDistancePx: 44, max: 60 }
const MAX_PLACE_NUMBERS = 60

interface Shown {
  key: string
  lng: number
  lat: number
  /** Waar de waarde gelezen wordt (rastercellen): het midden van het getal, dus een lijn erover laat het omslaan. */
  column: number
  row: number
  value: number
  /** Band onder het midden (k ≤ (T − offset)/stap < k + 1): de kleur van de schijf. */
  band: number
  marker: Marker
  text: HTMLElement
  dying: boolean
}

/** De labelinterface die App per isolijnset aanspreekt; IsolineLabels voldoet er ook aan. */
export interface IsolineLabelling {
  readonly count: number
  setLines(lines: IsolineFeatureCollection, step: number): void
  requestSpawn(): void
  setOpacity(opacity: number): void
  setTheme(theme: MapTheme): void
  clear(): void
  update(slice: FieldSlice, rings?: readonly ShortRing[], now?: number): void
}

/**
 * Getallen met een halo (DOM-markers boven de isolijncanvas, zodat de halo de lijn eronder dempt). Ze wijken voor
 * geplaatste plaatsnamen (queryRenderedFeatures op het vak van het getal), de locatiepin en elkaar.
 */
export class TemperatureNumbers implements IsolineLabelling {
  private shown: Shown[] = []
  private opacity = 0
  private dirty = true
  private lastLayout = -Infinity
  private serial = 0
  private lastSlice?: FieldSlice
  private chrome: Box[] = []
  /** Plaatsnamen staan pas vast als de kaart stilvalt: dan nog één keer opnieuw schikken. */
  private readonly onIdle = () => {
    if (!this.lastSlice) return
    this.dirty = true
    this.update(this.lastSlice)
  }
  private listening = false

  constructor(
    private readonly map: MapLibreMap,
    private readonly grid: Grid,
    private theme: MapTheme,
    private readonly reducedMotion: () => boolean,
    private readonly plan: Required<TemperatureLabelPlan>,
    private readonly tuning: () => LabelTuning,
    private readonly pin: () => { lng: number; lat: number } | undefined,
    /** Schijven in de bandkleur onder de getallen (IsolineLayer.setBubbles). */
    private readonly onBubbles: (bubbles: IsolineBubble[]) => void = () => undefined,
  ) {}

  get count(): number {
    return this.shown.filter((label) => !label.dying).length
  }

  setLines(): void {
    this.dirty = true
  }

  requestSpawn(): void {
    this.dirty = true
  }

  setOpacity(opacity: number): void {
    if (opacity === this.opacity) return
    this.opacity = opacity
    for (const label of this.shown) label.marker.setOpacity(opacity)
  }

  setTheme(theme: MapTheme): void {
    if (theme === this.theme) return
    for (const label of this.shown) label.marker.getElement().classList.replace(`temperature-number-${this.theme}`, `temperature-number-${theme}`)
    this.theme = theme
  }

  clear(): void {
    if (this.listening) this.map.off('idle', this.onIdle)
    this.listening = false
    this.lastSlice = undefined
    for (const label of this.shown) label.marker.remove()
    this.shown = []
    this.dirty = true
    this.onBubbles([])
  }

  update(slice: FieldSlice, _rings: readonly ShortRing[] = [], now = performance.now()): void {
    this.lastSlice = slice
    if (!this.listening) { this.map.on('idle', this.onIdle); this.listening = true }
    for (const label of this.shown) {
      if (label.dying) continue
      const reading = this.readingAt(slice, label.column, label.row)
      if (!reading) { this.kill(label); continue }
      label.band = reading.band
      if (reading.value === label.value) continue
      // Een vlakgetal hoort bij zijn vlak: schuift de rand eroverheen, dan maakt het plaats voor een nieuw getal.
      if (this.plan.numbers === 'vlakken') { this.kill(label); this.dirty = true; continue }
      label.value = reading.value
      label.text.textContent = `${reading.value}°`
    }
    if (this.dirty || now - this.lastLayout >= LAYOUT_INTERVAL_MS) {
      this.dirty = false
      this.lastLayout = now
      this.chrome = this.chromeBoxes()
      if (this.plan.numbers === 'plekken') this.layoutPlaces(slice)
      else this.layoutRegions(slice)
    }
    const size = this.tuning().size
    this.onBubbles(this.shown.filter((label) => !label.dying).map((label) => ({
      lng: label.lng, lat: label.lat, band: label.band, radius: bubbleRadius(`${label.value}°`, size),
    })))
  }

  private layoutPlaces(slice: FieldSlice): void {
    const { clientWidth: width, clientHeight: height } = this.map.getContainer()
    const size = this.tuning().size
    const boxes: Box[] = []
    const wanted = new Map<string, Placed>()
    for (const place of selectTemperaturePlaces(this.map.getZoom(), placeNumberSpacingPx(width, height), TEMPERATURE_NUMBER_PLACES)) {
      if (wanted.size >= MAX_PLACE_NUMBERS) break
      const origin = this.map.project([place.lng, place.lat])
      const step = islandBox('0°', size).height
      for (const [dx, dy] of PLACE_OFFSETS) {
        const x = origin.x + dx * step, y = origin.y + dy * step
        // De waarde onder het getal zelf, niet onder de plek: het getal moet kloppen met het vlak waarin het staat.
        const lngLat = this.map.unproject([x, y])
        const [column, row] = this.toCell(lngLat.lng, lngLat.lat)
        const reading = this.readingAt(slice, column, row)
        if (!reading) continue
        const candidate = boxAt(x, y, islandBox(`${reading.value}°`, size))
        if (!this.free(candidate, boxes, width, height)) continue
        boxes.push(candidate)
        wanted.set(place.name, { lng: lngLat.lng, lat: lngLat.lat, column, row, ...reading })
        break
      }
    }
    this.apply(wanted)
  }

  private layoutRegions(slice: FieldSlice): void {
    const { clientWidth: width, clientHeight: height } = this.map.getContainer()
    const size = this.tuning().size
    const topLeft = this.map.unproject([0, 0]), bottomRight = this.map.unproject([width, height])
    const [left, top] = this.toCell(topLeft.lng, topLeft.lat)
    const [right, bottom] = this.toCell(bottomRight.lng, bottomRight.lat)
    // Mercator en het 3857-rooster zijn lineair in elkaar: scherm-px → cel zonder unproject per monster.
    const sample = (x: number, y: number) => this.valueExact(slice, left + (right - left) * x / width, top + (bottom - top) * y / height)
    const living = this.shown.filter((label) => !label.dying)
    const previous = living.map((label) => {
      const point = this.map.project([label.lng, label.lat])
      return { x: point.x, y: point.y, value: label.value, key: label.key }
    })
    const boxes: Box[] = []
    const chosen = regionNumbers(sample, width, height, {
      ...REGION,
      repeatPx: this.tuning().spacing,
      blocked: (x, y, value) => {
        const box = boxAt(x, y, islandBox(`${value}°`, size))
        if (!this.free(box, boxes, width, height)) return true
        boxes.push(box)
        return false
      },
    }, previous)
    const wanted = new Map<string, Placed>()
    for (const label of chosen) {
      const kept = previous.find((candidate) => candidate.x === label.x && candidate.y === label.y && candidate.value === label.value)
      const lngLat = this.map.unproject([label.x, label.y])
      const [column, row] = this.toCell(lngLat.lng, lngLat.lat)
      const reading = this.readingAt(slice, column, row)
      if (!reading || reading.value !== label.value) continue
      wanted.set(kept?.key ?? `vlak-${++this.serial}`, { lng: lngLat.lng, lat: lngLat.lat, column, row, ...reading })
    }
    this.apply(wanted)
  }

  /** Vrij: binnen beeld, niet over een ander getal, de pin of een geplaatste plaatsnaam. */
  private free(box: Box, boxes: readonly Box[], width: number, height: number): boolean {
    if (box.left < 2 || box.top < 2 || box.right > width - 2 || box.bottom > height - 2) return false
    if (boxes.some((other) => overlaps(box, other, 3)) || this.chrome.some((other) => overlaps(box, other, 4))) return false
    const pin = this.pin()
    if (pin) {
      const point = this.map.project([pin.lng, pin.lat])
      if (overlaps(box, { left: point.x - PIN_BOX.halfWidth, right: point.x + PIN_BOX.halfWidth, top: point.y - PIN_BOX.above, bottom: point.y + PIN_BOX.below }, 0)) return false
    }
    const layers = this.placeLayers()
    if (!layers.length) return true
    const inset = Math.max(0, placeNamePaddingPx(this.map.getZoom()) - 3)
    // Nooit kleiner dan het midden: een omgekeerd vak zou een ander gebied bevragen.
    const x = (box.left + box.right) / 2, y = (box.top + box.bottom) / 2
    const query: [[number, number], [number, number]] = [
      [Math.min(x, box.left + inset), Math.min(y, box.top + inset)],
      [Math.max(x, box.right - inset), Math.max(y, box.bottom - inset)],
    ]
    return !this.map.queryRenderedFeatures(query, { layers }).length
  }

  private chromeBoxes(): Box[] {
    const container = this.map.getContainer()
    const origin = container.getBoundingClientRect()
    const shell = container.closest('.map-shell') ?? container
    return [...shell.querySelectorAll(MAP_CHROME)].flatMap((element) => {
      const rect = element.getBoundingClientRect()
      if (!rect.width || !rect.height) return []
      return [{ left: rect.left - origin.left, right: rect.right - origin.left, top: rect.top - origin.top, bottom: rect.bottom - origin.top }]
    })
  }

  private placeLayers(): string[] {
    return (this.map.getStyle()?.layers ?? []).filter((layer) => layer.type === 'symbol' && layer.id.startsWith('label_')).map((layer) => layer.id)
  }

  private apply(wanted: Map<string, Placed>): void {
    for (const label of this.shown) {
      if (label.dying) continue
      const next = wanted.get(label.key)
      if (!next) { this.kill(label); continue }
      wanted.delete(label.key)
      if (next.lng !== label.lng || next.lat !== label.lat) {
        label.lng = next.lng
        label.lat = next.lat
        label.marker.setLngLat([next.lng, next.lat])
      }
      label.column = next.column
      label.row = next.row
      label.band = next.band
      if (next.value !== label.value) {
        label.value = next.value
        label.text.textContent = `${next.value}°`
      }
    }
    for (const [key, next] of wanted) this.add(key, next)
  }

  private add(key: string, next: Placed): void {
    const element = document.createElement('div')
    element.className = `temperature-number temperature-number-${this.theme}`
    element.setAttribute('aria-hidden', 'true')
    const text = document.createElement('span')
    text.textContent = `${next.value}°`
    element.append(text)
    element.style.opacity = '0'
    if (!this.reducedMotion()) element.style.transition = `opacity ${FADE_MS}ms ease-out`
    const marker = new Marker({ element }).setLngLat([next.lng, next.lat]).setOpacity(this.opacity).addTo(this.map)
    this.shown.push({ key, ...next, marker, text, dying: false })
    requestAnimationFrame(() => { element.style.opacity = '1' })
  }

  private kill(label: Shown): void {
    label.dying = true
    label.marker.getElement().style.opacity = '0'
    window.setTimeout(() => {
      label.marker.remove()
      this.shown = this.shown.filter((candidate) => candidate !== label)
    }, this.reducedMotion() ? 0 : FADE_MS)
  }

  /** Het getal (afgerond) en de band waarin het staat, zoals de shader die kleurt. */
  private readingAt(slice: FieldSlice, column: number, row: number): { value: number; band: number } | undefined {
    const value = this.valueExact(slice, column, row)
    if (value === undefined) return undefined
    return { value: Math.round(value), band: Math.floor((value - this.plan.offset) / TEMPERATURE_ISOLINE_STEP) }
  }

  /** Dezelfde B-spline-snede als de shader, dus het getal klopt met de kleur eronder. */
  private valueExact(slice: FieldSlice, column: number, row: number): number | undefined {
    if (column < 0 || row < 0 || column > slice.width - 1 || row > slice.height - 1) return undefined
    const sample = sampleSlice(slice, column, row)
    return sample.valid < 0.5 ? undefined : sample.value
  }

  private toCell(lng: number, lat: number): [number, number] {
    const x = lng * Math.PI / 180 * EARTH_RADIUS
    const y = EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))
    return [(x - this.grid.x0) / this.grid.dx - 0.5, (y - this.grid.y0) / this.grid.dy - 0.5]
  }
}

interface Box { left: number; top: number; right: number; bottom: number }
interface Placed { lng: number; lat: number; column: number; row: number; value: number; band: number }

/** Straal van de schijf onder een getal in CSS-px: de cijfers (±0,6 em per teken) met wat lucht. */
export function bubbleRadius(label: string, size: number): number {
  return Math.ceil(label.length * size * 0.3 + 4)
}

/** Botsvak van een getal in px (zie .temperature-number): tabelcijfers ±0,6 em, padding 6 × 3 px. */
export function islandBox(label: string, size: number): { width: number; height: number } {
  return { width: Math.ceil(label.length * size * 0.6 + 12), height: Math.ceil(size + 6) }
}

function boxAt(x: number, y: number, box: { width: number; height: number }): Box {
  return { left: x - box.width / 2, right: x + box.width / 2, top: y - box.height / 2, bottom: y + box.height / 2 }
}

function overlaps(a: Box, b: Box, gap: number): boolean {
  return a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap
}
