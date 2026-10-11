import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Grid, Manifest } from '../web/src/core/contract.js'
import { parseMrfHeader, decodeFrame } from '../web/src/core/mrf-codec.js'
import { blurField, isolineFeatures, isolineBlurPasses } from '../web/src/core/isolines.js'
import { prepareField } from '../web/src/core/isoline-field.js'
import { traceContours } from '../web/src/core/isoline-contours.js'
import { NativeIsolineLabels } from './native-isoline-labels.js'
import { nativeProjection } from './native-projection.js'
import { FRAME } from './config.js'

interface Input { source: string; kind: 'pressure' | 'temperature'; grid: Grid; raw: Array<number | null>; step: number }
const path = new URL('../crates/render-core/assets/isoline-fixtures.json', import.meta.url)

async function realInputs(directory: string): Promise<Input[]> {
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')) as Manifest
  const inputs: Input[] = []
  for (const [field, index] of [['pressure_hpa', 3], ['feels_like_c', 3], ['feels_like_c', 12]] as const) {
    const chunk = manifest.chunks.find((chunk) => chunk.field === field)!
    const bytes = await readFile(join(directory, chunk.url))
    const headerLength = bytes.readUInt32LE(4) + 8
    const header = parseMrfHeader(bytes.subarray(0, headerLength))
    const frame = header.frames[Math.min(index, header.frames.length - 1)]!
    const codes = decodeFrame(bytes.subarray(headerLength + frame.offset, headerLength + frame.offset + frame.len), header.grid.width * header.grid.height, header.pred ? header.grid : undefined)
    const projection = nativeProjection(header.grid)
    const width = 64, height = 80
    const left = Math.max(0, Math.min(header.grid.width - width, Math.floor(projection.columns[480]! - width / 2)))
    const top = Math.max(0, Math.min(header.grid.height - height, Math.floor(projection.rows[636]! - height / 2)))
    const grid = { ...header.grid, x0: header.grid.x0 + left * header.grid.dx, y0: header.grid.y0 + top * header.grid.dy, width, height }
    const raw = Array.from({ length: width * height }, (_, index) => header.quant[codes[(top + Math.floor(index / width)) * header.grid.width + left + index % width]!]!)
    inputs.push({ source: `${chunk.url}:${frame.time}:crop(${left},${top},${width},${height})`, kind: field === 'pressure_hpa' ? 'pressure' : 'temperature', grid, raw, step: field === 'pressure_hpa' ? 1 : 1 })
  }
  return inputs
}

export async function generateIsolineFixtures(check = false, directory?: string): Promise<void> {
  const inputs = directory ? await realInputs(directory) : (JSON.parse(await readFile(path, 'utf8')) as { inputs: Input[] }).inputs
  const fixtures = inputs.map((input) => {
    const { grid, kind, step } = input
    const prepared = prepareField(blurField({ width: grid.width, height: grid.height, values: Float32Array.from(input.raw, (value) => value ?? NaN) }, isolineBlurPasses(kind)))
    const projection = nativeProjection(grid)
    const tolerance = 2 ** Math.round(Math.log2(0.25 * projection.cellsPerPixel * FRAME.scale))
    const contours = traceContours(prepared, grid, { step, toleranceCells: tolerance })
    const labelLines = isolineFeatures({ width: grid.width, height: grid.height, values: Float32Array.from(prepared.values, (value, index) => prepared.valid[index]! > 0.5 ? value : NaN) }, grid, step, 60, kind)
    const labels = new NativeIsolineLabels().place({ grid, kind, step, field: prepared, contours, labelLines, labelKey: 'fixture', colors: new Float32Array(), segments: new Float32Array(), opacity: 1 }, 'light')
    return { prepared: { values: Array.from(prepared.values), valid: Array.from(prepared.valid) }, tolerance,
      contours: contours.map((contour) => ({ level: contour.level, closed: contour.closed, points: Array.from({ length: contour.points.length / 2 }, (_, index) => [contour.points[index * 2], contour.points[index * 2 + 1]]), length_km: contour.lengthKm })), labels }
  })
  const expected = JSON.stringify({ inputs, fixtures }) + '\n'
  if (check) {
    if (await readFile(path, 'utf8') !== expected) throw new Error('Verouderde isolijnfixtures; draai pnpm -C bot render:constants')
  } else await writeFile(path, expected)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await generateIsolineFixtures(process.argv.includes('--check'), process.argv.find((argument) => argument.startsWith('--data-dir='))?.slice('--data-dir='.length))
