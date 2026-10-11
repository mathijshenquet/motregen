import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { expect, it } from 'vitest'
import { FRAME_PIXELS } from './config.js'
import { NATIVE_VIEW } from './native-view.js'

it('keeps the installed Rust baseplates aligned with the bot view and frame size', async () => {
  const directory = new URL('../crates/render/assets/basemaps/', import.meta.url)
  const metadata = JSON.parse(await readFile(new URL('basemap.json', directory), 'utf8'))
  expect(metadata.version).toBe(1)
  expect(metadata.size).toEqual(FRAME_PIXELS)
  expect(metadata.view).toEqual(NATIVE_VIEW)
  for (const theme of ['light', 'dark']) {
    const plate = await sharp(fileURLToPath(new URL(`${theme}.png`, directory))).metadata()
    expect({ width: plate.width, height: plate.height }).toEqual(FRAME_PIXELS)
    const water = await sharp(fileURLToPath(new URL(`water-${theme}.png`, directory))).metadata()
    expect(water.hasAlpha).toBe(true)
    expect(water.width).toBeGreaterThan(0)
    expect(water.height).toBeGreaterThan(0)
  }
})
