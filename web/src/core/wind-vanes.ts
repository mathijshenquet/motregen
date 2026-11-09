import { Marker, type Map as MapLibreMap } from 'maplibre-gl'
import type { WindVane } from './wind-beaufort.js'

/** Vaste maat (vlakken), groter (lijnen, zonder vlakken die de klasse al tonen) of pijl naar windkracht. */
export type WindVaneSize = 'vast' | 'groot' | 'windkracht'

interface VaneGeometry { radius: number; arrowLength: number; arrowWidth: number; fontPx: number }

export function vaneGeometry(size: WindVaneSize, force: number): VaneGeometry {
  if (size === 'groot') return { radius: 15, arrowLength: 17, arrowWidth: 3.5, fontPx: 16 }
  if (size === 'windkracht') {
    // 1 Bft een stompje, 5 Bft ruim de cirkel, 8 Bft bijna twee keer: sterkte is in één oogopslag te lezen.
    return { radius: 13, arrowLength: 2 + force * 6, arrowWidth: 1.5 + force * 0.7, fontPx: 14 }
  }
  return { radius: 13, arrowLength: 14, arrowWidth: 3, fontPx: 14 }
}

/**
 * Pad van een pijl die vanaf de cirkelrand naar boven wijst, in een vak met de cirkel in het midden;
 * de hele svg draait daarna naar de windrichting.
 */
export function vaneArrowPath(geometry: VaneGeometry, box: number): string {
  const center = box / 2
  const start = center - geometry.radius + 1
  const tip = center - geometry.radius - geometry.arrowLength
  const head = Math.max(6, geometry.arrowWidth * 2.4)
  const half = geometry.arrowWidth / 2
  const neck = tip + head
  return `M${center - half} ${start}L${center - half} ${neck}L${center - head * 0.75} ${neck}L${center} ${tip}` +
    `L${center + head * 0.75} ${neck}L${center + half} ${neck}L${center + half} ${start}Z`
}

/** Eén marker per plaats: tekst en draaiing worden bijgewerkt, niet opnieuw aangemaakt. */
export class WindVaneMarkers {
  private readonly markers = new Map<string, { marker: Marker; element: HTMLElement; key: string }>()
  private opacity = 0

  constructor(private readonly map: MapLibreMap, private readonly size: WindVaneSize) {}

  setVanes(vanes: readonly WindVane[]): void {
    const seen = new Set<string>()
    for (const vane of vanes) {
      seen.add(vane.name)
      let entry = this.markers.get(vane.name)
      if (!entry) {
        const element = document.createElement('div')
        element.className = 'wind-vane'
        element.setAttribute('aria-hidden', 'true')
        element.style.opacity = String(this.opacity)
        const marker = new Marker({ element }).setLngLat([vane.lng, vane.lat]).addTo(this.map)
        entry = { marker, element, key: '' }
        this.markers.set(vane.name, entry)
      }
      const rotation = Math.round(vane.towardDegrees)
      const key = `${vane.force}|${rotation}`
      if (key === entry.key) continue
      entry.key = key
      this.draw(entry.element, vane.force, rotation)
    }
    for (const [name, entry] of this.markers) {
      if (seen.has(name)) continue
      entry.marker.remove()
      this.markers.delete(name)
    }
  }

  setOpacity(opacity: number): void {
    if (opacity === this.opacity) return
    this.opacity = opacity
    for (const { element } of this.markers.values()) {
      element.style.opacity = String(opacity)
      element.style.visibility = opacity > 0 ? '' : 'hidden'
    }
  }

  get count(): number {
    return this.markers.size
  }

  clear(): void {
    for (const { marker } of this.markers.values()) marker.remove()
    this.markers.clear()
  }

  private draw(element: HTMLElement, force: number, rotation: number): void {
    const geometry = vaneGeometry(this.size, force)
    const box = Math.ceil((geometry.radius + geometry.arrowLength + 4) * 2)
    const center = box / 2
    element.style.width = element.style.height = `${box}px`
    element.style.visibility = this.opacity > 0 ? '' : 'hidden'
    element.innerHTML =
      `<svg width="${box}" height="${box}" viewBox="0 0 ${box} ${box}" style="transform: rotate(${rotation}deg)">` +
      `<path class="wind-vane-arrow" d="${vaneArrowPath(geometry, box)}"/></svg>` +
      `<span class="wind-vane-disc" style="width:${geometry.radius * 2}px;height:${geometry.radius * 2}px;` +
      `left:${center - geometry.radius}px;top:${center - geometry.radius}px;font-size:${geometry.fontPx}px">${force}</span>`
  }
}
