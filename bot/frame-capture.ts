import sharp from 'sharp'
import { FRAME_PIXELS } from './config.js'

/**
 * Een schermafdruk van het hele FRAME_VIEWPORT, teruggeknipt naar FRAME_PIXELS. Chromium rondt een clip af op hele
 * CSS-pixels (426 → 959, 427 → 961 bij schaal 2,25), dus exact 960 pixels kan alleen door bij te knippen.
 */
export async function frameScreenshot(png: Buffer): Promise<Buffer> {
  return sharp(png).extract({ left: 0, top: 0, ...FRAME_PIXELS }).png().toBuffer()
}
