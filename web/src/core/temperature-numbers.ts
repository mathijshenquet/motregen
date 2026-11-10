import { Marker, type Map as MapLibreMap } from 'maplibre-gl'
import type { Grid } from './contract'
import type { MapTheme } from './basemap'
import type { ShortRing } from './isoline-contours'
import { TEMPERATURE_ISOLINE_OFFSET, TEMPERATURE_ISOLINE_STEP, type IsolineFeatureCollection } from './isolines'
import type { IsolineBubble } from './isoline-layer'
import { sampleSlice, type FieldSlice } from './isoline-spline'
import { markLayerDrawn } from './perf'
import { MapLabelPlacer, PLACE_LADDER } from './map-label-placement'
import { mapDiscRadius, viewportMapLabelSize } from './map-labels'
import { MAP_PLACES, mapPlaceSpacingPx, MAX_PLACE_NUMBERS, nestedPlaces } from './map-places'
import type { TemperaturePlace } from './temperature'
import { islandBox, nameBoxWidth } from './place-footprint'

/**
 * Temperatuurgetallen in Gevoel (U100 ronde 3, PO-keuze 2026-11-09 "plekken-half"): een getal op vaste plekken naast
 * de plaatsnaam, op een schijf in de kleur van zijn band; de isolijnen liggen op x,5 °C en zijn ongelabeld, zodat elk
 * vlak één heel getal is en het getal altijd klopt met het vlak waarin het staat.
 */

const FADE_MS = 300
const LAYOUT_INTERVAL_MS = 750
const EARTH_RADIUS = 6378137

interface Shown {
  key: string
  /** Ankerpunt: de plek. */
  lng: number
  lat: number
  /** Vaste schermverschuiving t.o.v. het anker in CSS-px: bij zoomen blijft het getal naast zijn plaatsnaam. */
  dx: number
  dy: number
  /** Gekozen verschuiving (index in PLACE_LADDER); bij de volgende indeling eerst geprobeerd. */
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

/**
 * U114 (`?dev&plekken=orde`): plekken uit de plekkenorde i.p.v. `nestedPlaces`, vast op hun plek (geen ladder, geen
 * uitwijken voor de pin); `named` zet de naam vóór het getal in hetzelfde label (`namen=samen`).
 */
export interface NumberPlaces {
  places(): readonly TemperaturePlace[]
  named(place: TemperaturePlace): boolean
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
  private readonly placer: MapLabelPlacer
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
    pin: () => { lng: number; lat: number } | undefined,
    /** Schijven in de bandkleur onder de getallen (IsolineLayer.setBubbles). */
    private readonly onBubbles: (bubbles: IsolineBubble[]) => void = () => undefined,
    private readonly placeSource?: NumberPlaces,
  ) {
    this.placer = new MapLabelPlacer(map, pin)
  }

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
    if (opacity > 0 && this.shown.length) markLayerDrawn('temperatuurgetallen')
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
      return { lng: label.lng, lat: label.lat, dx: label.dx, dy: label.dy, band, radius: Math.ceil(mapDiscRadius(`${label.value}°`, size)) }
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
    return viewportMapLabelSize()
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
    const ladder = PLACE_LADDER.map(([dx, dy]) => [dx * step, dy * step] as const)
    const wanted = new Map<string, Placed>()
    const previous = new Map(this.shown.filter((label) => !label.dying).map((label) => [label.key, label]))
    this.placer.begin()
    const places = this.placeSource?.places() ?? nestedPlaces(this.map.getZoom(), mapPlaceSpacingPx(width, height), MAP_PLACES)
    for (const place of places) {
      if (wanted.size >= MAX_PLACE_NUMBERS) break
      const origin = this.map.project([place.lng, place.lat])
      const name = this.placeSource?.named(place) ? place.name : undefined
      const key = name ? `${place.name}|naam` : place.name
      const kept = previous.get(key)
      let exact = Number.NaN
      // De maat volgt het getal dat er komt te staan; buiten het dataveld valt een kandidaat af.
      const valueAt = (dx: number, dy: number) => {
        const lngLat = this.map.unproject([origin.x + dx, origin.y + dy])
        const [column, row] = this.toCell(lngLat.lng, lngLat.lat)
        return this.valueExact(slice, column, row)
      }
      const value = kept ? kept.value : this.bandValue(this.bandOf(valueAt(0, 0) ?? 0))
      const box = islandBox(`${value}°`, size)
      // Naam en getal als één label, samen gecentreerd op de plek; het getal (en zijn schijf) is het rechterdeel.
      const nameWidth = name ? nameBoxWidth(name, size) : 0
      const shift = nameWidth / 2
      if (this.placeSource) {
        // Plekkenorde: het label staat vast op de plek; welke plekken samen passen, bepaalt de orde zelf.
        const exactHere = valueAt(shift, 0)
        const width = box.width + nameWidth
        const fixed = { left: origin.x - width / 2, right: origin.x + width / 2, top: origin.y - box.height / 2, bottom: origin.y + box.height / 2 }
        if (exactHere === undefined || !this.placer.shows(origin.x, origin.y, fixed)) continue
        wanted.set(key, { lng: place.lng, lat: place.lat, dx: shift, dy: 0, offsetIndex: 0, exact: exactHere, name })
        continue
      }
      const placed = this.placer.place(origin.x, origin.y, { width: box.width + nameWidth, height: box.height }, ladder, kept?.offsetIndex, (dx, dy) => {
        const sample = valueAt(dx + shift, dy)
        if (sample === undefined) return false
        exact = sample
        return true
      })
      if (!placed) continue
      wanted.set(key, { lng: place.lng, lat: place.lat, dx: placed.dx + shift, dy: placed.dy, offsetIndex: placed.index, exact, name })
    }
    this.apply(wanted, now)
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
    if (this.opacity > 0 && this.shown.length) markLayerDrawn('temperatuurgetallen')
  }

  private add(key: string, next: Placed, now: number): void {
    const element = document.createElement('div')
    element.className = `temperature-number temperature-number-${this.theme}`
    element.setAttribute('aria-hidden', 'true')
    const text = document.createElement('span')
    text.style.setProperty('--map-label-size', `${this.size()}px`)
    element.append(text)
    if (next.name) {
      const name = document.createElement('span')
      name.className = 'temperature-number-name'
      name.style.setProperty('--map-label-size', `${this.size()}px`)
      name.textContent = next.name
      element.append(name)
    }
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

interface Placed { lng: number; lat: number; dx: number; dy: number; offsetIndex: number; exact: number; name?: string }

/** Bandwissel: zo lang vloeit de schijf over (en wisselt het cijfer halverwege). */
const BAND_TWEEN_MS = 280
/** Zo ver (scherm-px) moet een grens het midden van een getal voorbij zijn voor het wisselt. */
const BAND_DEADZONE_PX = 5

export { islandBox, nameBoxWidth } from './place-footprint'
