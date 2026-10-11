// U77 ronde 3: wat doet een lagere lat van de contrastregel met de lichtste zichtbare regen? Per menging, lat en
// thema: de beginkleur na de regel, en per ondergrond de kleur op het scherm met het verschil in helderheid (ΔL*) en
// in kleur als geheel (ΔE, CIE76: helderheid plus tint). Onder ΔE 5 is een vlak naast zijn ondergrond nog net te
// zien; valt de regen ergens "weg", dan staat het hier.
// Gebruik (vanuit web/): pnpm exec tsx tmp/u77/contrast-floors.ts [palet] [latten, komma's]
import { buildRainColormap, colourOverGround, GROUND_COLOURS, lightness, ONSET_INDEX, rainOnsetAlpha, type Ground, type RainPaletteName, type Rgb } from '../../src/core/rain-palette'

const palette = (process.argv[2] ?? 'violet-laat') as RainPaletteName
const floors = (process.argv[3] ?? '15,12,10,8,6,4,2,0').split(',').map(Number)
const GROUNDS: Ground[] = ['land', 'water', 'urban']
const GROUND_NAMES: Record<Ground, string> = { land: 'land', water: 'water', urban: 'bebouwing' }

function lab(colour: Rgb): [number, number, number] {
  const linear = colour.map((channel) => { const share = channel / 255; return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4 })
  const x = (0.4124 * linear[0]! + 0.3576 * linear[1]! + 0.1805 * linear[2]!) / 0.95047
  const y = 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
  const z = (0.0193 * linear[0]! + 0.1192 * linear[1]! + 0.9505 * linear[2]!) / 1.08883
  const curve = (value: number) => value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116
  return [116 * curve(y) - 16, 500 * (curve(x) - curve(y)), 200 * (curve(y) - curve(z))]
}
const colourDifference = (left: Rgb, right: Rgb) => { const a = lab(left), b = lab(right); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) }

console.log(`| menging | thema | lat | beginkleur na de regel | ${GROUNDS.map((ground) => `op ${GROUND_NAMES[ground]}: kleur · ΔL* · ΔE`).join(' | ')} |`)
console.log('| --- | --- | --- | --- | --- | --- | --- |')
for (const blend of ['drempel', 'drempel-zacht'] as const) for (const theme of ['light', 'dark'] as const) for (const contrast of floors) {
  const colormap = buildRainColormap({ palette, blend, theme, contrast })
  const onset: Rgb = [colormap[ONSET_INDEX * 4]!, colormap[ONSET_INDEX * 4 + 1]!, colormap[ONSET_INDEX * 4 + 2]!]
  // De dekking van deze tabelingang zelf (een byte), niet de nominale inzetdekking: daarmee rekent de regel ook.
  const alpha = colormap[ONSET_INDEX * 4 + 3]! / 255
  const cells = GROUNDS.map((ground) => {
    const groundColour = GROUND_COLOURS[theme][ground]
    const onScreen = colourOverGround(onset, alpha, groundColour)
    return `${onScreen.join(',')} · ${(lightness(onScreen) - lightness(groundColour)).toFixed(1)} · ${colourDifference(onScreen, groundColour).toFixed(0)}`
  })
  console.log(`| ${blend} (${rainOnsetAlpha(blend)!.toFixed(2)}) | ${theme === 'light' ? 'dag' : 'nacht'} | ${contrast} | ${onset.join(',')} | ${cells.join(' | ')} |`)
}
