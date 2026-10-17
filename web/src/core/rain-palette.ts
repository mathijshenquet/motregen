import type { MapTheme } from './map-theme.js'

export type Rgb = readonly [red: number, green: number, blue: number]

export const RAIN_PALETTES = ['huidig', 'violet-laat'] as const
export type RainPaletteName = typeof RAIN_PALETTES[number]

export const RAIN_BLENDS = ['huidig', 'rand'] as const
export type RainBlendName = typeof RAIN_BLENDS[number]

// Isolijnen binnen de regen (proef onder ?dev › Regen, PO 2026-10-16: "zullen we nog meer mm/h isolijnen
// toevoegen?"). kleurgrenzen: lichte regen, matige regen (2 mm/u, PO 2026-10-16; was 4, waar blauw violet wordt), waar rood begint.
// klassen volgt de WMO-indeling licht/matig/zwaar/zeer zwaar.
export const RAIN_ISOLINE_SETS = ['kleurgrenzen', 'klassen', 'dicht', 'geen'] as const
export type RainIsolineSetName = typeof RAIN_ISOLINE_SETS[number]
export const RAIN_ISOLINE_RATES: Record<RainIsolineSetName, readonly number[]> = {
  kleurgrenzen: [1, 2, 13],
  klassen: [2.5, 10, 50],
  dicht: [0.5, 1, 2, 5, 10, 20],
  geen: [],
}

export interface RainLook {
  palette: RainPaletteName
  blend: RainBlendName
  theme: MapTheme
  /** Weggelaten = `DEFAULT_RAIN_CONTRAST`. Telt alleen bij een menging met een dekkende inzet. */
  contrast?: typeof DEFAULT_RAIN_CONTRAST
  /** Weggelaten = geen isolijnen binnen de regen; telt alleen bij een menging met contour. */
  isolines?: RainIsolineSetName
}

/** De overgebleven regenknop; palet en menging staan vast. */
export type RainLookChoice = Pick<RainLook, 'isolines'>

// U89, PO 2026-10-17: violet-laat, rand en contrast 0 vastgezet op de bestaande productwaarden.
export const DEFAULT_RAIN_CONTRAST = 0
export const DEFAULT_RAIN_LOOK: RainLook = { palette: 'violet-laat', blend: 'rand', theme: 'light', contrast: DEFAULT_RAIN_CONTRAST, isolines: 'kleurgrenzen' }

/**
 * Het regenbeeld van vóór U77. De bot rendert hier nog mee: zijn compositor bootst de oude canvas na (α² als alfa)
 * en kent één tabel voor dag en nacht, dus met het nieuwe product zou hij harde witte vlekken tekenen en 's nachts
 * het dagpalet. Zodra de bot (of de Rust-renderer, U76) echte alfa-over en een tabel per thema heeft kan dit weg.
 */
export const PRE_U77_RAIN_LOOK: RainLook = { palette: 'huidig', blend: 'huidig', theme: 'light' }

export const RAIN_LOOK_STORAGE_KEYS = {
  isolines: 'motregen-dev-regenisolijnen',
} as const

/** Byte van een regenintensiteit (mm/u) in de mrf v0-regentabel (docs/mrf.md); niet afgerond. */
export function rainRateIndex(rate: number): number {
  return 1 + 253 * Math.log(rate / 0.01) / Math.log(150 / 0.01)
}

// De lichtste regen in de data: de radar kent geen waarden onder 0,1 mm/u (gemeten in U77: geen enkele byte
// onder 55). Alles daaronder op het scherm komt van het gladstrijken tussen droog en regen.
const ONSET_RATE = 0.1
export const ONSET_INDEX = Math.round(rainRateIndex(ONSET_RATE))
const LIGHT_BAND_END_INDEX = Math.round(rainRateIndex(2.5))
/** De hoogste geldige byte; 255 is "geen data" en blijft doorzichtig. */
const LAST_RAIN_INDEX = 254

