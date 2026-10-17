import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { MapTheme } from './map-theme'
import {
  buildRainColormap, colourOverGround, DEFAULT_RAIN_LOOK, GROUND_COLOURS, groundContrast, lightness, loadRainLookChoice,
  ONSET_INDEX, PRE_U77_RAIN_LOOK, RAIN_BLENDS, RAIN_ISOLINE_RATES, RAIN_LOOK_STORAGE_KEYS, RAIN_PALETTES, rainOutlines, rainOnsetAlpha, rainOutline,
  rainRateIndex, rainUsesStraightAlpha, type Ground, type RainBlendName, type RainLook, type Rgb,
} from './rain-palette'

const THEMES: MapTheme[] = ['light', 'dark']
const GROUNDS: Ground[] = ['land', 'water', 'urban']
function entry(colormap: Uint8Array, index: number): { colour: Rgb; alpha: number } {
  return { colour: [colormap[index * 4]!, colormap[index * 4 + 1]!, colormap[index * 4 + 2]!], alpha: colormap[index * 4 + 3]! / 255 }
}

function colourAtRate(look: RainLook, rate: number): Rgb {
  return entry(buildRainColormap(look), Math.round(rainRateIndex(rate))).colour
}

describe('the product rain table', () => {
  // De bot en de Rust-renderer lezen deze tabel via `rainColormap()`: een wijziging hier is een wijziging in elk
  // regenbeeld. Rij: mm/u, byte, RGBA.
  const PRODUCT_TABLE: Record<MapTheme, Array<[rate: number, index: number, rgba: number[]]>> = {
    light: [[0.02,19,[64,152,238,0]],[0.05,43,[64,152,238,140]],[0.1,62,[64,152,238,140]],[1,122,[45,115,224,195]],[4,159,[35,90,214,210]],[7,173,[73,30,150,210]],[9,180,[110,16,110,210]],[13,190,[213,36,52,210]],[40,219,[141,12,40,210]],[120,248,[84,4,44,210]]],
    dark: [[0.02,19,[66,120,214,0]],[0.05,43,[66,120,214,140]],[0.1,62,[66,120,214,140]],[1,122,[77,135,228,195]],[4,159,[85,142,236,210]],[7,173,[131,58,228,210]],[9,180,[204,48,196,210]],[13,190,[250,85,89,210]],[40,219,[255,144,134,210]],[120,248,[255,212,204,210]]],
  }

  it('is the look the PO chose: violet-laat, rand (2026-10-16, was drempel-zacht), contrast floor 0', () => {
    expect(DEFAULT_RAIN_LOOK).toEqual({ palette: 'violet-laat', blend: 'rand', theme: 'light', contrast: 0, isolines: 'kleurgrenzen' })
    expect(rainUsesStraightAlpha(DEFAULT_RAIN_LOOK.blend)).toBe(true)
    expect(rainOutline(DEFAULT_RAIN_LOOK)).toBeDefined()
    for (const theme of THEMES) {
      const colormap = buildRainColormap({ ...DEFAULT_RAIN_LOOK, theme })
      for (const [rate, index, rgba] of PRODUCT_TABLE[theme]) {
        expect(Math.round(rainRateIndex(rate)), `${rate} mm/u`).toBe(index)
        expect(Array.from(colormap.subarray(index * 4, index * 4 + 4)), `${theme} ${rate} mm/u`).toEqual(rgba)
      }
    }
  })

  // De bot gebruikt nog de tabel zoals `rainColormap()` hem vóór U77 bouwde, letterlijk overgenomen.
  function tableBeforeU77(): Uint8Array {
    const stops = [[0, 54, 183, 255], [55, 54, 183, 255], [105, 31, 231, 190], [150, 255, 222, 44], [195, 255, 82, 35], [235, 188, 45, 214], [255, 188, 45, 214]]
    const lut = new Uint8Array(256 * 4)
    for (let value = 0; value < 255; value++) {
      let stop = 1; while (value > stops[stop]![0]!) stop++
      const a = stops[stop - 1]!, b = stops[stop]!, mix = (value - a[0]!) / (b[0]! - a[0]!)
      for (let channel = 1; channel < 4; channel++) lut[value * 4 + channel - 1] = Math.round(a[channel]! + (b[channel]! - a[channel]!) * mix)
      lut[value * 4 + 3] = Math.min(210, Math.round(value * 1.6))
    }
    return lut
  }

  it('still gives the table from before U77 byte for byte as palette huidig with blend huidig, in both themes', () => {
    for (const theme of THEMES) {
      expect(Array.from(buildRainColormap({ palette: 'huidig', blend: 'huidig', theme }))).toEqual(Array.from(tableBeforeU77()))
    }
    // De bot rendert hier nog mee.
    expect(Array.from(buildRainColormap(PRE_U77_RAIN_LOOK))).toEqual(Array.from(tableBeforeU77()))
    expect(rainUsesStraightAlpha('huidig')).toBe(false)
  })

  it('leaves the no-data byte transparent in every look', () => {
    for (const palette of RAIN_PALETTES) for (const blend of RAIN_BLENDS) for (const theme of THEMES) {
      expect(Array.from(buildRainColormap({ palette, blend, theme }).subarray(255 * 4))).toEqual([0, 0, 0, 0])
    }
  })
})

