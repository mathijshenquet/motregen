// U77: wat de contrastregel oplevert. Per palet en thema de beginkleur vóór en na de regel, en het
// helderheidsverschil (L*) van de lichtste zichtbare regen met land, water en bebouwing bij menging `drempel`.
// Gebruik (vanuit web/): pnpm exec tsx tmp/u77/onset-contrast.ts
import { buildRainColormap, groundContrast, MINIMUM_GROUND_CONTRAST, ONSET_INDEX, RAIN_PALETTES, type Ground, type Rgb } from '../../src/core/rain-palette'

const GROUNDS: Ground[] = ['land', 'water', 'urban']
console.log(`| palet | thema | beginkleur palet | na de regel | dekking | land | water | bebouwing | (minimum ${MINIMUM_GROUND_CONTRAST}) |`)
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for (const palette of RAIN_PALETTES) for (const theme of ['light', 'dark'] as const) {
  const colourIn = (blend: 'zuiver' | 'drempel'): { colour: Rgb; alpha: number } => {
    const colormap = buildRainColormap({ palette, blend, theme })
    return { colour: [colormap[ONSET_INDEX * 4]!, colormap[ONSET_INDEX * 4 + 1]!, colormap[ONSET_INDEX * 4 + 2]!], alpha: colormap[ONSET_INDEX * 4 + 3]! / 255 }
  }
  const plain = colourIn('zuiver')
  const guarded = colourIn('drempel')
  const contrasts = GROUNDS.map((ground) => groundContrast(guarded.colour, guarded.alpha, theme, ground).toFixed(1))
  const direction = theme === 'light' ? 'donkerder' : 'lichter'
  console.log(`| ${palette} | ${theme === 'light' ? 'dag' : 'nacht'} | ${plain.colour.join(',')} | ${guarded.colour.join(',')} | ${guarded.alpha.toFixed(2)} | ${contrasts.join(' | ')} | ${direction} |`)
}
