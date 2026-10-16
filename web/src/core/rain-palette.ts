import type { MapTheme } from './map-theme.js'

// Het regenpalet en hoe regen over de kaart ligt. Het product is `DEFAULT_RAIN_LOOK` (PO 2026-10-11, U77: palet
// violet-laat, menging drempel-zacht, contrastlat 0; menging rand sinds U83, PO 2026-10-16). De overige paletten en mengingen zijn de proef onder ?dev ›
// Regen (eigenaar U77, vervalt 2026-10-17); `huidig` + `huidig` geeft daar byte voor byte de tabel van vóór U77.

export type Rgb = readonly [red: number, green: number, blue: number]

export const RAIN_PALETTES = ['huidig', 'blauw-grijs-rood', 'blauw-violet-rood', 'violet-klassen', 'violet-laat', 'oplopend-donker'] as const
export type RainPaletteName = typeof RAIN_PALETTES[number]

export const RAIN_BLENDS = ['huidig', 'zuiver', 'steil', 'drempel', 'drempel-zacht', 'rand'] as const
export type RainBlendName = typeof RAIN_BLENDS[number]

// Isolijnen binnen de regen (proef onder ?dev › Regen, PO 2026-10-16: "zullen we nog meer mm/h isolijnen
// toevoegen?"). kleurgrenzen volgt het palet violet-laat: lichte regen, waar blauw violet wordt, waar rood begint.
// klassen volgt de WMO-indeling licht/matig/zwaar/zeer zwaar.
export const RAIN_ISOLINE_SETS = ['kleurgrenzen', 'klassen', 'dicht', 'geen'] as const
export type RainIsolineSetName = typeof RAIN_ISOLINE_SETS[number]
// Waar de regenisolijnen vandaan komen (proef, PO 2026-10-16): per pixel in de regenshader, of de bestaande
// isolijnlaag van temperatuur en druk op het verkleinde regenveld (rain-isoline-field.ts).
export const RAIN_ISOLINE_SOURCES = ['shader', 'isolijnlaag'] as const
export type RainIsolineSourceName = typeof RAIN_ISOLINE_SOURCES[number]
export const RAIN_ISOLINE_RATES: Record<RainIsolineSetName, readonly number[]> = {
  kleurgrenzen: [1, 4, 13],
  klassen: [2.5, 10, 50],
  dicht: [0.5, 1, 2, 5, 10, 20],
  geen: [],
}

// De lat van de contrastregel: het kleinste helderheidsverschil (CIE L*, schaal 0–100) tussen de lichtste zichtbare
// regen en elke ondergrond. Een vangnet, geen oordeel. Tien bleek in ronde 1 te weinig voor blauw op het lichtblauwe
// water van de kaart, vijftien gaf de rand een donkere zoom; de PO stelt hem daarom zelf in (2026-10-11: "10 lijkt me
// nog te veel"). Nul zet de regel uit op de richting na: regen mag de kaart overdag niet lichter maken en 's nachts
// niet donkerder. PO 2026-10-11: "regencontrast kan op 0".
export const DEFAULT_RAIN_CONTRAST = 0
export const RAIN_CONTRAST_RANGE = { minimum: 0, maximum: 20, step: 1 } as const

/** Een ingevoerde lat binnen het bereik; geen getal = de standaard. */
export function sanitizeRainContrast(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_RAIN_CONTRAST
  return Math.max(RAIN_CONTRAST_RANGE.minimum, Math.min(RAIN_CONTRAST_RANGE.maximum, value))
}

export interface RainLook {
  palette: RainPaletteName
  blend: RainBlendName
  theme: MapTheme
  /** Weggelaten = `DEFAULT_RAIN_CONTRAST`. Telt alleen bij een menging met een dekkende inzet. */
  contrast?: number
  /** Weggelaten = geen isolijnen binnen de regen; telt alleen bij een menging met contour. */
  isolines?: RainIsolineSetName
  /** Weggelaten = shader. */
  isolineSource?: RainIsolineSourceName
}

/** Wat de knoppen kiezen; het thema volgt de kaart. */
export type RainLookChoice = Pick<RainLook, 'palette' | 'blend' | 'contrast' | 'isolines' | 'isolineSource'>

export const DEFAULT_RAIN_LOOK: RainLook = { palette: 'violet-laat', blend: 'rand', theme: 'light', contrast: DEFAULT_RAIN_CONTRAST, isolines: 'kleurgrenzen', isolineSource: 'shader' }

/**
 * Het regenbeeld van vóór U77. De bot rendert hier nog mee: zijn compositor bootst de oude canvas na (α² als alfa)
 * en kent één tabel voor dag en nacht, dus met het nieuwe product zou hij harde witte vlekken tekenen en 's nachts
 * het dagpalet. Zodra de bot (of de Rust-renderer, U76) echte alfa-over en een tabel per thema heeft kan dit weg.
 */
export const PRE_U77_RAIN_LOOK: RainLook = { palette: 'huidig', blend: 'huidig', theme: 'light' }

