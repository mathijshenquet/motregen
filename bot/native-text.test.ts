import { expect, it } from 'vitest'
import { FRAME_PIXELS } from './config.js'
import { NativeText, textPlacementKey } from './native-text.js'

it('places a captured rotated glyph at its physical phase without a second resampling', async () => {
  const placement = { text: '12°', screenX: 10.5, screenY: 12, angle: 43, color: '#33474f', theme: 'light' as const, opacity: 0.5 }
  const rgba = Buffer.from([200, 100, 50, 255, 0, 200, 100, 128])
  const text = new NativeText(new Map([[textPlacementKey(placement), { rgba, width: 2, height: 1, centerX: 0.5, centerY: 0 }]]))
  const rgb = Buffer.alloc(FRAME_PIXELS.width * FRAME_PIXELS.height * 3, 100)
  await text.draw(rgb, placement.text, placement.screenX, placement.screenY, placement.angle, placement.color, placement.theme, placement.opacity)
  const offset = (12 * FRAME_PIXELS.width + 10) * 3
  expect([...rgb.subarray(offset, offset + 6)]).toEqual([150, 100, 75, 75, 125, 100])
  expect(rgb[offset - 1]).toBe(100)
  expect(rgb[offset + 6]).toBe(100)
})
