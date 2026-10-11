// U77: de paletten als stroken, zonder de app: elke rij is één palet over land, water en bebouwing (boven elkaar),
// links de lichte kaart en rechts de donkere. De x-as is de byte (0…254), met een streepje op 0,1 · 1 · 2,5 · 7,5 ·
// 30 · 100 mm/u. Snel kijken naar volgorde en contrast vóór de echte kaartbeelden; print ook L* per band.
// Gebruik (vanuit web/, rig gekopieerd naar tmp/u77/): pnpm exec tsx tmp/u77/swatches.ts <uit.png> [menging]
import sharp from 'sharp'
import { buildRainColormap, colourOverGround, GROUND_COLOURS, lightness, RAIN_PALETTES, rainRateIndex, type Ground, type RainBlendName, type Rgb } from '../../src/core/rain-palette'
import type { MapTheme } from '../../src/core/map-theme'

const [output = 'swatches.png', blend = 'drempel'] = process.argv.slice(2)
const THEMES: MapTheme[] = ['light', 'dark']
const GROUNDS: Ground[] = ['land', 'water', 'urban']
const TICK_RATES = [0.1, 1, 2.5, 7.5, 30, 100]
const SCALE = 3
const STRIP_HEIGHT = 26
const GAP = 14
const stripWidth = 255 * SCALE
const rowHeight = STRIP_HEIGHT * GROUNDS.length + GAP
const width = stripWidth * THEMES.length + GAP * (THEMES.length + 1)
const height = rowHeight * RAIN_PALETTES.length + GAP
const pixels = Buffer.alloc(width * height * 3, 128)

function paint(x: number, y: number, colour: Rgb): void {
  pixels.set(colour, (y * width + x) * 3)
}

for (const [paletteRow, palette] of RAIN_PALETTES.entries()) {
  for (const [themeColumn, theme] of THEMES.entries()) {
    const colormap = buildRainColormap({ palette, blend: blend as RainBlendName, theme })
    const left = GAP + themeColumn * (stripWidth + GAP)
    const top = GAP + paletteRow * rowHeight
    for (const [groundRow, ground] of GROUNDS.entries()) {
      for (let index = 0; index < 255; index++) {
        const colour: Rgb = [colormap[index * 4]!, colormap[index * 4 + 1]!, colormap[index * 4 + 2]!]
        const shown = colourOverGround(colour, colormap[index * 4 + 3]! / 255, GROUND_COLOURS[theme][ground])
        const isTick = TICK_RATES.some((rate) => Math.round(rainRateIndex(rate)) === index)
        for (let dx = 0; dx < SCALE; dx++) {
          for (let dy = 0; dy < STRIP_HEIGHT; dy++) {
            const tickPixel = isTick && dx === 0 && dy < 6 && groundRow === 0
            paint(left + index * SCALE + dx, top + groundRow * STRIP_HEIGHT + dy, tickPixel ? (theme === 'light' ? [0, 0, 0] : [255, 255, 255]) : shown)
          }
        }
      }
    }
    const describe = (rate: number) => {
      const index = Math.round(rainRateIndex(rate))
      const colour: Rgb = [colormap[index * 4]!, colormap[index * 4 + 1]!, colormap[index * 4 + 2]!]
      return `${rate}: ${colour.join(',')} L*${lightness(colour).toFixed(0)}`
    }
    console.log(`${palette} · ${theme} · ${[0.1, 0.5, 1, 2.5, 4, 7.5, 15, 30, 100].map(describe).join(' | ')}`)
  }
}
await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toFile(output)
console.log(output)