export const RAIN_LOOK_STORAGE_KEYS = {
  palette: 'motregen-dev-regenpalet',
  blend: 'motregen-dev-regenmenging',
  contrast: 'motregen-dev-regencontrast',
  isolines: 'motregen-dev-regenisolijnen',
  isolineSource: 'motregen-dev-regenisolijnbron',
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

/**
 * Het verloop lichtblauw → blauw → violet → rood → bordeaux, met de plek (mm/u) van vier kleuren als knoppen. Violet
 * lijkt zonder rood- of groengevoelige kegeltjes op blauw, dus het verschilt ook in helderheid van het blauw:
 * overdag duidelijk donkerder, 's nachts duidelijk lichter.
 */
function violetGradient(at: { blue: number; violet: number; purple: number; red: number }): Record<MapTheme, PaletteStop[]> {
  return {
    light: [
      stopAt(0.1, DAY_LIGHT_BLUE),
      stopAt(at.blue, DAY_BLUE),
      stopAt(at.violet, [74, 28, 148]),
      stopAt(at.purple, [110, 16, 110]),
      stopAt(at.red, [214, 36, 52]),
      stopAt(40, [140, 12, 40]),
      stopAt(120, [84, 4, 44]),
    ],
    dark: [
      stopAt(0.1, NIGHT_BLUE),
      stopAt(at.blue, [84, 144, 236]),
      stopAt(at.violet, [132, 56, 228]),
      stopAt(at.purple, [204, 48, 196]),
      stopAt(at.red, [250, 84, 88]),
      stopAt(40, [255, 144, 134]),
      stopAt(120, [255, 212, 204]),
    ],
  }
}

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
  // De PO-volgorde met violet in plaats van grijs: dezelfde koude-naar-warme lijn, levendiger.
  'blauw-violet-rood': violetGradient({ blue: 1.2, violet: 3.5, purple: 6.5, red: 11 }),
  // PO 2026-10-11: "kan het nog wat langer blauw blijven?" en daarna "gradient als voorheen was goed, alleen de stops
  // moesten verschoven". Dus hetzelfde verloop met dezelfde kleuren, alleen later.
  // Blauw tot het eind van onze lichte klasse (2,5), violet midden in matig, rood in zwaar.
  'violet-klassen': violetGradient({ blue: 2, violet: 4.5, purple: 6.5, red: 10 }),
  // Blauw tot ongeveer 5 mm/u, violet rond 7, rood vanaf ruim 10. De kleuren vallen dan niet meer op onze klassen
  // licht/matig/zwaar (2,5 en 7,5): het grootste deel van matig is nog blauw.
  'violet-laat': violetGradient({ blue: 4, violet: 7, purple: 9, red: 13 }),
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
// PO 2026-10-11 ("nog één tikje subtieler"): een lagere dekking op de rand en een oploop die twee keer zo breed is.
// Boven 0,1 mm/u valt de dekking samen met de lineaire aanloop van `zuiver`.
const SOFT_THRESHOLD_EDGE = { from: DATA_EDGE_INDEX - 12, to: DATA_EDGE_INDEX + 12, alpha: 0.38 }

const BLEND_SHAPES: Record<RainBlendName, BlendShape> = {
  'huidig': { straightAlpha: false, outline: false },
  'zuiver': { straightAlpha: true, outline: false },
  // De hele gladgestreken zoom meteen dekkend: het getekende gebied is groter dan de data.
  'steil': { onsetEdge: { from: 2, to: 12, alpha: ONSET_ALPHA }, straightAlpha: true, outline: false },
  'drempel': { onsetEdge: THRESHOLD_EDGE, straightAlpha: true, outline: false },
  'drempel-zacht': { onsetEdge: SOFT_THRESHOLD_EDGE, straightAlpha: true, outline: false },
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

function hasGroundContrast(colour: Rgb, alpha: number, theme: MapTheme, minimum: number): boolean {
  const grounds = Object.keys(GROUND_COLOURS[theme]) as Ground[]
  return grounds.every((ground) => groundContrast(colour, alpha, theme, ground) >= minimum)
}

const CONTRAST_SHIFT_STEPS = 200

/**
 * De contrastregel: hoe ver een kleur moet opschuiven (0–1; overdag naar zwart, 's nachts naar wit) tot hij met
 * dekking `alpha` op land, water én bebouwing minstens `minimum` L* verschilt. Regen maakt de kaart
 * daardoor overdag altijd donkerder en 's nachts altijd lichter.
 */
export function contrastShiftFor(colour: Rgb, alpha: number, theme: MapTheme, minimum: number): number {
  for (let step = 0; step < CONTRAST_SHIFT_STEPS; step++) {
    const shift = step / CONTRAST_SHIFT_STEPS
    if (hasGroundContrast(shiftedColour(colour, theme, shift), alpha, theme, minimum)) return shift
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
  const minimum = look.contrast ?? DEFAULT_RAIN_CONTRAST
  // De inzetdekking zoals hij in de tabel komt (een byte): 0,55 wordt 140/255, en op dat verschil haalde de rand
  // een scherpe lat net niet. Zonder dekkende inzet loopt de dekking vanaf nul op en bestaat er geen "lichtste
  // zichtbare regen" om te borgen.
  const onsetAlpha = shape.onsetEdge ? Math.round(shape.onsetEdge.alpha * 255) / 255 : undefined
  const onsetShift = onsetAlpha === undefined ? 0 : contrastShiftFor(colourAt(stops, ONSET_INDEX), onsetAlpha, look.theme, minimum)
  const colormap = new Uint8Array(256 * 4)
  for (let index = 0; index <= LAST_RAIN_INDEX; index++) {
    const alpha = alphaAt(index, shape)
    const paletteColour = colourAt(stops, index)
    const shift = onsetAlpha === undefined ? 0 : lightBandShift(paletteColour, index, alpha / 255, { alpha: onsetAlpha, shift: onsetShift }, look.theme, minimum)
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
function lightBandShift(paletteColour: Rgb, index: number, alpha: number, onset: { alpha: number; shift: number }, theme: MapTheme, minimum: number): number {
  if (index >= LIGHT_BAND_END_INDEX) return 0
  const needed = contrastShiftFor(paletteColour, Math.max(alpha, onset.alpha), theme, minimum)
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

/** Lijnkleur van de buitenrand: de beginkleur van de regen, nog een stap verder van de kaart af. */
export function rainLineColour(look: RainLook): Rgb {
  const colormap = buildRainColormap(look)
  const onsetColour: Rgb = [colormap[ONSET_INDEX * 4]!, colormap[ONSET_INDEX * 4 + 1]!, colormap[ONSET_INDEX * 4 + 2]!]
  return shiftedColour(onsetColour, look.theme, OUTLINE_SHIFT)
}

/** De contour om het regengebied; alleen bij een menging met contour (rand). */
export function rainOutline(look: RainLook): RainOutline | undefined {
  if (!BLEND_SHAPES[look.blend].outline) return undefined
  return { index: Math.floor(DATA_EDGE_INDEX) + 0.5, colour: rainLineColour(look), strength: BOUNDARY_STRENGTH, halfWidth: 1.2 }
}

/** De isolijnen binnen de regen, bij elke menging: elk in de regenkleur op die intensiteit, een stap donkerder. */
export function rainIsolineOutlines(look: RainLook): RainOutline[] {
  const colormap = buildRainColormap(look)
  return RAIN_ISOLINE_RATES[look.isolines ?? 'geen'].map((rate): RainOutline => {
    const index = Math.floor(rainRateIndex(rate)) + 0.5
    const byte = Math.round(index)
    const colour: Rgb = [colormap[byte * 4]!, colormap[byte * 4 + 1]!, colormap[byte * 4 + 2]!]
    return { index, colour: shiftedColour(colour, look.theme, ISOLINE_SHIFT), strength: ISOLINE_STRENGTH, halfWidth: 0.9 }
  })
}

/** Wat de regenshader tekent: de buitenrand (bij rand) plus de isolijnen, tenzij de isolijnlaag ze tekent. */
export function rainOutlines(look: RainLook): RainOutline[] {
  if (look.isolineSource === 'isolijnlaag') return []
  const boundary = rainOutline(look)
  return [...(boundary ? [boundary] : []), ...rainIsolineOutlines(look)]
}

type LookStorage = Pick<Storage, 'getItem'>

export function loadRainLookChoice(storage: LookStorage = localStorage): RainLookChoice {
  const storedPalette = storage.getItem(RAIN_LOOK_STORAGE_KEYS.palette) as RainPaletteName
  const storedBlend = storage.getItem(RAIN_LOOK_STORAGE_KEYS.blend) as RainBlendName
  const storedContrast = storage.getItem(RAIN_LOOK_STORAGE_KEYS.contrast)
  const storedIsolines = storage.getItem(RAIN_LOOK_STORAGE_KEYS.isolines) as RainIsolineSetName
  const storedIsolineSource = storage.getItem(RAIN_LOOK_STORAGE_KEYS.isolineSource) as RainIsolineSourceName
  return {
    palette: RAIN_PALETTES.includes(storedPalette) ? storedPalette : DEFAULT_RAIN_LOOK.palette,
    blend: RAIN_BLENDS.includes(storedBlend) ? storedBlend : DEFAULT_RAIN_LOOK.blend,
    // Number(null) en Number('') zijn 0, en nul is een geldige lat: een ontbrekende waarde apart afvangen.
    contrast: storedContrast === null || storedContrast.trim() === '' ? DEFAULT_RAIN_CONTRAST : sanitizeRainContrast(Number(storedContrast)),
    isolines: RAIN_ISOLINE_SETS.includes(storedIsolines) ? storedIsolines : DEFAULT_RAIN_LOOK.isolines,
    isolineSource: RAIN_ISOLINE_SOURCES.includes(storedIsolineSource) ? storedIsolineSource : DEFAULT_RAIN_LOOK.isolineSource,
  }
}
