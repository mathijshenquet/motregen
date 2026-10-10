// U77: kleurverschil (CIE76) tussen de banden licht (0,5 mm/u), matig (4,5) en zwaar (15) per palet en thema, bij
// normaal kleurzicht en zonder rood- of groengevoelige kegeltjes. Dezelfde rekening als de unit-test, maar als tabel
// met alle waarden in plaats van alleen de eerste die zakt. Gebruik (vanuit web/): pnpm exec tsx tmp/u77/band-differences.ts
import { buildRainColormap, RAIN_PALETTES, rainRateIndex, type Rgb } from '../../src/core/rain-palette'

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

const PAIRS: Array<[string, number, number]> = [['licht–matig', 0.5, 4.5], ['matig–zwaar', 4.5, 15], ['licht–zwaar', 0.5, 15]]
console.log('| palet | thema | ' + Object.keys(VISION).flatMap((name) => PAIRS.map(([pair]) => `${name} ${pair}`)).join(' | ') + ' |')
console.log('| --- | --- | ' + Object.keys(VISION).flatMap(() => PAIRS.map(() => '---')).join(' | ') + ' |')
for (const palette of RAIN_PALETTES) for (const theme of ['light', 'dark'] as const) {
  const colormap = buildRainColormap({ palette, blend: 'drempel', theme })
  const colourAt = (rate: number): Rgb => { const index = Math.round(rainRateIndex(rate)); return [colormap[index * 4]!, colormap[index * 4 + 1]!, colormap[index * 4 + 2]!] }
  const cells = Object.values(VISION).flatMap((vision) => PAIRS.map(([, left, right]) => colourDifference(colourAt(left), colourAt(right), vision).toFixed(0)))
  console.log(`| ${palette} | ${theme === 'light' ? 'dag' : 'nacht'} | ${cells.join(' | ')} |`)
}
