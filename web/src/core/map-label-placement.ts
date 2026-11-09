import type { Map as MapLibreMap } from 'maplibre-gl'

/**
 * Eén uitwijkregel voor alle kaartgetallen en windzakken (U107, docs/kaartstijl.md): een label staat op de eerste
 * vrije plek uit een vaste ladder rond zijn anker (de vorige plek eerst, zodat het niet heen en weer springt) en
 * is vrij als het binnen beeld ligt en niet over een geplaatste plaatsnaam, de locatiepin, de bediening of een
 * eerder label valt. Geen vrije plek: het label vervalt.
 */
export interface Box { left: number; top: number; right: number; bottom: number }
export type Offset = readonly [number, number]

/**
 * Ladder in labelhoogtes, zoals text-variable-anchor van de stadslabels: eerst op de plek, dan erboven/eronder, dan
 * opzij. 1,45 hoogte valt net buiten het botsvak van een naam met padding.
 */
export const PLACE_LADDER: readonly Offset[] = [[0, 0], [0, -1.45], [0, 1.45], [0, -2], [0, 2], [2.6, 0], [-2.6, 0], [3.4, 0], [-3.4, 0]]

/** Standaardmarker van de locatiepin (MapLibre): 27 × 41 px, onderaan verankerd; met wat lucht. */
export const PIN_BOX = { halfWidth: 17, above: 45, below: 4 } as const
/** Bediening boven de kaart (klok, knoppen, legenda, bronvermelding): daar geen label onder. Het dev-paneel telt niet. */
export const MAP_CHROME = '.map-clock, .search-box, .map-legend, .maplibregl-ctrl, .map-brand, button'

/**
 * text-padding van de plaatsnamen in de basiskaart (licht.json/donker.json: 24/18/14/4 px per zoomtrap). Hun
 * botsvak is zo veel groter dan de tekst; zonder aftrek kreeg geen enkele grote stad een getal ernaast.
 */
export function placeNamePaddingPx(zoom: number): number {
  return zoom < 6 ? 24 : zoom < 8 ? 18 : zoom < 10 ? 14 : 4
}

export function boxAt(x: number, y: number, size: { width: number; height: number }): Box {
  return { left: x - size.width / 2, right: x + size.width / 2, top: y - size.height / 2, bottom: y + size.height / 2 }
}

export function overlaps(a: Box, b: Box, gap: number): boolean {
  return a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap
}

export interface Placement { dx: number; dy: number; index: number }

export class MapLabelPlacer {
  private chrome: Box[] = []
  private layers: string[] = []
  private taken: Box[] = []
  private pinBox?: Box
  private width = 0
  private height = 0

  constructor(private readonly map: MapLibreMap, private readonly pin: () => { lng: number; lat: number } | undefined) {}

  /** Nieuwe indeling: bediening, pin en namen opnieuw opmeten; nog niets geplaatst. */
  begin(): void {
    const container = this.map.getContainer()
    this.width = container.clientWidth
    this.height = container.clientHeight
    this.chrome = chromeBoxes(container)
    this.layers = (this.map.getStyle()?.layers ?? []).filter((layer) => layer.type === 'symbol' && layer.id.startsWith('label_')).map((layer) => layer.id)
    this.taken = []
    this.pinBox = pinBox(this.map, this.pin())
  }

  /**
   * Eerste vrije verschuiving (CSS-px) uit `ladder` voor een label met deze maat rond schermpunt (x, y); `prefer` (een
   * index) gaat voor. `accept` kan een kandidaat afwijzen (bijv. buiten het dataveld). Een geplaatst label houdt
   * zijn vak bezet voor de volgende.
   */
  place(x: number, y: number, size: { width: number; height: number }, ladder: readonly Offset[], prefer?: number, accept?: (dx: number, dy: number) => boolean): Placement | undefined {
    const order = prefer !== undefined && prefer < ladder.length ? [prefer, ...ladder.keys()].filter((index, at, all) => all.indexOf(index) === at) : [...ladder.keys()]
    for (const index of order) {
      const [dx, dy] = ladder[index]!
      const box = boxAt(x + dx, y + dy, size)
      if (!this.free(box)) continue
      if (accept && !accept(dx, dy)) continue
      this.taken.push(box)
      return { dx, dy, index }
    }
    return undefined
  }

  free(box: Box): boolean {
    if (box.left < 2 || box.top < 2 || box.right > this.width - 2 || box.bottom > this.height - 2) return false
    if (this.taken.some((other) => overlaps(box, other, 3)) || this.chrome.some((other) => overlaps(box, other, 4))) return false
    if (this.pinBox && overlaps(box, this.pinBox, 0)) return false
    if (!this.layers.length) return true
    const inset = Math.max(0, placeNamePaddingPx(this.map.getZoom()) - 3)
    // Nooit kleiner dan het midden: een omgekeerd vak zou een ander gebied bevragen.
    const x = (box.left + box.right) / 2, y = (box.top + box.bottom) / 2
    const query: [[number, number], [number, number]] = [
      [Math.min(x, box.left + inset), Math.min(y, box.top + inset)],
      [Math.max(x, box.right - inset), Math.max(y, box.bottom - inset)],
    ]
    return !this.map.queryRenderedFeatures(query, { layers: this.layers }).length
  }
}

export function pinBox(map: MapLibreMap, pin: { lng: number; lat: number } | undefined): Box | undefined {
  if (!pin) return undefined
  const point = map.project([pin.lng, pin.lat])
  return { left: point.x - PIN_BOX.halfWidth, right: point.x + PIN_BOX.halfWidth, top: point.y - PIN_BOX.above, bottom: point.y + PIN_BOX.below }
}

export function chromeBoxes(container: HTMLElement): Box[] {
  const origin = container.getBoundingClientRect()
  const shell = container.closest('.map-shell') ?? container
  return [...shell.querySelectorAll(MAP_CHROME)].flatMap((element) => {
    const rect = element.getBoundingClientRect()
    if (!rect.width || !rect.height) return []
    return [{ left: rect.left - origin.left, right: rect.right - origin.left, top: rect.top - origin.top, bottom: rect.bottom - origin.top }]
  })
}