describe('ground colours', () => {
  interface StyleLayer { id: string; paint?: Record<string, unknown> }
  const style = (name: string): { layers: StyleLayer[] } => JSON.parse(readFileSync(new URL(`../../public/basemap/${name}.json`, import.meta.url), 'utf8'))
  const paint = (name: string, layer: string, property: string) => style(name).layers.find((candidate) => candidate.id === layer)!.paint![property]

  function parseColour(value: string): { colour: Rgb; alpha: number } {
    if (value.startsWith('#')) return { colour: [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)) as unknown as Rgb, alpha: 1 }
    const numbers = value.match(/[\d.]+/g)!.map(Number)
    if (value.startsWith('rgb')) return { colour: [numbers[0]!, numbers[1]!, numbers[2]!], alpha: numbers[3] ?? 1 }
    const [hue, saturation, light, alpha = 1] = [numbers[0]!, numbers[1]! / 100, numbers[2]! / 100, numbers[3]]
    const chroma = (1 - Math.abs(2 * light - 1)) * saturation
    const channel = (offset: number) => {
      const position = (offset + hue / 30) % 12
      return Math.round(255 * (light - chroma / 2 * Math.max(-1, Math.min(position - 3, 9 - position, 1))))
    }
    return { colour: [channel(0), channel(8), channel(4)], alpha }
  }

  it('are the land, water and built-up colours of the basemap styles', () => {
    const lightLand = parseColour(paint('licht', 'background', 'background-color') as string).colour
    expect(GROUND_COLOURS.light.land).toEqual(lightLand)
    expect(GROUND_COLOURS.light.water).toEqual(parseColour(paint('licht', 'water', 'fill-color') as string).colour)
    // Bebouwing is in de lichte stijl een zoom-interpolatie; de eerste stop (zoom 9) is de landelijke kaart.
    const lightUrban = parseColour((paint('licht', 'landuse_residential', 'fill-color') as unknown[])[4] as string)
    expect(GROUND_COLOURS.light.urban).toEqual(colourOverGround(lightUrban.colour, lightUrban.alpha, lightLand))
    expect(GROUND_COLOURS.dark.land).toEqual(parseColour(paint('donker', 'background', 'background-color') as string).colour)
    expect(GROUND_COLOURS.dark.water).toEqual(parseColour(paint('donker', 'water', 'fill-color') as string).colour)
    expect(GROUND_COLOURS.dark.urban).toEqual(parseColour(paint('donker', 'landuse_residential', 'fill-color') as string).colour)
  })
})