interface PaletteStop {
  index: number
  colour: Rgb
}

function stopAt(rate: number, colour: Rgb): PaletteStop {
  return { index: rainRateIndex(rate), colour }
}

// Het palet van vóór U77, op zijn oorspronkelijke bytes.
const CURRENT_STOPS: PaletteStop[] = [
  { index: 0, colour: [54, 183, 255] },
  { index: 55, colour: [54, 183, 255] },
  { index: 105, colour: [31, 231, 190] },
  { index: 150, colour: [255, 222, 44] },
  { index: 195, colour: [255, 82, 35] },
  { index: 235, colour: [188, 45, 214] },
  { index: 255, colour: [188, 45, 214] },
]

// Het blauw van de lichte band van violet-laat. Overdag azuur in plaats van hemelsblauw: het
// water van de kaart is zelf lichtblauw-paars (158, 189, 255) en een tint die daar vandaan draait steekt beter af.
// 's Nachts loopt het blauw juist op in helderheid: op de donkere kaart is lichter "meer".
const DAY_LIGHT_BLUE: Rgb = [64, 152, 238]
const DAY_BLUE: Rgb = [34, 92, 216]
const NIGHT_BLUE: Rgb = [66, 120, 214]

/**
 * Het verloop lichtblauw → blauw → violet → rood → bordeaux. Violet
 * lijkt zonder rood- of groengevoelige kegeltjes op blauw, dus het verschilt ook in helderheid van het blauw:
 * overdag duidelijk donkerder, 's nachts duidelijk lichter.
 */
function violetGradient(): Record<MapTheme, PaletteStop[]> {
  return {
    light: [
      stopAt(0.1, DAY_LIGHT_BLUE),
      stopAt(4, DAY_BLUE),
      stopAt(7, [74, 28, 148]),
      stopAt(9, [110, 16, 110]),
      stopAt(13, [214, 36, 52]),
      stopAt(40, [140, 12, 40]),
      stopAt(120, [84, 4, 44]),
    ],
    dark: [
      stopAt(0.1, NIGHT_BLUE),
      stopAt(4, [84, 144, 236]),
      stopAt(7, [132, 56, 228]),
      stopAt(9, [204, 48, 196]),
      stopAt(13, [250, 84, 88]),
      stopAt(40, [255, 144, 134]),
      stopAt(120, [255, 212, 204]),
    ],
  }
}

// Een palet heeft per kaartthema een eigen reeks: op de lichte kaart moet zware regen donker of verzadigd zijn,
// op de donkere kaart juist licht. De grenzen licht/matig/zwaar (2,5 en 7,5 mm/u) zijn die van het histogram.
const PALETTE_STOPS: Record<RainPaletteName, Record<MapTheme, PaletteStop[]>> = {
  'huidig': { light: CURRENT_STOPS, dark: CURRENT_STOPS },
  // Blauw tot ongeveer 5 mm/u, violet rond 7, rood vanaf ruim 10. De kleuren vallen dan niet meer op onze klassen
  // licht/matig/zwaar (2,5 en 7,5): het grootste deel van matig is nog blauw.
  'violet-laat': violetGradient(),
}

interface BlendShape {
  /**
   * Bytes waartussen de dekking van nul naar de inzetdekking `alpha` loopt: de dekking van de lichtste zichtbare
   * regen. Zonder inzet loopt de dekking vanaf byte 0 lineair op, zoals vóór U77.
   */
  onsetEdge?: { from: number; to: number; alpha: number }
  /** Echte alfa-over. Uit = de canvas draagt α² als alfa en telt onder halve dekking licht op bij de kaart. */
  straightAlpha: boolean
  /** Dunne contour op de rand van het regengebied. */
  outline: boolean
}

