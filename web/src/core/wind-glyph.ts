/**
 * De windzak van de windmodus (U101, PO koos hem in ronde 2): één vorm voor de kaart, de tabelrij en de bot.
 * Vijf banden oranje-wit vanaf de mast naar waar de wind heen waait. Bij weinig wind is hij kort en smal aan de
 * staart en hangt hij scheef; vanaf 5 Bft staat hij strak en vol (op een vliegveld is elke band ongeveer 3 kn,
 * dus 15 kn ≈ 5 Bft voor een volle zak).
 */
export type GlyphPlace = 'kaart' | 'tabel'

export type Point = readonly [number, number]

export const WINDSOCK_SAMPLES = 20
export const WINDSOCK_BANDS = 5

/** Maten in CSS-px en de verhoudingen van de zak; ook de Rust-renderer leest ze (render-mode-constants). */
export const WINDSOCK_SHAPE = {
  sizes: { kaart: { maxLength: 46, mouth: 16 }, tabel: { maxLength: 20, mouth: 8.5 } },
  /** Bij deze windkracht staat de zak vol. */
  fullForce: 5,
  /** Lengte als deel van maxLength: slap en vol. */
  slackLength: 0.5,
  /** Staartbreedte als deel van de mond: slap, en wat er bij vol bij komt. */
  slackTail: 0.32,
  fullTailGain: 0.24,
  /** Doorbuiging van de slappe zak aan de staart, in radialen (~30°). */
  slackBend: 0.5,
} as const

/**
 * Lagen van de kaartzak voor renderers zonder canvaslijnen (bot, Rust): marges in CSS-px rond de rand.
 * Dezelfde maten als de canvas in de app (rand 3,2 px breed, inkt 1,1 px, schaduw 1,3 px omlaag).
 */
export const WINDSOCK_STYLE = {
  shadow: { margin: 1.75, offsetY: 1.3, alpha: 0.22 },
  halo: { margin: 1.6, light: 0.9, dark: 0.55 },
  ink: 0.55,
  hoopHalfWidth: 1,
  mast: { halo: 3.1, ink: 2.4 },
  orange: '#f2661c', white: '#fbfbf8', inkColor: '#17242b',
} as const

export interface WindsockShape {
  /** Rand links en rechts van de as gezien vanaf de mast, van mond tot staart; de mast ligt in (0, 0). */
  left: Point[]
  right: Point[]
  /** De as zelf, met per punt de schermhoek in graden (met de klok mee vanaf boven). */
  axis: Point[]
  headings: number[]
}

/** Hoe vol de zak staat: 0 bij windstilte, 1 vanaf 5 Bft. */
export function windsockFill(strength: number): number {
  return Math.max(0, Math.min(1, strength / WINDSOCK_SHAPE.fullForce))
}

/**
 * Vorm van de zak. `strength` is de continue windkracht (`beaufortScale`), zodat de zak tussen twee uren
 * vloeiend groeit. `headings` geeft per asstuk (WINDSOCK_SAMPLES + 1 waarden, van mond tot staart) de
 * schermhoek in graden; de slappe doorbuiging bij weinig wind komt daar nog bij.
 */
export function windsockShape(strength: number, headings: readonly number[], place: GlyphPlace): WindsockShape {
  const { maxLength, mouth } = WINDSOCK_SHAPE.sizes[place]
  const filled = windsockFill(strength)
  const length = maxLength * (WINDSOCK_SHAPE.slackLength + (1 - WINDSOCK_SHAPE.slackLength) * filled)
  const tail = mouth * (WINDSOCK_SHAPE.slackTail + WINDSOCK_SHAPE.fullTailGain * filled)
  const slackBend = WINDSOCK_SHAPE.slackBend * (1 - filled)
  const left: Point[] = [], right: Point[] = [], axis: Point[] = [], bent: number[] = []
  let x = 0, y = 0
  for (let index = 0; index <= WINDSOCK_SAMPLES; index++) {
    const t = index / WINDSOCK_SAMPLES
    const heading = headings[index]! * Math.PI / 180 + slackBend * t * t
    const halfWidth = (mouth + (tail - mouth) * t) / 2
    const normalX = Math.cos(heading), normalY = Math.sin(heading)
    axis.push([x, y])
    bent.push(heading * 180 / Math.PI)
    left.push([x - normalX * halfWidth, y - normalY * halfWidth])
    right.push([x + normalX * halfWidth, y + normalY * halfWidth])
    x += Math.sin(heading) * length / WINDSOCK_SAMPLES
    y -= Math.cos(heading) * length / WINDSOCK_SAMPLES
  }
  return { left, right, axis, headings: bent }
}

