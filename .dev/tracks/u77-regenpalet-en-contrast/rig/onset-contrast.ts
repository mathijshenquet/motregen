// U77: wat de contrastregel oplevert. Per palet en thema de beginkleur vóór en na de regel, en het
// helderheidsverschil (L*) van de lichtste zichtbare regen met land, water en bebouwing, per menging met een inzet.
// Daaronder: hoe ver de beginkleur bij een lagere inzetdekking moet opschuiven (0 = palet, 1 = zwart of wit), om te
// zien waar de ondergrens van de dekking ligt. Gebruik (vanuit web/): pnpm exec tsx tmp/u77/onset-contrast.ts
import { buildRainColormap, groundContrast, MINIMUM_GROUND_CONTRAST, ONSET_INDEX, contrastShiftFor, RAIN_PALETTES, rainOnsetAlpha, type Ground, type RainBlendName, type Rgb } from '../../src/core/rain-palette'

const GROUNDS: Ground[] = ['land', 'water', 'urban']
const BLENDS: RainBlendName[] = ['drempel', 'drempel-zacht']
const onsetEntry = (palette: typeof RAIN_PALETTES[number], blend: RainBlendName, theme: 'light' | 'dark'): { colour: Rgb; alpha: number } => {
  const colormap = buildRainColormap({ palette, blend, theme })
  return { colour: [colormap[ONSET_INDEX * 4]!, colormap[ONSET_INDEX * 4 + 1]!, colormap[ONSET_INDEX * 4 + 2]!], alpha: colormap[ONSET_INDEX * 4 + 3]! / 255 }
}
console.log(`| palet | thema | menging | inzetdekking | beginkleur palet | na de regel | land | water | bebouwing (minimum ${MINIMUM_GROUND_CONTRAST}) |`)
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for (const palette of RAIN_PALETTES) for (const theme of ['light', 'dark'] as const) for (const blend of BLENDS) {
  const plain = onsetEntry(palette, 'zuiver', theme)
  const guarded = onsetEntry(palette, blend, theme)
  const onsetAlpha = rainOnsetAlpha(blend)!
  const contrasts = GROUNDS.map((ground) => groundContrast(guarded.colour, onsetAlpha, theme, ground).toFixed(1))
  console.log(`| ${palette} | ${theme === 'light' ? 'dag' : 'nacht'} | ${blend} | ${onsetAlpha.toFixed(2)} | ${plain.colour.join(',')} | ${guarded.colour.join(',')} | ${contrasts.join(' | ')} |`)
}

console.log('')
console.log('| inzetdekking | dag: verschuiving naar zwart | dag: beginkleur | nacht: verschuiving naar wit | nacht: beginkleur |')
console.log('| --- | --- | --- | --- | --- |')
const mix = (colour: Rgb, target: number, shift: number) => colour.map((channel) => Math.round(channel + (target - channel) * shift)).join(',')
for (const alpha of [0.2, 0.25, 0.3, 0.35, 0.38, 0.4, 0.45, 0.55, 0.7]) {
  const day = onsetEntry('violet-klassen', 'zuiver', 'light').colour
  const night = onsetEntry('violet-klassen', 'zuiver', 'dark').colour
  const dayShift = contrastShiftFor(day, alpha, 'light')
  const nightShift = contrastShiftFor(night, alpha, 'dark')
  console.log(`| ${alpha.toFixed(2)} | ${dayShift.toFixed(2)} | ${mix(day, 0, dayShift)} | ${nightShift.toFixed(2)} | ${mix(night, 255, nightShift)} |`)
}
