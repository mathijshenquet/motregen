import { createHash, randomUUID } from 'node:crypto'
import { access, mkdir, rename } from 'node:fs/promises'
import { join } from 'node:path'
import type { BrowserContext } from 'playwright'
import sharp, { type OverlayOptions } from 'sharp'
import { FRAME } from './config.js'
import { prepareNativeAsset } from './native-assets.js'
import { textPlacementKey, type TextPlacement, type Glyph } from './native-text.js'

const cell = { width: 48 * FRAME.scale, height: 48 * FRAME.scale }
const columns = 20

export async function nativeTextAtlas(origin: string, directory: string, context: () => Promise<BrowserContext>, placements: readonly TextPlacement[]): Promise<Map<string, Glyph>> {
  if (!placements.length) return new Map()
  const variants = [...new Map(placements.map((placement) => [textPlacementKey(placement), {
    key: textPlacementKey(placement), text: placement.text, color: placement.color, theme: placement.theme,
    angle: Number(placement.angle.toFixed(4)), phaseX: placement.screenX % 1, phaseY: placement.screenY % 1,
  }])).values()]
  const response = await fetch(origin, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error('App-stijl voor isolijntekst ontbreekt')
  const styles = [...(await response.text()).matchAll(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/g)].map((match) => new URL(match[1]!, origin).href)
  const key = createHash('sha256').update(JSON.stringify({ styles, cell, variants, version: 6 })).digest('hex').slice(0, 24)
  const path = join(directory, `isoline-text-${key}.png`)
  // Concurrent full-page captures failed in Chromium; DOM/font preparation can overlap.
  async function preparePng(): Promise<void> {
    try { await access(path); return } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    const page = await (await context()).newPage()
    try {
      await page.route('**/__native-isoline-text', (route) => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }))
      await page.goto(new URL('/__native-isoline-text', origin).href)
      for (const url of styles) await page.addStyleTag({ url })
      await page.addStyleTag({ content: `html,body{background:transparent!important;overflow:visible!important;height:auto!important;margin:0!important}body{display:grid;grid-template-columns:repeat(${columns},48px);grid-auto-rows:48px;align-content:start;width:${columns * 48}px}.native-text-cell{width:48px;height:48px;position:relative}.native-text-cell>.isoline-label{position:absolute}` })
      await page.evaluate(async (variants) => {
        document.body.innerHTML = ''
        for (const variant of variants) {
          const cell = document.createElement('div'); cell.className = 'native-text-cell maplibregl-map'
          const label = document.createElement('div'); label.className = `maplibregl-marker isoline-label isoline-label-${variant.theme}`; label.style.color = variant.color
          // At DPR 1.5, even/odd CSS translations give the app's integer/half-pixel phases.
          label.style.transform = `translate(-50%, -50%) translate(${24 + variant.phaseX * 2}px, ${24 + variant.phaseY * 2}px) rotateX(0deg) rotateZ(${variant.angle}deg)`
          const span = document.createElement('span'); span.textContent = variant.text
          label.append(span); cell.append(label); document.body.append(cell)
        }
        await document.fonts.ready
      }, variants)
      const batches: OverlayOptions[] = []
      await prepareNativeAsset(async () => {
        for (let row = 0; row < Math.ceil(variants.length / columns); row += 16) {
          const height = Math.min(16, Math.ceil(variants.length / columns) - row) * 48
          const png = await page.screenshot({ omitBackground: true, fullPage: true, clip: { x: 0, y: row * 48, width: columns * 48, height } })
          batches.push({ input: png, left: 0, top: row * cell.height })
        }
      })
      await page.close()
      await mkdir(directory, { recursive: true })
      const temporary = `${path}.${randomUUID()}.tmp`
      await sharp({ create: { width: columns * cell.width, height: Math.ceil(variants.length / columns) * cell.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(batches).png().toFile(temporary)
      await rename(temporary, path)
      console.info(JSON.stringify({ event: 'native-isoline-text-created', key, glyphs: variants.length }))
    } finally { await page.close() }
  }
  await preparePng()
  const metadata = await sharp(path).metadata()
  if (metadata.width !== cell.width * columns) throw new Error('Isolijntekst heeft verkeerde schaal')
  const glyphs = new Map<string, Glyph>()
  const batchSize = columns * 16
  for (let offset = 0; offset < variants.length; offset += batchSize) {
    const batch = variants.slice(offset, offset + batchSize)
    const sheet = await sharp(path, { sequentialRead: true }).extract({ left: 0, top: offset / columns * cell.height, width: metadata.width, height: Math.ceil(batch.length / columns) * cell.height }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    for (const [index, variant] of batch.entries()) {
      const left = (index % columns) * cell.width, top = Math.floor(index / columns) * cell.height
      let west = cell.width, east = 0, north = cell.height, south = 0
      for (let row = 0; row < cell.height; row++) for (let column = 0; column < cell.width; column++) {
        if (!sheet.data[((top + row) * sheet.info.width + left + column) * 4 + 3]) continue
        west = Math.min(west, column); east = Math.max(east, column + 1)
        north = Math.min(north, row); south = Math.max(south, row + 1)
      }
      const width = Math.max(0, east - west), height = Math.max(0, south - north)
      if (!width || !height) throw new Error(`Isolijntekst ontbreekt in atlas: ${variant.key}`)
      const rgba = Buffer.alloc(width * height * 4)
      for (let row = 0; row < height; row++) {
        const start = ((top + north + row) * sheet.info.width + left + west) * 4
        sheet.data.copy(rgba, row * width * 4, start, start + width * 4)
      }
      glyphs.set(variant.key, { rgba, width, height, centerX: (24 + variant.phaseX * 2) * FRAME.scale - west, centerY: (24 + variant.phaseY * 2) * FRAME.scale - north })
    }
  }
  return glyphs
}
