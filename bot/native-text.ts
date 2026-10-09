import sharp from 'sharp'
import { FRAME, FRAME_PIXELS } from './config.js'
import type { NativeTheme } from './native-map.js'

interface Glyph { rgba: Buffer; width: number; height: number }

export class NativeText {
  constructor(private readonly atlas?: Map<string, Glyph>) {}
  private readonly glyphs = new Map<string, Promise<Glyph>>()

  private glyph(text: string, color: string, theme: NativeTheme): Promise<Glyph> {
    const key = `${theme}:${color}:${text}`
    const captured = this.atlas?.get(key)
    if (captured) return Promise.resolve(captured)
    let pending = this.glyphs.get(key)
    if (!pending) {
      pending = (async () => {
        const width = 96, height = 48
        const halo = theme === 'dark' ? '#102027' : '#fff'
        const escaped = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="48" y="24" text-anchor="middle" dominant-baseline="central" font-family="Noto Sans, sans-serif" font-size="${11 * FRAME.scale}" font-weight="600" fill="${color}" stroke="${halo}" stroke-width="2" paint-order="stroke">${escaped}</text></svg>`
        return { rgba: await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer(), width, height }
      })()
      this.glyphs.set(key, pending)
    }
    return pending
  }

  async draw(rgb: Buffer, text: string, x: number, y: number, angle: number, color: string, theme: NativeTheme, opacity = 1): Promise<void> {
    const glyph = await this.glyph(text, color, theme)
    const cosine = Math.cos(angle * Math.PI / 180), sine = Math.sin(angle * Math.PI / 180)
    const horizontal = (Math.abs(cosine) * glyph.width + Math.abs(sine) * glyph.height) / 2
    const vertical = (Math.abs(sine) * glyph.width + Math.abs(cosine) * glyph.height) / 2
    const left = Math.max(0, Math.floor(x - horizontal)), right = Math.min(FRAME_PIXELS.width, Math.ceil(x + horizontal))
    const top = Math.max(0, Math.floor(y - vertical)), bottom = Math.min(FRAME_PIXELS.height, Math.ceil(y + vertical))
    for (let row = top; row < bottom; row++) for (let column = left; column < right; column++) {
      const sourceX = (column + 0.5 - x) * cosine + (row + 0.5 - y) * sine + glyph.width / 2 - 0.5
      const sourceY = -(column + 0.5 - x) * sine + (row + 0.5 - y) * cosine + glyph.height / 2 - 0.5
      const west = Math.floor(sourceX), north = Math.floor(sourceY)
      if (west < 0 || north < 0 || west + 1 >= glyph.width || north + 1 >= glyph.height) continue
      const horizontalWeight = sourceX - west, verticalWeight = sourceY - north
      const indexes = [(north * glyph.width + west) * 4, (north * glyph.width + west + 1) * 4, ((north + 1) * glyph.width + west) * 4, ((north + 1) * glyph.width + west + 1) * 4]
      const weights = [(1 - horizontalWeight) * (1 - verticalWeight), horizontalWeight * (1 - verticalWeight), (1 - horizontalWeight) * verticalWeight, horizontalWeight * verticalWeight]
      let alpha = 0
      const channels = [0, 0, 0]
      for (let corner = 0; corner < 4; corner++) {
        const coverage = glyph.rgba[indexes[corner]! + 3]! / 255 * weights[corner]! * opacity
        alpha += coverage
        for (let channel = 0; channel < 3; channel++) channels[channel] += glyph.rgba[indexes[corner]! + channel]! * coverage
      }
      if (!alpha) continue
      const destination = (row * FRAME_PIXELS.width + column) * 3
      for (let channel = 0; channel < 3; channel++) rgb[destination + channel] = Math.round(rgb[destination + channel]! * (1 - alpha) + channels[channel]!)
    }
  }
}
