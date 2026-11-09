import { expect, it } from 'vitest'
import type { Grid } from '../web/src/core/contract.js'
import type { WindsockField } from '../web/src/core/windsock-flow.js'
import { FRAME_PIXELS } from './config.js'
import { fillPolygon, NativeWindsocks } from './native-windsocks.js'
import { NATIVE_VIEW } from './native-view.js'

it('fills a polygon with exact area coverage, also when it sticks out of the frame', () => {
  const size = { width: 8, height: 8 }
  const rgb = Buffer.alloc(8 * 8 * 3)
  // Van x 1,5 tot 5 en y 2 tot 4: kolom 1 half gedekt, kolommen 2–4 helemaal.
  fillPolygon(rgb, [[1.5, 2], [5, 2], [5, 4], [1.5, 4]], [200, 200, 200], 1, size)
  const red = (column: number, row: number) => rgb[(row * 8 + column) * 3]!
  expect([0, 1, 2, 3, 4, 5].map((column) => red(column, 2))).toEqual([0, 100, 200, 200, 200, 0])
  expect(red(3, 1)).toBe(0)
  expect(red(3, 4)).toBe(0)
  const clipped = Buffer.alloc(8 * 8 * 3)
  fillPolygon(clipped, [[-3, -3], [2, -3], [2, 2], [-3, 2]], [90, 90, 90], 1, size)
  expect(clipped[(1 * 8 + 1) * 3]).toBe(90)
  expect(clipped[(1 * 8 + 2) * 3]).toBe(0)
  const cut = Buffer.alloc(8 * 8 * 3)
  fillPolygon(cut, [[0, 0], [8, 0], [8, 8], [0, 8]], [90, 90, 90], 1, size, { x: 4, y: 4, radius: 2 })
  expect(cut[(4 * 8 + 4) * 3]).toBe(0)
  expect(cut[(0 * 8 + 0) * 3]).toBe(90)
})

it('draws an orange-white windsock with its Bft number at every place in view', async () => {
  const radius = 6378137
  const centreX = NATIVE_VIEW.lng * Math.PI / 180 * radius
  const centreY = Math.log(Math.tan(Math.PI / 4 + NATIVE_VIEW.lat * Math.PI / 360)) * radius
  const grid: Grid = { crs: 'EPSG:3857', x0: centreX - 600_000, y0: centreY + 600_000, dx: 50_000, dy: -50_000, width: 24, height: 24 }
  // 9 m/s naar het oosten: 5 Bft, een volle zak.
  const vectors = new Float32Array(24 * 24 * 2)
  for (let index = 0; index < 24 * 24; index++) vectors[index * 2] = 9
  const slice = { left: vectors, right: vectors, mix: 0 }
  const field: WindsockField = { grid, slices: [slice, slice, slice] }
  const socks = await NativeWindsocks.prepare()
  const rgb = Buffer.alloc(FRAME_PIXELS.width * FRAME_PIXELS.height * 3, 120)
  await socks.draw(rgb, field, 1, 'light')
  let orange = 0
  for (let offset = 0; offset < rgb.length; offset += 3) if (rgb[offset]! === 0xf2 && rgb[offset + 1]! === 0x66 && rgb[offset + 2]! === 0x1c) orange++
  // Een volle zak op de botschaal heeft honderden oranje pixels; er staan er ruim twintig in beeld.
  expect(orange).toBeGreaterThan(20 * 200)
}, 20000)