// Halverwege droog (byte 0) en de lichtste regen in de data: daar ligt na het gladstrijken de rand van de data zelf.
const DATA_EDGE_INDEX = ONSET_INDEX / 2
// Bewust niet hoger dan 0,55: het weermodel heeft brede velden motregen, en op 0,7 werd dat een dichte plaat waar
// plaatsnamen en grenzen onder verdwenen.
const ONSET_ALPHA = 0.55
const THRESHOLD_EDGE = { from: DATA_EDGE_INDEX - 6, to: DATA_EDGE_INDEX + 6, alpha: ONSET_ALPHA }
const BLEND_SHAPES: Record<RainBlendName, BlendShape> = {
  'huidig': { straightAlpha: false, outline: false },
  'rand': { onsetEdge: THRESHOLD_EDGE, straightAlpha: true, outline: true },
}

const GRADUAL_ALPHA_PER_INDEX = 1.6
const FULL_ALPHA = 210
/** Dekking (0–1) van de lichtste zichtbare regen; `undefined` voor een menging zonder inzet. */
export function rainOnsetAlpha(blend: RainBlendName): number | undefined {
  return BLEND_SHAPES[blend].onsetEdge?.alpha
}

function alphaAt(index: number, shape: BlendShape): number {
  const gradual = Math.min(FULL_ALPHA, Math.round(index * GRADUAL_ALPHA_PER_INDEX))
  const edge = shape.onsetEdge
  if (!edge) return gradual
  if (index <= edge.from) return 0
  const onsetAlpha = Math.round(edge.alpha * 255)
  if (index >= edge.to) return Math.max(onsetAlpha, gradual)
  const progress = (index - edge.from) / (edge.to - edge.from)
  const eased = progress * progress * (3 - 2 * progress)
  return Math.round(onsetAlpha * eased)
}

function colourAt(stops: PaletteStop[], index: number): Rgb {
  const first = stops[0]!
  const last = stops[stops.length - 1]!
  if (index <= first.index) return first.colour
  if (index >= last.index) return last.colour
  const upperPosition = stops.findIndex((stop) => stop.index >= index)
  const lower = stops[upperPosition - 1]!
  const upper = stops[upperPosition]!
  return mixColours(lower.colour, upper.colour, (index - lower.index) / (upper.index - lower.index))
}

function mixColours(from: Rgb, to: Rgb, share: number): Rgb {
  return [
    Math.round(from[0] + (to[0] - from[0]) * share),
    Math.round(from[1] + (to[1] - from[1]) * share),
    Math.round(from[2] + (to[2] - from[2]) * share),
  ]
}

// --- Contrast met de kaart -------------------------------------------------------------------------------------

export type Ground = 'land' | 'water' | 'urban'

/**
 * De ondergronden van de basiskaart waar regen op moet afsteken (`public/basemap/licht.json` en `donker.json`):
 * achtergrond, water en bebouwing zoals die op zoom ≤ 9 over de achtergrond ligt. De test leest de stijlen zelf en
 * faalt als deze waarden ervan afwijken.
 */
export const GROUND_COLOURS: Record<MapTheme, Record<Ground, Rgb>> = {
  light: { land: [248, 244, 240], water: [158, 189, 255], urban: [223, 220, 220] },
  dark: { land: [16, 29, 33], water: [24, 55, 70], urban: [38, 48, 44] },
}

