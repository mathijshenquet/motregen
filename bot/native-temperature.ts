import type { Grid } from '../web/src/core/contract.js'
import { frameBlend, timelineCoverage } from '../web/src/core/time-model.js'
import { blendFrames, blurField, isolineBlurPasses, isolineFrameWeights, ISOLINE_EDGE_FADE_MS, ISOLINE_RING_KM, ISOLINE_WINDOW, isolineFeatures, type IsolineFeatureCollection } from '../web/src/core/isolines.js'
import { prepareField, type PreparedField } from '../web/src/core/isoline-field.js'
import { sliceWeights, type FieldSlice } from '../web/src/core/isoline-spline.js'
import { blendSlice, buildSegments, traceContours, shortRings, ringFadeRaster, type Contour, type ShortRing } from '../web/src/core/isoline-contours.js'
import { bandColor, FIXED_SCALE_STOPS } from '../web/src/core/temperature-palette.js'
import { NativeRainData, type RainFrame } from './native-rain.js'
import { beaufortFrame, BEAUFORT_COLORS } from '../web/src/core/wind-beaufort.js'
import { FRAME } from './config.js'
import { isolineTolerancePx } from './native-view.js'
import { nativeProjection } from './native-projection.js'
import type { StillManifest } from './stills.js'

/** Gevoelstemperatuur, of de Beaufortvlakken van de windmodus (U101): de continue Bft uit u en v, zoals in de app. */
export type NativeFieldKind = 'temperature' | 'wind'
export interface TemperatureSlice { grid: Grid; field: PreparedField; labelSlice?: FieldSlice; segments: Float32Array; contours: Contour[]; rings?: Float32Array; colors: Float32Array; opacity: number; kind: NativeFieldKind; step: number; labelLines?: IsolineFeatureCollection; labelKey?: string }
export type RasterSlice = Pick<TemperatureSlice, 'grid' | 'segments' | 'opacity'> & { kind: NativeFieldKind; field: PreparedField; rings?: Float32Array; colors: Float32Array }
export type RasterGeometry = Pick<TemperatureSlice, 'grid' | 'segments' | 'opacity' | 'kind'> & { rings: ShortRing[] }

export class NativeTemperatureData {
  readonly data: NativeRainData
  private readonly prepared = new Map<number, Promise<PreparedField>>()
  private colors?: Float32Array
  private readonly step = 1
  private readonly labelLines = new Map<string, IsolineFeatureCollection>()
  /** Alleen bij `wind`: de noordcomponent; `data` is dan de oostcomponent en geeft de tijdlijn. */
  private readonly northward?: NativeRainData
  constructor(origin: string, manifest: StillManifest, private readonly kind: NativeFieldKind = 'temperature') {
    this.data = new NativeRainData(origin, manifest, kind === 'wind' ? 'wind_u_ms' : 'feels_like_c')
    if (kind === 'wind') this.northward = new NativeRainData(origin, manifest, 'wind_v_ms')
  }

  /** Het uurframe op een exact uur als codes met hun quantisering (wind: Beaufort uit u en v). */
  private async hourFrame(epoch: number): Promise<{ grid: Grid; data: Uint8Array; quant: Array<number | null> }> {
    const exact = (frame: RainFrame) => frame.mix === 1 ? { data: frame.right, header: frame.rightHeader } : { data: frame.left, header: frame.leftHeader }
    const eastward = await this.data.frame(epoch)
    if (!this.northward) {
      const { data, header } = exact(eastward)
      return { grid: eastward.grid, data, quant: header.quant }
    }
    const east = exact(eastward), north = exact(await this.northward.frame(epoch))
    return { grid: eastward.grid, ...beaufortFrame(east.data, north.data, east.header, north.header) }
  }

  field(index: number): Promise<PreparedField> {
    let pending = this.prepared.get(index)
    if (!pending) {
      pending = (async () => {
        const weights = isolineFrameWeights(index, this.data.timeline.length, this.kind)
        const frames = await Promise.all(weights.map(({ index }) => this.hourFrame(this.data.timeline[index]!.epoch)))
        const grid = frames[0]!.grid
        return prepareField(blurField(blendFrames(frames.map((frame, position) => ({ data: frame.data, quant: frame.quant, weight: weights[position]!.weight })), grid.width, grid.height), isolineBlurPasses(this.kind)))
      })()
      void pending.catch(() => this.prepared.delete(index))
    }
    this.prepared.delete(index)
    this.prepared.set(index, pending)
    while (this.prepared.size > 4) this.prepared.delete(this.prepared.keys().next().value!)
    return pending
  }