/** De rand van band `band` (0 = de oranje band aan de mond) als gesloten veelhoek. */
export function windsockBand(shape: WindsockShape, band: number): Point[] {
  const from = Math.round(band * WINDSOCK_SAMPLES / WINDSOCK_BANDS)
  const to = Math.round((band + 1) * WINDSOCK_SAMPLES / WINDSOCK_BANDS)
  return [...shape.left.slice(from, to + 1), ...shape.right.slice(from, to + 1).reverse()]
}

export function windsockOutline(shape: WindsockShape): Point[] {
  return [...shape.left, ...shape.right.slice().reverse()]
}

/**
 * De rand, `margin` naar buiten geschoven, ook voorbij mond en staart: een omlijning of halo als vlak, voor
 * renderers zonder lijnen (de bot).
 */
export function windsockInflated(shape: WindsockShape, margin: number): Point[] {
  const last = shape.axis.length - 1
  const grow = (points: readonly Point[]): Point[] => points.map(([x, y], index) => {
    const [axisX, axisY] = shape.axis[index]!
    const length = Math.hypot(x - axisX, y - axisY) || 1
    const heading = shape.headings[index]! * Math.PI / 180
    // Mond en staart schuiven ook langs de as naar buiten.
    const along = index === 0 ? -margin : index === last ? margin : 0
    return [x + (x - axisX) / length * margin + Math.sin(heading) * along, y + (y - axisY) / length * margin - Math.cos(heading) * along]
  })
  return [...grow(shape.left), ...grow(shape.right).reverse()]
}

/** Waar de badge met het getal op de zak staat: over de mond bij de mast (standaard: de zak blijft heel), of midden op de as. */
export const WINDSOCK_BADGE_POSITIONS = ['midden', 'mond'] as const
export type WindsockBadgePosition = typeof WINDSOCK_BADGE_POSITIONS[number]
export const DEFAULT_WINDSOCK_BADGE: WindsockBadgePosition = 'mond'

export interface WindsockBadge {
  x: number
  y: number
  radius: number
  /** De zak wordt tot hier weggeknipt: de badge plus een smalle kier, zodat ze elkaar niet raken. */
  cutRadius: number
  fontPx: number
}

/**
 * Witte badge met het getal, rechtop (PO 2026-11-09, U101 punt 7: het meedraaiende getal op de banden was niet
 * leesbaar). De plek volgt de zak; drie cijfers (km/u) krijgen een kleinere letter in dezelfde cirkel.
 */
export function windsockBadge(shape: WindsockShape, position: WindsockBadgePosition, label: string): WindsockBadge {
  const [x, y] = shape.axis[position === 'mond' ? 0 : WINDSOCK_SAMPLES / 2]!
  const { radius, gap, fontPx, longFontPx } = WINDSOCK_BADGE
  return { x, y, radius, cutRadius: radius + gap, fontPx: label.length > 2 ? longFontPx : fontPx }
}

/** Maten van de badge in CSS-px; drie cijfers (km/u) krijgen de kleinere letter. */
export const WINDSOCK_BADGE = { radius: 9.5, gap: 2, fontPx: 13, longFontPx: 10 } as const

const round = (value: number) => Math.round(value * 100) / 100
const pathOf = (points: readonly Point[]) => `M${points.map(([x, y]) => `${round(x)} ${round(y)}`).join('L')}Z`

/** De zak klein in de tabelrij: recht, zonder getal (dat staat ernaast), het midden van de zak in het midden. */
export function windsockSvg(strength: number, towardDegrees: number, className = ''): string {
  const box = 24
  const shape = windsockShape(strength, Array<number>(WINDSOCK_SAMPLES + 1).fill(0), 'tabel')
  const [tipX, tipY] = shape.axis.at(-1)!
  const offsetX = box / 2 - tipX / 2, offsetY = box / 2 - tipY / 2
  const shift = (points: readonly Point[]): Point[] => points.map(([x, y]) => [x + offsetX, y + offsetY])
  let body = ''
  for (let band = 0; band < WINDSOCK_BANDS; band++) {
    body += `<path class="${band % 2 ? 'sock-white' : 'sock-orange'}" d="${pathOf(shift(windsockBand(shape, band)))}"/>`
  }
  body += `<path class="glyph-ink-line sock-outline" d="${pathOf(shift(windsockOutline(shape)))}" stroke-width="0.9"/>`
  const [mouthLeft, mouthRight] = shift([shape.left[0]!, shape.right[0]!])
  body += `<path class="glyph-ink-line" d="M${round(mouthLeft![0])} ${round(mouthLeft![1])}L${round(mouthRight![0])} ${round(mouthRight![1])}" stroke-width="1.4"/>`
  body += `<circle class="glyph-ink" cx="${round(offsetX)}" cy="${round(offsetY)}" r="1.9"/>`
  return `<svg class="wind-glyph wind-glyph-windzak ${className}" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}" ` +
    `style="transform: rotate(${Math.round(towardDegrees)}deg)" aria-hidden="true">${body}</svg>`
}
