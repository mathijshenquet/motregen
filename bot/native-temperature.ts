import type { Grid } from '../web/src/core/contract.js'
import { frameBlend, timelineCoverage } from '../web/src/core/time-model.js'
import { blendFrames, blurField, fieldRangeInView, isolineBlurPasses, isolineFrameWeights, adaptiveIsobarStep, ISOLINE_EDGE_FADE_MS, ISOLINE_RING_KM, ISOLINE_TOLERANCE_PX, ISOLINE_WINDOW, isolineFeatures, type IsolineFeatureCollection } from '../web/src/core/isolines.js'
import { prepareField, type PreparedField } from '../web/src/core/isoline-field.js'
import { sliceWeights, type FieldSlice } from '../web/src/core/isoline-spline.js'
import { blendSlice, buildSegments, traceContours, shortRings, ringFadeRaster, type Contour } from '../web/src/core/isoline-contours.js'
import { paletteRange, paletteStops, bandColor } from '../web/src/core/temperature-palette.js'
import { NETHERLANDS_FLANDERS_BOUNDS } from '../web/src/core/map-frame.js'
import { NativeRainData } from './native-rain.js'
import { FRAME } from './config.js'
import { nativeProjection } from './native-projection.js'
import type { StillManifest } from './stills.js'

export interface TemperatureSlice { grid: Grid; field: PreparedField; labelSlice?: FieldSlice; segments: Float32Array; contours: Contour[]; rings?: Float32Array; colors: Float32Array; opacity: number; kind: 'temperature' | 'pressure'; step: number; labelLines?: IsolineFeatureCollection; labelKey?: string }

export class NativeTemperatureData {
  readonly data: NativeRainData
  private readonly prepared = new Map<number, Promise<PreparedField>>()
  private colors?: Float32Array
  private step = 1
  private readonly labelLines = new Map<string, IsolineFeatureCollection>()
  constructor(origin: string, private readonly manifest: StillManifest, private readonly kind: 'temperature' | 'pressure' = 'temperature') { this.data = new NativeRainData(origin, manifest, kind === 'pressure' ? 'pressure_hpa' : 'feels_like_c') }

  field(index: number): Promise<PreparedField> {
    let pending = this.prepared.get(index)
    if (!pending) {
      pending = (async () => {
        const weights = isolineFrameWeights(index, this.data.timeline.length, this.kind)
        const frames = await Promise.all(weights.map(({ index }) => this.data.frame(this.data.timeline[index]!.epoch)))
        const grid = frames[0]!.grid
        return prepareField(blurField(blendFrames(frames.map((frame, position) => ({ data: frame.mix === 1 ? frame.right : frame.left, quant: (frame.mix === 1 ? frame.rightHeader : frame.leftHeader).quant, weight: weights[position]!.weight })), grid.width, grid.height), isolineBlurPasses(this.kind)))
      })()
      this.prepared.set(index, pending)
      void pending.catch(() => this.prepared.delete(index))
    }
    return pending
  }

  async prepare(epochs: readonly number[]): Promise<void> {
    const required = new Set<number>()
    for (const epoch of epochs) {
      const blend = frameBlend(this.data.timeline, epoch)
      for (const weight of sliceWeights(blend.left + blend.mix, this.data.timeline.length, ISOLINE_WINDOW)) required.add(weight.index)
    }
    await Promise.all([...required].map((index) => this.field(index)))
    if (this.kind === 'pressure') { this.colors = new Float32Array(256 * 3); return }
    let min = Infinity, max = -Infinity
    const now = Date.parse(this.manifest.now)
    const horizon = now + 18 * 3600_000
    for (const entry of this.data.timeline.filter((entry) => entry.epoch >= Math.floor(now / 3600_000) * 3600_000 && entry.epoch <= horizon)) {
      const frame = await this.data.frame(entry.epoch)
      const values = Float32Array.from(frame.mix === 1 ? frame.right : frame.left, (code) => (frame.mix === 1 ? frame.rightHeader : frame.leftHeader).quant[code] ?? NaN)
      const valid = Float32Array.from(values, (value) => Number.isNaN(value) ? 0 : 1)
      const range = fieldRangeInView(values, valid, frame.grid, NETHERLANDS_FLANDERS_BOUNDS)
      if (range) { min = Math.min(min, range[0]); max = Math.max(max, range[1]) }
    }
    const range = paletteRange(min, max)
    if (!range) throw new Error('Temperatuurpalet heeft geen geldig bereik')
    const stops = paletteStops(range)
    this.colors = Float32Array.from({ length: 256 * 3 }, (_, index) => bandColor(Math.floor(index / 3) - 128, 1, stops)[index % 3]!)
  }

  async slice(epoch: number): Promise<TemperatureSlice> {
    const blend = frameBlend(this.data.timeline, epoch)
    const weights = sliceWeights(blend.left + blend.mix, this.data.timeline.length, ISOLINE_WINDOW).filter(({ weight }) => weight > 0)
    const fields = await Promise.all(weights.map(({ index }) => this.field(index)))
    const field = blendSlice(fields, weights.map(({ weight }) => weight))
    const grid = (await this.data.frame(this.data.timeline[blend.left]!.epoch)).grid
    const projection = nativeProjection(grid)
    if (this.kind === 'pressure') {
      const nearest = await this.field(Math.round(blend.left + blend.mix))
      const range = fieldRangeInView(nearest.values, nearest.valid, grid, projection.bounds)
      if (range) this.step = adaptiveIsobarStep(range[0], range[1], this.step === 1 ? undefined : this.step)
    }
    const toleranceCells = 2 ** Math.round(Math.log2(ISOLINE_TOLERANCE_PX * projection.cellsPerPixel * FRAME.scale))
    const contours = traceContours(field, grid, { step: this.step, toleranceCells })
    const segments = buildSegments(contours, { ringKm: this.kind === 'pressure' ? 0 : ISOLINE_RING_KM }).data
    for (let offset = 0; offset < segments.length; offset += 6) {
      const start = projection.point(segments[offset]!, segments[offset + 1]!)
      const end = projection.point(segments[offset + 2]!, segments[offset + 3]!)
      segments[offset] = start[0]; segments[offset + 1] = start[1]; segments[offset + 2] = end[0]; segments[offset + 3] = end[1]
    }
    const labelIndex = blend.mix < 0.5 ? blend.left : blend.right
    const labelKey = `${labelIndex}:${this.step}`
    let labelLines = this.labelLines.get(labelKey)
    if (!labelLines) {
      const labelField = await this.field(labelIndex)
      const values = Float32Array.from(labelField.values, (value, index) => labelField.valid[index]! > 0.5 ? value : NaN)
      labelLines = isolineFeatures({ width: grid.width, height: grid.height, values }, grid, this.step, ISOLINE_RING_KM, this.kind)
      this.labelLines.set(labelKey, labelLines)
    }
    return { grid, field, labelSlice: { width: grid.width, height: grid.height, fields, weights: weights.map(({ weight }) => weight) }, segments, contours, labelLines, labelKey, kind: this.kind, step: this.step, rings: ringFadeRaster(shortRings(contours, ISOLINE_RING_KM), grid.width, grid.height), colors: this.colors!, opacity: timelineCoverage(this.data.timeline, epoch, ISOLINE_EDGE_FADE_MS) }
  }
}