describe('contrast with the map', () => {
  it('makes rain darken the light map and lighten the dark map through the whole light band', () => {
    for (const theme of THEMES) {
      const colormap = buildRainColormap({ ...DEFAULT_RAIN_LOOK, theme })
      for (let index = ONSET_INDEX; index <= Math.round(rainRateIndex(2.5)); index++) {
        const { colour, alpha } = entry(colormap, index)
        for (const ground of GROUNDS) expect(groundContrast(colour, alpha, theme, ground), `${theme} ${ground} byte ${index}`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('cannot give that guarantee for the current blend: by day the lightest rain is as light as the land itself', () => {
    const { colour, alpha } = entry(buildRainColormap({ palette: 'huidig', blend: 'huidig', theme: 'light' }), ONSET_INDEX)
    const land = GROUND_COLOURS.light.land
    // De canvas draagt α² als alfa (U77-diagnose): kleur × α komt bóvenop (1 − α²) × kaart.
    const onScreen = colour.map((channel, position) => Math.min(255, Math.round(channel * alpha + (1 - alpha * alpha) * land[position]!))) as unknown as Rgb
    expect(lightness(onScreen)).toBeGreaterThan(lightness(land))
  })

})

describe('blend shapes', () => {
  const alphaAt = (blend: RainBlendName, index: number) => entry(buildRainColormap({ ...DEFAULT_RAIN_LOOK, blend }), index).alpha

  it('draws nothing below the data edge with a threshold, and everything from there at the onset opacity', () => {
    for (const blend of ['rand'] as const) {
      expect(alphaAt(blend, ONSET_INDEX / 2 - 6)).toBe(0)
      expect(alphaAt(blend, ONSET_INDEX / 2 + 6)).toBeCloseTo(rainOnsetAlpha(blend)!, 2)
      expect(alphaAt(blend, 254)).toBeCloseTo(210 / 255, 5)
    }
  })

  it('never lets opacity drop as the rain gets heavier', () => {
    for (const blend of RAIN_BLENDS) for (let index = 1; index < 255; index++) expect(alphaAt(blend, index), `${blend} byte ${index}`).toBeGreaterThanOrEqual(alphaAt(blend, index - 1))
  })

  it('only outlines the rain in the outline blend, half a byte off the data edge', () => {
    for (const blend of RAIN_BLENDS) {
      const outline = rainOutline({ ...DEFAULT_RAIN_LOOK, blend })
      if (blend === 'rand') expect(outline!.index % 1).toBe(0.5)
      else expect(outline).toBeUndefined()
    }
  })

  it('draws the boundary first, then one thinner, lighter line per isoline rate, each on half a byte', () => {
    const outlines = rainOutlines({ ...DEFAULT_RAIN_LOOK, isolines: 'kleurgrenzen' })
    expect(outlines).toHaveLength(1 + RAIN_ISOLINE_RATES.kleurgrenzen.length)
    expect(outlines.every((outline) => outline.index % 1 === 0.5)).toBe(true)
    expect(outlines.slice(1).every((outline) => outline.strength < outlines[0]!.strength && outline.halfWidth < outlines[0]!.halfWidth)).toBe(true)
    expect(outlines.slice(1).map((outline) => outline.index)).toEqual([...outlines.slice(1).map((outline) => outline.index)].sort((a, b) => a - b))
    expect(rainOutlines({ ...DEFAULT_RAIN_LOOK, isolines: 'geen' })).toHaveLength(1)
    expect(rainOutlines({ ...DEFAULT_RAIN_LOOK, blend: 'huidig' })).toEqual([])
  })

  it('keeps the current canvas blending only for the current blend', () => {
    expect(RAIN_BLENDS.filter((blend) => !rainUsesStraightAlpha(blend))).toEqual(['huidig'])
  })
})

describe('reading the intensity order', () => {
  // Kleurzicht zonder rood- of groengevoelige kegeltjes (Machado, Oliveira & Fernandes 2009, ernst 1,0), op lineair RGB.
  const VISION: Record<string, number[][]> = {
    normaal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    protanopie: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    deuteranopie: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  }
  const toLinear = (channel: number) => { const share = channel / 255; return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4 }

  function labAsSeen(colour: Rgb, vision: number[][]): [number, number, number] {
    const linear = colour.map(toLinear)
    const seen = vision.map((row) => Math.max(0, Math.min(1, row[0]! * linear[0]! + row[1]! * linear[1]! + row[2]! * linear[2]!)))
    const x = (0.4124 * seen[0]! + 0.3576 * seen[1]! + 0.1805 * seen[2]!) / 0.95047
    const y = 0.2126 * seen[0]! + 0.7152 * seen[1]! + 0.0722 * seen[2]!
    const z = (0.0193 * seen[0]! + 0.1192 * seen[1]! + 0.9505 * seen[2]!) / 1.08883
    const curve = (value: number) => value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116
    return [116 * curve(y) - 16, 500 * (curve(x) - curve(y)), 200 * (curve(y) - curve(z))]
  }

  function colourDifference(left: Rgb, right: Rgb, vision: number[][]): number {
    const leftLab = labAsSeen(left, vision), rightLab = labAsSeen(right, vision)
    return Math.hypot(leftLab[0] - rightLab[0], leftLab[1] - rightLab[1], leftLab[2] - rightLab[2])
  }

  // Midden van de banden van het histogram (licht tot 2,5, matig tot 7,5, zwaar daarboven).
  // `violet-laat` legt zijn kleurgrenzen bewust naast onze klassen (blauw tot 5, violet tot 10, rood daarboven):
  // 4,5 mm/u is daar nog blauw. Hier staat dus alleen of zijn eigen drie kleuren uit elkaar te houden zijn; dat
  // licht en matig bij dit palet in kleur samenvallen is de prijs van "langer blauw" en staat in de LOG.
  const LATE_VIOLET_RATES = { blauw: 0.5, violet: 7.5, rood: 15 }
  // CIE76; 2,3 is net waarneembaar. Twintig is het verschil tussen twee kleuren die je los van elkaar benoemt.
  const MINIMUM_BAND_DIFFERENCE = 20

  // PO 2026-10-11: het nachtviolet moet er "eng" uitzien; het bleke lavendel dat voor kleurenblinden in helderheid van
  // het blauw afstak las als vaal en wit. Een verzadigd violet is voor wie geen rood of groen ziet een blauw van
  // dezelfde helderheid, dus 's nachts is blauw tegen violet in de violet-paletten alleen bij normaal kleurzicht te
  // onderscheiden. Rood blijft voor iedereen duidelijk; dat toetst de test hieronder nog steeds.
  const isNightBlueAgainstViolet = (theme: MapTheme, pairStartsAt: number) =>
    theme === 'dark' && pairStartsAt === 0

  it('tells light, moderate and heavy rain apart at a glance, also without red or green cones', () => {
    for (const theme of THEMES) {
      const look: RainLook = { ...DEFAULT_RAIN_LOOK, theme }
      const rates = LATE_VIOLET_RATES
      const bands = Object.entries(rates).map(([band, rate]) => ({ band, colour: colourAtRate(look, rate) }))
      for (const [visionName, vision] of Object.entries(VISION)) {
        for (const [position, left] of bands.entries()) for (const right of bands.slice(position + 1)) {
          const nextBand = bands[position + 1] === right
          if (visionName !== 'normaal' && nextBand && isNightBlueAgainstViolet(theme, position)) continue
          expect(colourDifference(left.colour, right.colour, vision), `${theme} ${visionName}: ${left.band} tegen ${right.band}`).toBeGreaterThanOrEqual(MINIMUM_BAND_DIFFERENCE)
        }
      }
    }
  })

})

describe('stored choice', () => {
  const storage = (values: Record<string, string>) => ({ getItem: (key: string) => values[key] ?? null })

  it('falls back to the product on a missing or unknown isoline set', () => {
    expect(loadRainLookChoice(storage({}))).toEqual({ isolines: 'kleurgrenzen' })
    expect(loadRainLookChoice(storage({ [RAIN_LOOK_STORAGE_KEYS.isolines]: 'onbekend' }))).toEqual({ isolines: 'kleurgrenzen' })
  })

  it('reads the chosen isoline set', () => {
    expect(loadRainLookChoice(storage({ [RAIN_LOOK_STORAGE_KEYS.isolines]: 'dicht' }))).toEqual({ isolines: 'dicht' })
  })
})
