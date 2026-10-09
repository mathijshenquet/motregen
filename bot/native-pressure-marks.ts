import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import type { BrowserContext } from 'playwright'
import { pressureExtrema, PRESSURE_EXTREMUM_KM } from '../web/src/core/isolines.js'
import type { PreparedField } from '../web/src/core/isoline-field.js'
import type { Grid } from '../web/src/core/contract.js'
import { FRAME } from './config.js'
import { NativeText } from './native-text.js'
import { nativeProjection } from './native-projection.js'
import { prepareNativeAsset } from './native-assets.js'
import type { NativeTheme } from './native-map.js'

interface PressureMark { kind: 'H' | 'L'; column: number; row: number; value: number; opacity: number }

export class NativePressureMarks {
  private readonly cache = new WeakMap<PreparedField, PressureMark[]>()
  private constructor(private readonly text: NativeText) {}

  static async prepare(directory: string, context: () => Promise<BrowserContext>): Promise<NativePressureMarks> {
    const path = join(directory, 'pressure-marks-v1.png')
    const png = await prepareNativeAsset(async () => {
      try { return await readFile(path) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      const page = await (await context()).newPage()
      try {
        const data = await page.evaluate(() => {
          const canvas = document.createElement('canvas')
          canvas.width = 256
          canvas.height = 64
          const context = canvas.getContext('2d')!
          context.font = '800 50px system-ui, sans-serif'
          context.textAlign = 'center'
          context.textBaseline = 'middle'
          context.lineJoin = 'round'
          for (const [index, letter, color, halo] of [[0, 'H', '#d4352c', 'rgba(255,255,255,0.9)'], [1, 'L', '#2462c7', 'rgba(255,255,255,0.9)'], [2, 'H', '#ff6b5e', 'rgba(8,21,28,0.85)'], [3, 'L', '#6ea3ff', 'rgba(8,21,28,0.85)']] as const) {
            context.lineWidth = 7.68
            context.strokeStyle = halo
            context.fillStyle = color
            context.strokeText(letter, (index + 0.5) * 64, 34.56)
            context.fillText(letter, (index + 0.5) * 64, 34.56)
          }
          return canvas.toDataURL('image/png').split(',')[1]!
        })
        const png = Buffer.from(data, 'base64')
        await writeFile(path, png)
        return png
      } finally { await page.close() }
    })
    const raw = await sharp(png).ensureAlpha().raw().toBuffer()
    const atlas = new Map()
    for (const [index, theme, letter] of [[0, 'light', 'H'], [1, 'light', 'L'], [2, 'dark', 'H'], [3, 'dark', 'L']] as const) {
      const rgba = Buffer.alloc(64 * 64 * 4)
      for (let row = 0; row < 64; row++) raw.copy(rgba, row * 64 * 4, (row * 256 + index * 64) * 4, (row * 256 + (index + 1) * 64) * 4)
      atlas.set(`${theme}:pressure:${letter}`, { rgba, width: 64, height: 64 })
    }
    return new NativePressureMarks(new NativeText(atlas))
  }

  private marks(field: PreparedField, grid: Grid): PressureMark[] {
    let marks = this.cache.get(field)
    if (!marks) {
      const cellKm = Math.abs(grid.dx) * Math.cos(52 * Math.PI / 180) / 1000
      marks = pressureExtrema(field.values, field.valid, grid.width, grid.height, Math.max(2, Math.round(PRESSURE_EXTREMUM_KM / cellKm))).map((mark) => ({ ...mark, opacity: 1 }))
      this.cache.set(field, marks)
    }
    return marks
  }

  async draw(rgb: Buffer, grid: Grid, leftField: PreparedField, rightField: PreparedField, mix: number, theme: NativeTheme, opacity: number): Promise<void> {
    const left = this.marks(leftField, grid), right = this.marks(rightField, grid)
    const used = new Set<PressureMark>()
    const shown: PressureMark[] = []
    const cellKm = Math.abs(grid.dx) * Math.cos(52 * Math.PI / 180) / 1000
    for (const from of left) {
      const distance = (candidate: PressureMark) => Math.hypot(candidate.column - from.column, candidate.row - from.row) * cellKm
      const to = right.filter((candidate) => candidate.kind === from.kind && !used.has(candidate) && distance(candidate) < 300).sort((first, second) => distance(first) - distance(second))[0]
      if (to) {
        used.add(to)
        shown.push({ ...from, column: from.column + (to.column - from.column) * mix, row: from.row + (to.row - from.row) * mix })
      } else shown.push({ ...from, opacity: 1 - mix })
    }
    for (const to of right) if (!used.has(to)) shown.push({ ...to, opacity: mix })
    const projection = nativeProjection(grid)
    for (const mark of shown) {
      if (mark.opacity <= 0.01) continue
      const [screenX, screenY] = projection.point(mark.column, mark.row)
      await this.text.draw(rgb, mark.kind, screenX, screenY, 0, 'pressure', theme, mark.opacity * opacity, 30 * FRAME.scale / 64)
    }
  }
}
