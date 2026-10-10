import type { MapTheme } from './map-theme.js'

// U77-proef (?dev › Kaart › Regenpalet en Regenmenging; eigenaar U77, vervalt 2026-10-17). Het product is
// `DEFAULT_RAIN_LOOK`: daarmee geeft `buildRainColormap` byte voor byte de tabel van vóór U77.

export type Rgb = readonly [red: number, green: number, blue: number]

export const RAIN_PALETTES = ['huidig', 'blauw-grijs-rood', 'blauw-violet-rood', 'oplopend-donker'] as const
export type RainPaletteName = typeof RAIN_PALETTES[number]

export const RAIN_BLENDS = ['huidig', 'zuiver', 'steil', 'drempel', 'rand'] as const
export type RainBlendName = typeof RAIN_BLENDS[number]

export interface RainLook {
  palette: RainPaletteName
  blend: RainBlendName
  theme: MapTheme
}

/** Wat de knoppen kiezen; het thema volgt de kaart. */
export type RainLookChoice = Pick<RainLook, 'palette' | 'blend'>

export const DEFAULT_RAIN_LOOK: RainLook = { palette: 'huidig', blend: 'huidig', theme: 'light' }

export const RAIN_LOOK_STORAGE_KEYS = {
  palette: 'motregen-dev-regenpalet',
  blend: 'motregen-dev-regenmenging',
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

// Het blauw van de lichte band, gedeeld door de drie blauwe paletten. Overdag azuur in plaats van hemelsblauw: het
// water van de kaart is zelf lichtblauw-paars (158, 189, 255) en een tint die daar vandaan draait steekt beter af.
// 's Nachts loopt het blauw juist op in helderheid: op de donkere kaart is lichter "meer".
const DAY_LIGHT_BLUE: Rgb = [64, 152, 238]
const DAY_BLUE: Rgb = [34, 92, 216]
const NIGHT_BLUE: Rgb = [66, 120, 214]
const NIGHT_LIGHT_BLUE: Rgb = [118, 178, 250]

// Een palet heeft per kaartthema een eigen reeks: op de lichte kaart moet zware regen donker of verzadigd zijn,
// op de donkere kaart juist licht. De grenzen licht/matig/zwaar (2,5 en 7,5 mm/u) zijn die van het histogram.
const PALETTE_STOPS: Record<RainPaletteName, Record<MapTheme, PaletteStop[]>> = {
  'huidig': { light: CURRENT_STOPS, dark: CURRENT_STOPS },
  // PO 2026-10-10: lichtblauw → blauw → grijs → rood. Licht = blauw, matig = grijs, zwaar = rood.
  'blauw-grijs-rood': {
    light: [
      stopAt(0.1, DAY_LIGHT_BLUE),
      stopAt(1.2, DAY_BLUE),
      stopAt(3.5, [84, 92, 116]),
      stopAt(6.5, [58, 60, 72]),
      stopAt(11, [208, 36, 44]),
      stopAt(40, [140, 12, 40]),
      stopAt(120, [84, 4, 44]),
    ],
    dark: [
      stopAt(0.1, NIGHT_BLUE),
      stopAt(1.2, NIGHT_LIGHT_BLUE),
      stopAt(3.5, [176, 182, 196]),
      stopAt(6.5, [224, 226, 232]),
      stopAt(11, [246, 80, 66]),
      stopAt(40, [255, 138, 140]),
      stopAt(120, [255, 200, 216]),
    ],
  },
  // De PO-volgorde met violet in plaats van grijs: dezelfde koude-naar-warme lijn, levendiger. Violet lijkt zonder
  // rood- of groengevoelige kegeltjes op blauw, dus de matige band moet ook in helderheid van de lichte verschillen:
  // overdag duidelijk donkerder, 's nachts duidelijk lichter.
  'blauw-violet-rood': {
    light: [
      stopAt(0.1, DAY_LIGHT_BLUE),
      stopAt(1.2, DAY_BLUE),
      stopAt(3.5, [74, 28, 148]),
      stopAt(6.5, [110, 16, 110]),
      stopAt(11, [214, 36, 52]),
      stopAt(40, [140, 12, 40]),
      stopAt(120, [84, 4, 44]),
    ],
    dark: [
      stopAt(0.1, NIGHT_BLUE),
      stopAt(1.2, [84, 144, 236]),
      stopAt(3.5, [212, 186, 255]),
      stopAt(6.5, [244, 184, 244]),
      stopAt(11, [250, 84, 88]),
      stopAt(40, [255, 144, 134]),
      stopAt(120, [255, 212, 204]),
    ],
  },
  // Volgorde in helderheid: hoe meer regen, hoe verder van de kaart af. Overdag steeds donkerder, 's nachts steeds
  // lichter; leesbaar zonder kleurzicht en in grijstinten. De tint loopt mee van blauw naar warm, zodat de banden
  // ook in kleur verschillen.
  'oplopend-donker': {
    light: [
      stopAt(0.1, DAY_LIGHT_BLUE),
      stopAt(1, [48, 110, 210]),
      stopAt(2.5, [44, 58, 158]),
      stopAt(7.5, [88, 22, 100]),
      stopAt(20, [64, 6, 34]),
      stopAt(100, [20, 0, 10]),
    ],
    dark: [
      stopAt(0.1, [58, 118, 188]),
      stopAt(1, [72, 160, 226]),
      stopAt(2.5, [112, 204, 236]),
      stopAt(7.5, [188, 234, 216]),
      stopAt(20, [250, 244, 172]),
      stopAt(100, [255, 255, 255]),
    ],
  },
}

interface BlendShape {
  /**
   * Bytes waartussen de dekking van nul naar de inzetdekking loopt. Zonder inzet loopt de dekking vanaf byte 0
   * lineair op, zoals vóór U77.
   */
  onsetEdge?: { from: number; to: number }
  /** Echte alfa-over. Uit = de canvas draagt α² als alfa en telt onder halve dekking licht op bij de kaart. */
  straightAlpha: boolean
  /** Dunne contour op de rand van het regengebied. */
  outline: boolean
}

// Halverwege droog (byte 0) en de lichtste regen in de data: daar ligt na het gladstrijken de rand van de data zelf.
const DATA_EDGE_INDEX = ONSET_INDEX / 2
const THRESHOLD_EDGE = { from: DATA_EDGE_INDEX - 6, to: DATA_EDGE_INDEX + 6 }

const BLEND_SHAPES: Record<RainBlendName, BlendShape> = {
  'huidig': { straightAlpha: false, outline: false },
  'zuiver': { straightAlpha: true, outline: false },
  // De hele gladgestreken zoom meteen dekkend: het getekende gebied is groter dan de data.
  'steil': { onsetEdge: { from: 2, to: 12 }, straightAlpha: true, outline: false },
  'drempel': { onsetEdge: THRESHOLD_EDGE, straightAlpha: true, outline: false },
  'rand': { onsetEdge: THRESHOLD_EDGE, straightAlpha: true, outline: true },
}

const GRADUAL_ALPHA_PER_INDEX = 1.6
const FULL_ALPHA = 210
/**
 * Dekking van de lichtste zichtbare regen bij een mengvariant met inzet. Bewust niet hoger: het weermodel heeft
 * brede velden motregen, en op 0,7 werd dat een dichte plaat waar plaatsnamen en grenzen onder verdwenen.
 */
export const ONSET_ALPHA = 0.55

function alphaAt(index: number, shape: BlendShape): number {
  const gradual = Math.min(FULL_ALPHA, Math.round(index * GRADUAL_ALPHA_PER_INDEX))
  const edge = shape.onsetEdge
  if (!edge) return gradual
  if (index <= edge.from) return 0
  const onsetAlpha = Math.round(ONSET_ALPHA * 255)
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

/**
 * Het kleinste helderheidsverschil (CIE L*, schaal 0–100) tussen de lichtste zichtbare regen en elke ondergrond.
 * Een vangnet, geen oordeel. Tien bleek in beeld te weinig voor blauw op het lichtblauwe water van de kaart, waar
 * de tint niet meehelpt; vijftien is een stap die je daar zonder zoeken ziet.
 */
export const MINIMUM_GROUND_CONTRAST = 15

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
  return grounds.every((ground) => groundContrast(colour, alpha, theme, ground) >= MINIMUM_GROUND_CONTRAST)
}

const CONTRAST_SHIFT_STEPS = 50

/**
 * De contrastregel: hoe ver de beginkleur van een palet moet opschuiven (0–1; overdag naar zwart, 's nachts naar
 * wit) tot de lichtste zichtbare regen op land, water én bebouwing minstens `MINIMUM_GROUND_CONTRAST` verschilt.
 * Regen maakt de kaart daardoor overdag altijd donkerder en 's nachts altijd lichter.
 */
export function onsetContrastShift(onsetColour: Rgb, theme: MapTheme): number {
  for (let step = 0; step < CONTRAST_SHIFT_STEPS; step++) {
    const shift = step / CONTRAST_SHIFT_STEPS
    if (hasGroundContrast(shiftedColour(onsetColour, theme, shift), ONSET_ALPHA, theme)) return shift
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
  // Zonder dekkende inzet loopt de dekking vanaf nul op en bestaat er geen "lichtste zichtbare regen" om te borgen.
  const contrastShift = shape.onsetEdge ? onsetContrastShift(colourAt(stops, ONSET_INDEX), look.theme) : 0
  const colormap = new Uint8Array(256 * 4)
  for (let index = 0; index <= LAST_RAIN_INDEX; index++) {
    const colour = shiftedColour(colourAt(stops, index), look.theme, contrastShift * contrastShiftShare(index))
    colormap.set(colour, index * 4)
    colormap[index * 4 + 3] = alphaAt(index, shape)
  }
  return colormap
}

/** De verschuiving geldt volledig tot de inzet en loopt over de lichte band uit, zodat matig en zwaar het palet houden. */
function contrastShiftShare(index: number): number {
  if (index <= ONSET_INDEX) return 1
  if (index >= LIGHT_BAND_END_INDEX) return 0
  return 1 - (index - ONSET_INDEX) / (LIGHT_BAND_END_INDEX - ONSET_INDEX)
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
}

const OUTLINE_SHIFT = 0.3

/** De contour om het regengebied: de beginkleur, nog een stap verder van de kaart af. */
export function rainOutline(look: RainLook): RainOutline | undefined {
  if (!BLEND_SHAPES[look.blend].outline) return undefined
  const colormap = buildRainColormap(look)
  const onsetColour: Rgb = [colormap[ONSET_INDEX * 4]!, colormap[ONSET_INDEX * 4 + 1]!, colormap[ONSET_INDEX * 4 + 2]!]
  return { index: Math.floor(DATA_EDGE_INDEX) + 0.5, colour: shiftedColour(onsetColour, look.theme, OUTLINE_SHIFT) }
}

type LookStorage = Pick<Storage, 'getItem'>

export function loadRainLookChoice(storage: LookStorage = localStorage): RainLookChoice {
  const storedPalette = storage.getItem(RAIN_LOOK_STORAGE_KEYS.palette) as RainPaletteName
  const storedBlend = storage.getItem(RAIN_LOOK_STORAGE_KEYS.blend) as RainBlendName
  return {
    palette: RAIN_PALETTES.includes(storedPalette) ? storedPalette : DEFAULT_RAIN_LOOK.palette,
    blend: RAIN_BLENDS.includes(storedBlend) ? storedBlend : DEFAULT_RAIN_LOOK.blend,
  }
}