  /** De vaste schaal (U100), gelijk aan de standaard van de app; bij wind de Beaufortkleuren. */
  async prepare(): Promise<void> {
    if (this.kind === 'wind') {
      // Band k (tussen de lijnen k en k+1) is Beaufortklasse k, zoals beaufortPalette in de app.
      this.colors = Float32Array.from({ length: 256 * 3 }, (_, index) => {
        const force = Math.max(0, Math.min(BEAUFORT_COLORS.length - 1, Math.floor(index / 3) - 128))
        return Number.parseInt(BEAUFORT_COLORS[force]!.slice(1 + (index % 3) * 2, 3 + (index % 3) * 2), 16) / 255
      })
      return
    }
    this.colors = Float32Array.from({ length: 256 * 3 }, (_, index) => bandColor(Math.floor(index / 3) - 128, 1, FIXED_SCALE_STOPS)[index % 3]!)
  }

  clear(): void { this.prepared.clear(); this.labelLines.clear(); this.data.clear(); this.northward?.clear() }

  private async blendedField(epoch: number) {
    const blend = frameBlend(this.data.timeline, epoch)
    const weights = sliceWeights(blend.left + blend.mix, this.data.timeline.length, ISOLINE_WINDOW).filter(({ weight }) => weight > 0)
    const fields = await Promise.all(weights.map(({ index }) => this.field(index)))
    const field = blendSlice(fields, weights.map(({ weight }) => weight))
    const grid = (await this.data.frame(this.data.timeline[blend.left]!.epoch)).grid
    return { blend, weights, fields, field, grid }
  }

  async rasterSlice(epoch: number, geometry: RasterGeometry): Promise<RasterSlice> {
    const { field } = await this.blendedField(epoch)
    const rings = geometry.kind === 'temperature' ? ringFadeRaster(geometry.rings, geometry.grid.width, geometry.grid.height) : undefined
    return { ...geometry, field, rings, colors: this.colors! }
  }

  async slice(epoch: number, options: { rasterizeRings?: boolean } = {}): Promise<TemperatureSlice> {
    const { blend, weights, fields, field, grid } = await this.blendedField(epoch)
    const projection = nativeProjection(grid)
    const toleranceCells = 2 ** Math.round(Math.log2(isolineTolerancePx() * projection.cellsPerPixel * FRAME.scale))
    const contours = traceContours(field, grid, { step: this.step, toleranceCells })
    const segments = buildSegments(contours, { ringKm: this.kind === 'wind' ? 0 : ISOLINE_RING_KM }).data
    for (let offset = 0; offset < segments.length; offset += 6) {
      const start = projection.point(segments[offset]!, segments[offset + 1]!)
      const end = projection.point(segments[offset + 2]!, segments[offset + 3]!)
      segments[offset] = start[0]; segments[offset + 1] = start[1]; segments[offset + 2] = end[0]; segments[offset + 3] = end[1]
    }
    const labelIndex = blend.mix < 0.5 ? blend.left : blend.right
    const labelKey = `${labelIndex}:${this.step}`
    let labelLines = this.labelLines.get(labelKey)
    // De Bft-grenzen dragen geen label: de vlakken en de windzakken geven de waarde (zoals in de app).
    if (!labelLines && this.kind !== 'wind') {
      const labelField = await this.field(labelIndex)
      const values = Float32Array.from(labelField.values, (value, index) => labelField.valid[index]! > 0.5 ? value : NaN)
      labelLines = isolineFeatures({ width: grid.width, height: grid.height, values }, grid, this.step, ISOLINE_RING_KM, this.kind)
      this.labelLines.set(labelKey, labelLines)
      while (this.labelLines.size > 2) this.labelLines.delete(this.labelLines.keys().next().value!)
    }
    return { grid, field, labelSlice: { width: grid.width, height: grid.height, fields, weights: weights.map(({ weight }) => weight) }, segments, contours, labelLines, labelKey, kind: this.kind, step: this.step, rings: options.rasterizeRings !== false && this.kind === 'temperature' ? ringFadeRaster(shortRings(contours, ISOLINE_RING_KM), grid.width, grid.height) : undefined, colors: this.colors!, opacity: timelineCoverage(this.data.timeline, epoch, ISOLINE_EDGE_FADE_MS) }
  }
}