/** CIE L* van een sRGB-kleur. */
export function lightness(colour: Rgb): number {
  const linear = (channel: number) => {
    const share = channel / 255
    return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * linear(colour[0]) + 0.7152 * linear(colour[1]) + 0.0722 * linear(colour[2])
  return luminance > 0.008856 ? 116 * Math.cbrt(luminance) - 16 : 903.3 * luminance
}

/** De kleur op het scherm als `colour` met dekking `alpha` (0–1) over `ground` ligt (echte alfa-over). */
export function colourOverGround(colour: Rgb, alpha: number, ground: Rgb): Rgb {
  return mixColours(ground, colour, alpha)
}

/**
 * Helderheidsverschil in de richting die het thema vraagt: overdag hoe veel donkerder dan de ondergrond,
 * 's nachts hoe veel lichter. Negatief = de verkeerde kant op.
 */
export function groundContrast(colour: Rgb, alpha: number, theme: MapTheme, ground: Ground): number {
  const groundColour = GROUND_COLOURS[theme][ground]
  const difference = lightness(colourOverGround(colour, alpha, groundColour)) - lightness(groundColour)
  return theme === 'light' ? -difference : difference
}

function hasGroundContrast(colour: Rgb, alpha: number, theme: MapTheme): boolean {
  const grounds = Object.keys(GROUND_COLOURS[theme]) as Ground[]
  return grounds.every((ground) => groundContrast(colour, alpha, theme, ground) >= DEFAULT_RAIN_CONTRAST)
}

const CONTRAST_SHIFT_STEPS = 200

/**
 * De contrastregel: hoe ver een kleur moet opschuiven (0–1; overdag naar zwart, 's nachts naar wit) tot hij met
 * dekking `alpha` op land, water én bebouwing minstens de vaste contrastlat haalt. Regen maakt de kaart
 * daardoor overdag altijd donkerder en 's nachts altijd lichter.
 */
function contrastShiftFor(colour: Rgb, alpha: number, theme: MapTheme): number {
  for (let step = 0; step < CONTRAST_SHIFT_STEPS; step++) {
    const shift = step / CONTRAST_SHIFT_STEPS
    if (hasGroundContrast(shiftedColour(colour, theme, shift), alpha, theme)) return shift
  }
  return 1
}

function shiftedColour(colour: Rgb, theme: MapTheme, shift: number): Rgb {
  return mixColours(colour, theme === 'light' ? [0, 0, 0] : [255, 255, 255], shift)
}

// --- De tabel ----------------------------------------------------------------------------------------------------

/** RGBA per byte (256 × 4): de opzoektabel van de regenlaag en de bron van de histogramkleuren. */
export function buildRainColormap(look: RainLook): Uint8Array {
  const stops = PALETTE_STOPS[look.palette][look.theme]
  const shape = BLEND_SHAPES[look.blend]
  // De inzetdekking zoals hij in de tabel komt (een byte): 0,55 wordt 140/255, en op dat verschil haalde de rand
  // een scherpe lat net niet. Zonder dekkende inzet loopt de dekking vanaf nul op en bestaat er geen "lichtste
  // zichtbare regen" om te borgen.
  const onsetAlpha = shape.onsetEdge ? Math.round(shape.onsetEdge.alpha * 255) / 255 : undefined
  const onsetShift = onsetAlpha === undefined ? 0 : contrastShiftFor(colourAt(stops, ONSET_INDEX), onsetAlpha, look.theme)
  const colormap = new Uint8Array(256 * 4)
  for (let index = 0; index <= LAST_RAIN_INDEX; index++) {
    const alpha = alphaAt(index, shape)
    const paletteColour = colourAt(stops, index)
    const shift = onsetAlpha === undefined ? 0 : lightBandShift(paletteColour, index, alpha / 255, { alpha: onsetAlpha, shift: onsetShift }, look.theme)
    colormap.set(shiftedColour(paletteColour, look.theme, shift), index * 4)
    colormap[index * 4 + 3] = alpha
  }
  return colormap
}

/**
 * De verschuiving van één tabelingang: de kleinste waarmee deze kleur de regel haalt. Tot de inzet gerekend met de
 * inzetdekking (in de oploop van de rand is de dekking lager, maar de rand is geen vlak). Daarboven met de eigen
 * dekking: meer regen is donkerder en dekkender en heeft minder nodig. Wat een palet in de lichte band niet kan
 * halen (het geel van `huidig` blijft licht) begrenst de uitloop, zodat matig en zwaar het palet houden en er geen
 * sprong ontstaat op 2,5 mm/u.
 */
function lightBandShift(paletteColour: Rgb, index: number, alpha: number, onset: { alpha: number; shift: number }, theme: MapTheme): number {
  if (index >= LIGHT_BAND_END_INDEX) return 0
  const needed = contrastShiftFor(paletteColour, Math.max(alpha, onset.alpha), theme)
  if (index <= ONSET_INDEX) return needed
  const progress = (index - ONSET_INDEX) / (LIGHT_BAND_END_INDEX - ONSET_INDEX)
  // Kwadratisch: de begrenzing blijft lang ruim, zodat een palet dat de regel wél kan halen er niet tegenaan loopt.
  const limit = onset.shift * (1 - progress * progress)
  return Math.min(needed, limit)
}

/** Of de regencanvas met echte alfa-over mengt (zie `BlendShape.straightAlpha`). */
export function rainUsesStraightAlpha(blend: RainBlendName): boolean {
  return BLEND_SHAPES[blend].straightAlpha
}

export interface RainOutline {
  /**
   * De byte waarop de contour ligt. Een halve byte: het veld bestaat uit hele bytes, dus een vlak stuk veld ligt
   * er nooit precies op en wordt geen dikke vlek lijn.
   */
  index: number
  colour: Rgb
  /** Hoe sterk de lijn over de regenkleur ligt (0–1). */
  strength: number
  /** Halve lijndikte in schermpixels. */
  halfWidth: number
}

const OUTLINE_SHIFT = 0.3
const BOUNDARY_STRENGTH = 0.55
// Binnenlijnen lichter en dunner dan de buitenrand: ze tekenen de vorm van een bui zonder het beeld druk te maken.
const ISOLINE_STRENGTH = 0.32
const ISOLINE_SHIFT = 0.35

/** De contour om het regengebied: de beginkleur, nog een stap verder van de kaart af. */
export function rainOutline(look: RainLook): RainOutline | undefined {
  if (!BLEND_SHAPES[look.blend].outline) return undefined
  const colormap = buildRainColormap(look)
  const onsetColour: Rgb = [colormap[ONSET_INDEX * 4]!, colormap[ONSET_INDEX * 4 + 1]!, colormap[ONSET_INDEX * 4 + 2]!]
  return { index: Math.floor(DATA_EDGE_INDEX) + 0.5, colour: shiftedColour(onsetColour, look.theme, OUTLINE_SHIFT), strength: BOUNDARY_STRENGTH, halfWidth: 1.2 }
}

/** De buitenrand plus de isolijnen binnen de regen, elk in de regenkleur op die intensiteit, een stap donkerder. */
export function rainOutlines(look: RainLook): RainOutline[] {
  const boundary = rainOutline(look)
  if (!boundary) return []
  const colormap = buildRainColormap(look)
  const isolines = RAIN_ISOLINE_RATES[look.isolines ?? 'geen'].map((rate): RainOutline => {
    const index = Math.floor(rainRateIndex(rate)) + 0.5
    const byte = Math.round(index)
    const colour: Rgb = [colormap[byte * 4]!, colormap[byte * 4 + 1]!, colormap[byte * 4 + 2]!]
    return { index, colour: shiftedColour(colour, look.theme, ISOLINE_SHIFT), strength: ISOLINE_STRENGTH, halfWidth: 0.9 }
  })
  return [boundary, ...isolines]
}

type LookStorage = Pick<Storage, 'getItem'>

export function loadRainLookChoice(storage: LookStorage = localStorage): RainLookChoice {
  const storedIsolines = storage.getItem(RAIN_LOOK_STORAGE_KEYS.isolines) as RainIsolineSetName
  return {
    isolines: RAIN_ISOLINE_SETS.includes(storedIsolines) ? storedIsolines : DEFAULT_RAIN_LOOK.isolines,
  }
}
