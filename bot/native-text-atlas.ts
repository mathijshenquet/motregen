import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BrowserContext } from 'playwright'
import sharp from 'sharp'
import { FRAME, FRAME_PIXELS } from './config.js'
import { prepareNativeAsset } from './native-assets.js'
import { isolineColor } from '../web/src/core/isolines.js'

export interface TextGlyph { rgba: Buffer; width: number; height: number }
const cell = { width: 64 * FRAME.scale, height: 32 * FRAME.scale }
const temperatureLabels = Array.from({ length: 111 }, (_, index) => `${index - 50}°`)
const pressureLabels = Array.from({ length: 151 }, (_, index) => String(index + 950))
const labels = [...temperatureLabels, ...pressureLabels]
const variants = ['light', 'dark'].flatMap((theme) => labels.map((text) => ({ theme, text, color: isolineColor(theme as 'light' | 'dark', text.endsWith('°') ? 'temperature' : 'pressure') })))

export async function nativeTextAtlas(origin: string, directory: string, context: () => Promise<BrowserContext>): Promise<Map<string, TextGlyph>> {
  const response = await fetch(origin, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error('App-stijl voor isolijntekst ontbreekt')
  const styles = [...(await response.text()).matchAll(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/g)].map((match) => new URL(match[1]!, origin).href)
  const key = createHash('sha256').update(JSON.stringify({ styles, cell, variants, version: 1 })).digest('hex').slice(0, 24)
  const path = join(directory, `isoline-text-${key}.png`)
  const png = await prepareNativeAsset(async () => {
    try { return await readFile(path) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    const page = await (await context()).newPage()
    try {
      await page.route('**/__native-isoline-text', (route) => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }))
      await page.goto(new URL('/__native-isoline-text', origin).href)
      for (const url of styles) await page.addStyleTag({ url })
      await page.addStyleTag({ content: 'html,body{background:transparent!important;overflow:visible!important;height:auto!important;margin:0!important}body{display:grid;grid-template-columns:repeat(10,64px);width:640px}.native-text-cell{width:64px;height:32px;position:relative}.native-text-cell>.isoline-label{position:absolute;left:32px;top:16px;transform:translate(-50%,-50%)}' })
      await page.evaluate(async (variants) => {
        document.body.innerHTML = ''
        for (const variant of variants) {
          const cell = document.createElement('div'); cell.className = 'native-text-cell'
          const label = document.createElement('div'); label.className = `isoline-label isoline-label-${variant.theme}`; label.style.color = variant.color
          const span = document.createElement('span'); span.textContent = variant.text
          label.append(span); cell.append(label); document.body.append(cell)
        }
        await document.fonts.ready
      }, variants)
      const png = await page.screenshot({ omitBackground: true, fullPage: true })
      await mkdir(directory, { recursive: true })
      const temporary = `${path}.${randomUUID()}.tmp`
      await writeFile(temporary, png); await rename(temporary, path)
      console.info(JSON.stringify({ event: 'native-isoline-text-created', key, glyphs: variants.length }))
      return png
    } finally { await page.close() }
  })
  const sheet = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  if (sheet.info.width !== FRAME_PIXELS.width) throw new Error('Isolijntekst heeft verkeerde schaal')
  return new Map(variants.map((variant, index) => {
    const rgba = Buffer.alloc(cell.width * cell.height * 4)
    const left = (index % 10) * cell.width, top = Math.floor(index / 10) * cell.height
    for (let row = 0; row < cell.height; row++) {
      const start = ((top + row) * sheet.info.width + left) * 4
      sheet.data.copy(rgba, row * cell.width * 4, start, start + cell.width * 4)
    }
    return [`${variant.theme}:${variant.color}:${variant.text}`, { rgba, ...cell }]
  }))
}
