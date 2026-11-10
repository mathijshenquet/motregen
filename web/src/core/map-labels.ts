/**
 * Kaartstijl (U107, docs/kaartstijl.md): één regime voor alle getallen en badges op de kaart, in elke modus, in de
 * app en in de bot. Plaatsnamen komen uit de basiskaart (Noto Sans Regular, glyph-PBF); getallen gebruiken
 * dezelfde letter, gebundeld als subset (`assets/fonts/noto-sans-kaart.woff2`, tools/fonts/build.sh).
 */
import { domRest } from './dom-rest.js'
export const MAP_LABEL_FONT_FAMILY = '"Noto Sans Kaart", "Noto Sans", sans-serif'
/** De naam in de MapLibre-stijl voor symboollagen (dezelfde letter als glyph-PBF). */
export const MAP_LABEL_GLYPH_FONT = 'Noto Sans Regular'

/** Typeschaal (PO-keuze 2026-11-09 "compact", zoals U100): 13 px desktop, 12 px telefoon; de bot neemt de desktopmaat. */
export const MAP_LABEL_SIZES = { phone: 12, desktop: 13 } as const

/** Telefoon: kortste zijde onder 600 CSS-px. */
export function isPhoneMap(width: number, height: number): boolean {
  return Math.min(width, height) < 600
}

/** Lettermaat van elk kaartgetal (temperatuur, gevoel, windbadge) in CSS-px. */
export function mapLabelSize(width: number, height: number): number {
  return MAP_LABEL_SIZES[isPhoneMap(width, height) ? 'phone' : 'desktop']
}

let viewport: [number, number] | undefined
let watchingResize = false

/**
 * `mapLabelSize` voor het venster, voor tekenpaden per frame: innerWidth/innerHeight gecachet tot de volgende `resize`.
 * Lezen dwingt in Gecko een stijl- en layoutflush af als de DOM vuil is; op Firefox Android was dat 46 % van de
 * zaktekening (U111 ronde 4).
 */
export function viewportMapLabelSize(): number {
  if (!domRest) return mapLabelSize(window.innerWidth, window.innerHeight)
  if (!watchingResize) {
    watchingResize = true
    window.addEventListener('resize', () => { viewport = undefined }, { passive: true })
  }
  viewport ??= [window.innerWidth, window.innerHeight]
  return mapLabelSize(viewport[0], viewport[1])
}

/** Inkt en halo van vrijstaande kaartgetallen, gelijk aan de plaatsnamen van de basiskaart. */
export const MAP_LABEL_COLORS = {
  light: { ink: '#102630', halo: '#ffffff' },
  dark: { ink: '#f3fbfd', halo: '#102027' },
} as const
/** Halo rond vrijstaande getallen (MapLibre text-halo-width; DOM en canvas benaderen hem). */
export const MAP_LABEL_HALO_PX = 2

/**
 * Schijf onder een getal (gevoelsschijf in bandkleur, windbadge): één vorm. De straal volgt uit de tekst
 * (±0,6 em per teken plus 4 px lucht) met een ondergrens, zodat één cijfer niet in een te kleine schijf staat:
 * 9,5 px bij 13 px, de windbadge van U101.
 */
export function mapDiscRadius(label: string, size: number): number {
  return Math.max(size * DISC_MIN_EM, label.length * size * 0.3 + 4)
}
export const DISC_MIN_EM = 9.5 / 13

/** Letter in een schijf: drie tekens (km/u) één maat kleiner (10 bij 13 px, U101). */
export function mapDiscFontPx(label: string, size: number): number {
  return label.length > 2 ? Math.round(size * 10 / 13) : size
}
