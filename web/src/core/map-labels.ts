/**
 * Kaartstijl (U107, docs/kaartstijl.md): één regime voor alle getallen en badges op de kaart, in elke modus, in de
 * app en in de bot. Plaatsnamen komen uit de basiskaart (Noto Sans Regular, glyph-PBF); getallen gebruiken
 * dezelfde letter, gebundeld als subset (`assets/fonts/noto-sans-kaart.woff2`, tools/fonts/build.sh).
 */
export const MAP_LABEL_FONT_FAMILY = '"Noto Sans Kaart", "Noto Sans", sans-serif'
/** De naam in de MapLibre-stijl voor symboollagen (dezelfde letter als glyph-PBF). */
export const MAP_LABEL_GLYPH_FONT = 'Noto Sans Regular'

/** Typeschaal: `compact` is de PO-keuze van U100 (13 px desktop, 12 telefoon); `ruim` één stap groter. */
export const MAP_LABEL_REGIMES = {
  compact: { phone: 12, desktop: 13 },
  ruim: { phone: 13, desktop: 14 },
} as const
export type MapLabelRegime = keyof typeof MAP_LABEL_REGIMES
export const DEFAULT_MAP_LABEL_REGIME: MapLabelRegime = 'compact'

/** Alleen `?dev&regime=`: de typeschaalstap (U107, nog niet gekozen). */
export function mapLabelRegime(params: URLSearchParams): MapLabelRegime {
  const value = params.has('dev') ? params.get('regime') : null
  return value && value in MAP_LABEL_REGIMES ? value as MapLabelRegime : DEFAULT_MAP_LABEL_REGIME
}

/** Telefoon: kortste zijde onder 600 CSS-px. */
export function isPhoneMap(width: number, height: number): boolean {
  return Math.min(width, height) < 600
}

/** Lettermaat van elk kaartgetal (temperatuur, gevoel, windbadge) in CSS-px. */
export function mapLabelSize(width: number, height: number, regime: MapLabelRegime = DEFAULT_MAP_LABEL_REGIME): number {
  return MAP_LABEL_REGIMES[regime][isPhoneMap(width, height) ? 'phone' : 'desktop']
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
