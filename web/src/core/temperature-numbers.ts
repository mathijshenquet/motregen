import { Marker, type Map as MapLibreMap } from 'maplibre-gl'
import type { Grid } from './contract'
import type { MapTheme } from './basemap'
import type { ShortRing } from './isoline-contours'
import { TEMPERATURE_ISOLINE_OFFSET, TEMPERATURE_ISOLINE_STEP, type IsolineFeatureCollection } from './isolines'
import type { IsolineBubble } from './isoline-layer'
import { sampleSlice, type FieldSlice } from './isoline-spline'
import { temperaturePlaces, type TemperaturePlace } from './temperature'

/**
 * Temperatuurgetallen in Gevoel (U100 ronde 3, PO-keuze 2026-11-09 "plekken-half"): een getal op vaste plekken naast
 * de plaatsnaam, op een schijf in de kleur van zijn band; de isolijnen liggen op x,5 °C en zijn ongelabeld, zodat elk
 * vlak één heel getal is en het getal altijd klopt met het vlak waarin het staat.
 */

/** PO 2026-11-09: 13 px voelt op desktop goed; op de telefoon (kortste zijde < 600 px) één stap kleiner. */
export function temperatureLabelSize(width: number, height: number): number {
  return Math.min(width, height) < 600 ? 12 : 13
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
const MAX_PLACE_NUMBERS = 60

interface Shown {
  key: string
  /** Ankerpunt: de plek. */
  lng: number
  lat: number
  /** Vaste schermverschuiving t.o.v. het anker in CSS-px: bij zoomen blijft het getal naast zijn plaatsnaam. */
  dx: number
  dy: number
  /** Gekozen verschuiving (index in PLACE_OFFSETS); bij de volgende indeling eerst geprobeerd. */
  offsetIndex: number
  value: number
  /** Band van de schijf (k ≤ (T − offset)/stap < k + 1). */
  band: number
  /** Tween naar `band`: vanaf deze band, gestart op dit moment. */
  bandFrom: number
  tweenStart: number
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
 * Getallen op een schijf in hun bandkleur (de schijf tekent de isolijnlaag, zie IsolineLayer.setBubbles), als
 * DOM-markers. Ze wijken voor geplaatste plaatsnamen (queryRenderedFeatures op het vak van het getal), de pin en elkaar.
 */
export class TemperatureNumbers implements IsolineLabelling {
  private shown: Shown[] = []
  private opacity = 0
  private dirty = true
  private lastLayout = -Infinity
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
    if (this.dirty || now - this.lastLayout >= LAYOUT_INTERVAL_MS) {
      this.dirty = false
      this.lastLayout = now
      this.chrome = this.chromeBoxes()
      this.layoutPlaces(slice, now)
    }
    for (const label of this.shown) {
      if (label.dying) continue
      const [column, row] = this.cellOf(label)
      const exact = this.valueExact(slice, column, row)
      if (exact === undefined) { this.kill(label); continue }
      const band = this.bandAfterDeadzone(slice, column, row, exact, label.band)
      if (band === label.band) continue
      label.bandFrom = Math.abs(band - label.band) === 1 && !this.reducedMotion() ? this.tweenedBand(label, now) : band
      label.band = band
      label.tweenStart = now
    }
    const size = this.size()
    let tweening = false
    const bubbles = this.shown.filter((label) => !label.dying).map((label) => {
      const band = this.tweenedBand(label, now)
      if (band !== label.band) tweening = true
      // Het cijfer wisselt halverwege de tween, met de kleur van de schijf mee.
      this.setText(label, this.bandValue(Math.round(band)))
      return { lng: label.lng, lat: label.lat, dx: label.dx, dy: label.dy, band, radius: bubbleRadius(`${label.value}°`, size) }
    })
    this.onBubbles(bubbles)
    // De laag tekent opnieuw bij nieuwe schijven en roept dan weer update aan; zonder wijziging stopt die lus.
    if (tweening) requestAnimationFrame(() => { if (this.lastSlice === slice) this.update(slice) })
  }

  /** Huidige (getweende) band van de schijf: een gebroken waarde tussen twee buurbanden. */
  private tweenedBand(label: Shown, now: number): number {
    const progress = Math.min(1, Math.max(0, (now - label.tweenStart) / BAND_TWEEN_MS))
    if (progress >= 1) return label.band
    const eased = progress * progress * (3 - 2 * progress)
    return label.bandFrom + (label.band - label.bandFrom) * eased
  }

  /**
   * Band met dode zone: pas wisselen als de grens het midden van het getal minstens BAND_DEADZONE_PX voorbij is (in
   * schermpx via de veldgradiënt), anders wipt het getal heen en weer als een lijn er langzaam overheen schuift.
   */
  private bandAfterDeadzone(slice: FieldSlice, column: number, row: number, exact: number, current: number): number {
    const level = (exact - TEMPERATURE_ISOLINE_OFFSET) / TEMPERATURE_ISOLINE_STEP
    const band = Math.floor(level)
    if (band === current || !Number.isFinite(current) || Math.abs(band - current) > 1) return band
    const edge = band > current ? current + 1 : current
    const pxPerCell = Math.abs(this.grid.dx) / (2 * Math.PI * EARTH_RADIUS) * 512 * 2 ** this.map.getZoom()
    const gradient = Math.hypot(
      ((this.valueExact(slice, column + 0.5, row) ?? exact) - (this.valueExact(slice, column - 0.5, row) ?? exact)),
      ((this.valueExact(slice, column, row + 0.5) ?? exact) - (this.valueExact(slice, column, row - 0.5) ?? exact)),
    ) / TEMPERATURE_ISOLINE_STEP / pxPerCell
    if (gradient <= 0) return band
    return Math.abs(level - edge) / gradient >= BAND_DEADZONE_PX ? band : current
  }

  /** Het getal van een band met lijnen op x,5: het bandmidden. */
  private bandValue(band: number): number {
    return Math.round((band + 0.5) * TEMPERATURE_ISOLINE_STEP + TEMPERATURE_ISOLINE_OFFSET)
  }

  private bandOf(exact: number): number {
    return Math.floor((exact - TEMPERATURE_ISOLINE_OFFSET) / TEMPERATURE_ISOLINE_STEP)
  }

  private size(): number {
    return temperatureLabelSize(window.innerWidth, window.innerHeight)
  }

  private setText(label: Shown, value: number): void {
    if (value === label.value) return
    label.value = value
    label.text.textContent = `${value}°`
  }

  private layoutPlaces(slice: FieldSlice, now: number): void {
    const { clientWidth: width, clientHeight: height } = this.map.getContainer()
    const size = this.size()
    const step = islandBox('0°', size).height
    const boxes: Box[] = []
    const wanted = new Map<string, Placed>()
    const previous = new Map(this.shown.filter((label) => !label.dying).map((label) => [label.key, label]))
    for (const place of nestedPlaces(this.map.getZoom(), placeNumberSpacingPx(width, height), TEMPERATURE_NUMBER_PLACES)) {
      if (wanted.size >= MAX_PLACE_NUMBERS) break
      const origin = this.map.project([place.lng, place.lat])
      const kept = previous.get(place.name)
      // Eerst de vorige positie: zo wipt een getal niet van boven naar onder bij elke zoomstap.
      const order = kept ? [kept.offsetIndex, ...PLACE_OFFSETS.keys()].filter((index, at, all) => all.indexOf(index) === at) : [...PLACE_OFFSETS.keys()]
      for (const offsetIndex of order) {
        const [dx, dy] = PLACE_OFFSETS[offsetIndex]!
        const x = origin.x + dx * step, y = origin.y + dy * step
        const lngLat = this.map.unproject([x, y])
        const [column, row] = this.toCell(lngLat.lng, lngLat.lat)
        const exact = this.valueExact(slice, column, row)
        if (exact === undefined) continue
        const value = kept ? kept.value : this.bandValue(this.bandOf(exact))
        const candidate = boxAt(x, y, islandBox(`${value}°`, size))
        if (!this.free(candidate, boxes, width, height)) continue
        boxes.push(candidate)
        wanted.set(place.name, { lng: place.lng, lat: place.lat, dx: dx * step, dy: dy * step, offsetIndex, exact })
        break
      }
    }
    this.apply(wanted, now)
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

  /** Bestaande getallen schuiven mee; hun band en cijfer regelt update (met dode zone en tween). */
  private apply(wanted: Map<string, Placed>, now: number): void {
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
      if (next.dx !== label.dx || next.dy !== label.dy) {
        label.dx = next.dx
        label.dy = next.dy
        label.marker.setOffset([next.dx, next.dy])
      }
      label.offsetIndex = next.offsetIndex
    }
    for (const [key, next] of wanted) this.add(key, next, now)
  }

  private add(key: string, next: Placed, now: number): void {
    const element = document.createElement('div')
    element.className = `temperature-number temperature-number-${this.theme}`
    element.setAttribute('aria-hidden', 'true')
    const text = document.createElement('span')
    element.append(text)
    element.style.opacity = '0'
    if (!this.reducedMotion()) element.style.transition = `opacity ${FADE_MS}ms ease-out`
    const marker = new Marker({ element, offset: [next.dx, next.dy] }).setLngLat([next.lng, next.lat]).setOpacity(this.opacity).addTo(this.map)
    const band = this.bandOf(next.exact)
    const label: Shown = {
      key, lng: next.lng, lat: next.lat, dx: next.dx, dy: next.dy, offsetIndex: next.offsetIndex,
      value: Number.NaN, band, bandFrom: band, tweenStart: now, marker, text, dying: false,
    }
    this.setText(label, this.bandValue(band))
    this.shown.push(label)
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

  /** Rastercel onder het midden van het getal (anker + schermverschuiving). */
  private cellOf(label: Shown): [number, number] {
    if (!label.dx && !label.dy) return this.toCell(label.lng, label.lat)
    const point = this.map.project([label.lng, label.lat])
    const lngLat = this.map.unproject([point.x + label.dx, point.y + label.dy])
    return this.toCell(lngLat.lng, lngLat.lat)
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
interface Placed { lng: number; lat: number; dx: number; dy: number; offsetIndex: number; exact: number }

/** Bandwissel: zo lang vloeit de schijf over (en wisselt het cijfer halverwege). */
const BAND_TWEEN_MS = 280
/** Zo ver (scherm-px) moet een grens het midden van een getal voorbij zijn voor het wisselt. */
const BAND_DEADZONE_PX = 5

/**
 * Geneste keuze van plekken: van grof naar fijn (halve zoomstappen) blijven gekozen plekken staan en komen er alleen
 * plekken bij. Inzoomen voegt dus alleen toe en uitzoomen haalt alleen weg; selectTemperaturePlaces (gretig per
 * zoom) liet plekken bij inzoomen ook verdwijnen.
 */
export function nestedPlaces(zoom: number, spacingPx: number, candidates: readonly TemperaturePlace[]): TemperaturePlace[] {
  const chosen: Array<{ place: TemperaturePlace; x: number; y: number }> = []
  const projected = candidates.map((place) => ({ place, x: place.lng * Math.PI / 180, y: Math.log(Math.tan(Math.PI / 4 + place.lat * Math.PI / 360)) }))
  for (let level = NESTED_FROM_ZOOM; level <= Math.floor(zoom * 2) / 2; level += 0.5) {
    // Radialen op de mercator-eenheidsbol: 512 · 2^z px per 2π.
    const spacing = spacingPx * 2 * Math.PI / (512 * 2 ** level)
    for (const entry of projected) {
      if (chosen.includes(entry)) continue
      if (chosen.every((other) => Math.hypot(other.x - entry.x, other.y - entry.y) >= spacing)) chosen.push(entry)
    }
  }
  return chosen.map(({ place }) => place)
}
const NESTED_FROM_ZOOM = 4


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
