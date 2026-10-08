import type { StyleSpecification } from 'maplibre-gl'

// Experiment (U62, ?dev): de basiskaart tweent van dag naar nacht met de kaarttijd. De lichte en de donkere
// stijl hebben dezelfde lagen; alleen een handvol paint-kleuren verschilt. Die worden op één stijl gemengd
// met setPaintProperty, in plaats van twee stijlen over elkaar te laten vloeien.

export type Rgba = [red: number, green: number, blue: number, alpha: number]

export interface BlendTarget {
  layer: string
  property: string
  light: unknown
  dark: unknown
}

/** Aandeel nacht (0 = dag, 1 = nacht) uit de sinus van de zonshoogte; dezelfde schemering als de hemel in de scrubber. */
export function nightShare(sinElevation: number): number {
  const twilight = Math.max(0, Math.min(1, (sinElevation + 0.1) / 0.2))
  return 1 - twilight * twilight * (3 - 2 * twilight)
}

/** Paint-eigenschappen die tussen de lichte en de donkere stijl verschillen (`undefined` = staat niet in die stijl). */
export function basemapBlendTargets(light: StyleSpecification, dark: StyleSpecification): BlendTarget[] {
  const darkLayers = new Map(dark.layers.map((layer) => [layer.id, layer]))
  const targets: BlendTarget[] = []
  for (const layer of light.layers) {
    const lightPaint = ('paint' in layer ? layer.paint : undefined) as Record<string, unknown> | undefined
    const darkLayer = darkLayers.get(layer.id)
    const darkPaint = (darkLayer && 'paint' in darkLayer ? darkLayer.paint : undefined) as Record<string, unknown> | undefined
    if (!lightPaint || !darkPaint) continue
    // Ook wat maar in één stijl staat: de donkere stijl geeft water een eigen randkleur. Bleef die staan op een
    // kaart die naar dag was gemengd, dan tekende elke waterrand en elke tegelgrens een donkere lijn (PO 2026-10-08).
    for (const property of new Set([...Object.keys(lightPaint), ...Object.keys(darkPaint)])) {
      if (JSON.stringify(lightPaint[property]) === JSON.stringify(darkPaint[property])) continue
      targets.push({ layer: layer.id, property, light: lightPaint[property], dark: darkPaint[property] })
    }
  }
  return targets
}

const LABEL_PROPERTIES = new Set(['text-color', 'text-halo-color'])

/**
 * De waarde van een eigenschap op `night` (0–1). Vlakken en lijnen mengen traploos. Tekst en haar halo
 * wisselen samen halverwege van paar: gemengd zouden ze elkaar rond de schemering naderen en onleesbaar
 * worden, terwijl elk paar op zichzelf zijn contrast houdt.
 */
export function blendedPaintValue(target: BlendTarget, night: number): unknown {
  if (LABEL_PROPERTIES.has(target.property)) return night < 0.5 ? target.light : target.dark
  // Ontbreekt de eigenschap in één stijl, dan is er niets te mengen: `undefined` zet de standaard van MapLibre terug.
  if (target.light === undefined || target.dark === undefined) return night < 0.5 ? target.light : target.dark
  return mixPaint(target.light, target.dark, Math.max(0, Math.min(1, night)))
}

function mixPaint(light: unknown, dark: unknown, night: number): unknown {
  if (typeof light === 'number' && typeof dark === 'number') return light + (dark - light) * night
  if (typeof light === 'string' && typeof dark === 'string') {
    const from = parseColor(light)
    const to = parseColor(dark)
    return from && to ? formatColor(mixColors(from, to, night)) : night < 0.5 ? light : dark
  }
  // Een zoom-verloop tegenover één kleur: elke kleur in het verloop mengt met die ene kleur.
  if (Array.isArray(light) && typeof dark === 'string') return light.map((part) => typeof part === 'string' && parseColor(part) ? mixPaint(part, dark, night) : part)
  if (typeof light === 'string' && Array.isArray(dark)) return dark.map((part) => typeof part === 'string' && parseColor(part) ? mixPaint(light, part, night) : part)
  if (Array.isArray(light) && Array.isArray(dark) && light.length === dark.length) return light.map((part, index) => mixPaint(part, dark[index], night))
  return night < 0.5 ? light : dark
}

/** Mengt in lineair licht, zodat een halve menging ook half zo helder oogt. */
export function mixColors(from: Rgba, to: Rgba, share: number): Rgba {
  const channel = (index: 0 | 1 | 2) => linearToSrgb(srgbToLinear(from[index]) + (srgbToLinear(to[index]) - srgbToLinear(from[index])) * share)
  return [channel(0), channel(1), channel(2), from[3] + (to[3] - from[3]) * share]
}

export function formatColor([red, green, blue, alpha]: Rgba): string {
  return `rgba(${Math.round(red)},${Math.round(green)},${Math.round(blue)},${Math.round(alpha * 1000) / 1000})`
}

/** Hex, rgb(a) en hsl(a): de notaties die de basisstijlen gebruiken. */
export function parseColor(text: string): Rgba | undefined {
  const value = text.trim().toLowerCase()
  const hex = /^#([0-9a-f]{3,8})$/.exec(value)?.[1]
  if (hex && [3, 4, 6, 8].includes(hex.length)) {
    const digits = hex.length <= 4 ? [...hex].map((digit) => digit + digit) : hex.match(/../g)!
    const [red, green, blue, alpha = 255] = digits.map((pair) => parseInt(pair, 16))
    return [red!, green!, blue!, alpha / 255]
  }
  const call = /^(rgba?|hsla?)\(([^)]+)\)$/.exec(value)
  if (!call) return undefined
  const parts = call[2]!.split(/[\s,/]+/).filter(Boolean)
  if (parts.length < 3) return undefined
  const number = (part: string, percentOf = 1) => part.endsWith('%') ? parseFloat(part) / 100 * percentOf : parseFloat(part)
  const alpha = parts[3] === undefined ? 1 : number(parts[3])
  if (call[1]!.startsWith('rgb')) return [number(parts[0]!, 255), number(parts[1]!, 255), number(parts[2]!, 255), alpha]
  const hue = ((parseFloat(parts[0]!) % 360) + 360) % 360
  const saturation = number(parts[1]!)
  const lightness = number(parts[2]!)
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const second = chroma * (1 - Math.abs((hue / 60) % 2 - 1))
  const offset = lightness - chroma / 2
  const [red, green, blue] = hue < 60 ? [chroma, second, 0] : hue < 120 ? [second, chroma, 0] : hue < 180 ? [0, chroma, second]
    : hue < 240 ? [0, second, chroma] : hue < 300 ? [second, 0, chroma] : [chroma, 0, second]
  return [(red + offset) * 255, (green + offset) * 255, (blue + offset) * 255, alpha]
}

function srgbToLinear(channel: number): number {
  const share = channel / 255
  return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(linear: number): number {
  return 255 * (linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055)
}

export function relativeLuminance([red, green, blue]: Rgba): number {
  return 0.2126 * srgbToLinear(red) + 0.7152 * srgbToLinear(green) + 0.0722 * srgbToLinear(blue)
}

export function contrastRatio(first: Rgba, second: Rgba): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second))
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second))
  return (lighter + 0.05) / (darker + 0.05)
}
