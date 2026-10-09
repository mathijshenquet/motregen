import { NativeRaster } from './native-raster.js'
import { zstdDecompressSync } from 'node:zlib'
import type { Field, Grid, Manifest, MrfHeader, TimelineFrame } from '../web/src/core/contract.js'
import { decodeFrame, parseMrfHeader } from '../web/src/core/mrf-codec.js'
import { buildTimeline, frameBlend } from '../web/src/core/time-model.js'
import { rainColormap } from '../web/src/core/rain-chart.js'
import { rainPresentation } from '../web/src/core/rain-presentation.js'
import { stillMapTheme } from '../web/src/core/still-theme.js'
import { selectPairMotion } from '../web/src/core/motion-selection.js'
import { FLOW_BLEND_CURVE, motionWarpStrength } from '../web/src/core/rain-motion.js'
import { FRAME_PIXELS } from './config.js'
import { NATIVE_VIEW, type NativeTheme } from './native-map.js'
import type { StillManifest } from './stills.js'

interface RainChunk { header: MrfHeader; bytes: Uint8Array; headerLength: number; frames: Map<number, Uint8Array> }
export interface RainFrame { grid: Grid; left: Uint8Array; right: Uint8Array; mix: number; leftHeader: MrfHeader; rightHeader: MrfHeader; motion?: { width: number; height: number; vectors: Int8Array }; intervalMinutes: number }

export class NativeRainData {
  readonly timeline: TimelineFrame[]
  private readonly chunks = new Map<string, Promise<RainChunk>>()
  constructor(private readonly origin: string, manifest: StillManifest, field: Field = 'rain_rate') {
    this.timeline = buildTimeline(manifest as Manifest, field)
    if (!this.timeline.length) throw new Error('Regen ontbreekt in manifest')
  }

  async prefetch(epochs: readonly number[]): Promise<void> {
    const chunks = new Map<string, TimelineFrame>()
    for (const epoch of epochs) {
      const blend = frameBlend(this.timeline, epoch)
      for (const index of [blend.left, blend.right]) {
        const frame = this.timeline[index]!
        if (!chunks.has(frame.chunk.url)) chunks.set(frame.chunk.url, frame)
      }
    }
    await Promise.all([...chunks.values()].map((frame) => this.load(frame)))
  }

  async frame(epoch: number): Promise<RainFrame> {
    if (epoch < this.timeline[0]!.epoch || epoch > this.timeline.at(-1)!.epoch) throw new Error('Frame valt buiten de beschikbare tijdlijn')
    const blend = frameBlend(this.timeline, epoch)
    const leftFrame = this.timeline[blend.left]!, rightFrame = this.timeline[blend.right]!
    const [left, right] = await Promise.all([this.load(leftFrame), this.load(rightFrame)])
    if (JSON.stringify(left.grid) !== JSON.stringify(right.grid)) throw new Error('Regenframes hebben verschillende roosters')
    const selected = blend.mix > 0 && blend.mix < 1 ? selectPairMotion(leftFrame, rightFrame, (frame) => {
      const header = frame.chunk.url === leftFrame.chunk.url ? left.header : right.header
      return header.frames[frame.frameIndex]?.motion !== undefined
    }) : undefined
    let motion: RainFrame['motion']
    if (selected) {
      const chunk = await this.chunks.get(selected.frame.chunk.url)!
      const index = chunk.header.frames[selected.frame.frameIndex]?.motion
      const size = chunk.header.motion_grid
      if (index && size) {
        const start = chunk.headerLength + index.offset
        const vectors = decodeFrame(chunk.bytes.subarray(start, start + index.len), size.bw * size.bh * 2, undefined, zstdDecompressSync)
        motion = { width: size.bw, height: size.bh, vectors: new Int8Array(vectors.buffer, vectors.byteOffset, vectors.byteLength) }
      }
    }
    return { grid: left.grid, left: left.raster, right: right.raster, mix: blend.mix, leftHeader: left.header, rightHeader: right.header, motion, intervalMinutes: (rightFrame.epoch - leftFrame.epoch) / 60_000 }
  }

  private async load(frame: TimelineFrame): Promise<{ grid: Grid; raster: Uint8Array; header: MrfHeader }> {
    let pending = this.chunks.get(frame.chunk.url)
    if (!pending) {
      pending = (async () => {
        const response = await fetch(new URL(frame.chunk.url, new URL('/data/manifest.json', this.origin)), { signal: AbortSignal.timeout(30_000) })
        if (!response.ok) throw new Error(`Regenchunk laden mislukt (${response.status})`)
        const bytes = new Uint8Array(await response.arrayBuffer())
        const headerLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true) + 8
        return { header: parseMrfHeader(bytes.subarray(0, headerLength)), bytes, headerLength, frames: new Map<number, Uint8Array>() }
      })()
      this.chunks.set(frame.chunk.url, pending)
    }
    const chunk = await pending
    let raster = chunk.frames.get(frame.frameIndex)
    if (!raster) {
      const index = chunk.header.frames[frame.frameIndex]
      if (!index || index.time !== frame.time) throw new Error('Regenchunk wijkt af van manifest')
      const start = chunk.headerLength + index.offset
      const { width, height } = chunk.header.grid
      raster = decodeFrame(chunk.bytes.subarray(start, start + index.len), width * height, chunk.header.pred ? { width, height } : undefined, zstdDecompressSync)
      chunk.frames.set(frame.frameIndex, raster)
    }
    return { grid: chunk.header.grid, raster, header: chunk.header }
  }
}

export function rainTheme(epoch: number): NativeTheme {
  return stillMapTheme(epoch)
}

export class RainCompositor {
  private readonly columns: Float64Array
  private readonly rows: Float64Array
  private readonly colors = new Float32Array(65536 * 4)
  private readonly native: NativeRaster
  private readonly motionSample = new Float64Array(2)
  private readonly motionIndexes = new Int32Array(4)
  private readonly motionWeights = new Float64Array(4)
  constructor(private readonly grid: Grid, private readonly size = FRAME_PIXELS, view = NATIVE_VIEW) {
    const palette = rainColormap()
    for (let index = 0; index < 65536; index++) {
      const position = Math.max(0, Math.min(255, index / 255 - 0.5))
      const lower = Math.floor(position), upper = Math.min(255, lower + 1), weight = position - lower
      const alpha = (palette[lower * 4 + 3]! * (1 - weight) + palette[upper * 4 + 3]! * weight) / 255
      for (let channel = 0; channel < 3; channel++) this.colors[index * 4 + channel] = (palette[lower * 4 + channel]! * (1 - weight) + palette[upper * 4 + channel]! * weight) * alpha
      this.colors[index * 4 + 3] = 1 - alpha * alpha
    }
    const worldMeters = 2 * Math.PI * 6378137
    const metersPerPixel = worldMeters / (512 * 2 ** view.zoom * (size.width / 640))
    const centerX = view.lng * Math.PI / 180 * 6378137
    const centerY = Math.log(Math.tan(Math.PI / 4 + view.lat * Math.PI / 360)) * 6378137
    this.columns = Float64Array.from({ length: size.width }, (_, column) => (centerX + (column + 0.5 - size.width / 2) * metersPerPixel - grid.x0) / grid.dx - 0.5)
    this.rows = Float64Array.from({ length: size.height }, (_, row) => (centerY - (row + 0.5 - size.height / 2) * metersPerPixel - grid.y0) / grid.dy - 0.5)
    this.native = new NativeRaster(size, grid, this.columns, this.rows, this.colors)
  }

  async composeFast(base: Uint8Array, frame: RainFrame, night: boolean): Promise<Buffer> {
    this.validatePresentation(night)
    if (JSON.stringify(frame.grid) !== JSON.stringify(this.grid)) throw new Error('Regenrooster wisselt binnen de reeks')
    return this.native.compose(base, frame)
  }

  async prepare(): Promise<void> { await this.native.prepare() }

  async close(): Promise<void> { await this.native.close() }

  compose(base: Uint8Array, frame: RainFrame, night: boolean): Buffer {
    const rgb = Buffer.from(base)
    this.validatePresentation(night)
    const leftWeight = (1 - frame.mix) ** FLOW_BLEND_CURVE, rightWeight = frame.mix ** FLOW_BLEND_CURVE
    const mix = rightWeight / Math.max(0.0001, leftWeight + rightWeight)
    for (let row = 0; row < this.size.height; row++) {
      const cellY = this.rows[row]!
      if (cellY < 0 || cellY > this.grid.height - 1) continue
      for (let column = 0; column < this.size.width; column++) {
        const cellX = this.columns[column]!
        if (cellX < 0 || cellX > this.grid.width - 1) continue
        let value: number
        if (mix === 0) value = this.sample(frame.left, cellX, cellY)
        else if (mix === 1) value = this.sample(frame.right, cellX, cellY)
        else if (!frame.motion) value = this.sample(frame.left, cellX, cellY) * (1 - mix) + this.sample(frame.right, cellX, cellY) * mix
        else {
          const displacement = this.displacement(frame, cellX, cellY)
          const left = this.sample(frame.left, cellX - displacement[0]! * mix, cellY - displacement[1]! * mix)
          const right = this.sample(frame.right, cellX + displacement[0]! * (1 - mix), cellY + displacement[1]! * (1 - mix))
          value = left * (1 - mix) + right * mix
        }
        if (value <= 0) continue
        const colorOffset = Math.min(65535, Math.round(value * 256)) * 4
        const coverage = this.colors[colorOffset + 3]!
        const offset = (row * this.size.width + column) * 3
        // SRC_ALPHA on the app's transparent canvas premultiplies RGB and squares alpha.
        rgb[offset] = Math.min(255, Math.round(this.colors[colorOffset]! + rgb[offset]! * coverage))
        rgb[offset + 1] = Math.min(255, Math.round(this.colors[colorOffset + 1]! + rgb[offset + 1]! * coverage))
        rgb[offset + 2] = Math.min(255, Math.round(this.colors[colorOffset + 2]! + rgb[offset + 2]! * coverage))
      }
    }
    return rgb
  }

  private validatePresentation(night: boolean): void {
    const presentation = rainPresentation({ temperatureFocus: 0, windFocus: 0, airFocus: 0, night })
    if (presentation.opacity !== 1 || presentation.saturation !== 1 || presentation.brightness !== 1 || presentation.multiply) throw new Error('Regencompositor verwacht volledige Weer-modus')
  }

  private displacement(frame: RainFrame, column: number, row: number): Float64Array {
    const motion = frame.motion!
    const motionX = Math.max(0, Math.min(motion.width - 1, (column + 0.5) / this.grid.width * motion.width - 0.5))
    const motionY = Math.max(0, Math.min(motion.height - 1, (row + 0.5) / this.grid.height * motion.height - 0.5))
    const west = Math.floor(motionX), north = Math.floor(motionY)
    const east = Math.min(motion.width - 1, west + 1), south = Math.min(motion.height - 1, north + 1)
    const horizontal = motionX - west, vertical = motionY - north
    this.motionIndexes[0] = north * motion.width + west
    this.motionIndexes[1] = north * motion.width + east
    this.motionIndexes[2] = south * motion.width + west
    this.motionIndexes[3] = south * motion.width + east
    this.motionWeights[0] = (1 - horizontal) * (1 - vertical)
    this.motionWeights[1] = horizontal * (1 - vertical)
    this.motionWeights[2] = (1 - horizontal) * vertical
    this.motionWeights[3] = horizontal * vertical
    let velocityX = 0, velocityY = 0, validity = 0
    for (let corner = 0; corner < 4; corner++) {
      const index = this.motionIndexes[corner]! * 2
      const eastward = motion.vectors[index]!, southward = motion.vectors[index + 1]!
      if (eastward === -128 || southward === -128) continue
      const weight = this.motionWeights[corner]!
      velocityX += eastward * weight
      velocityY += southward * weight
      validity += weight
    }
    const displacementX = velocityX * 0.1 * frame.intervalMinutes, displacementY = velocityY * 0.1 * frame.intervalMinutes
    const strength = validity >= 0.999 ? motionWarpStrength(Math.sqrt(displacementX * displacementX + displacementY * displacementY)) : 0
    this.motionSample[0] = displacementX * strength
    this.motionSample[1] = displacementY * strength
    return this.motionSample
  }

  private sample(frame: Uint8Array, column: number, row: number): number {
    if (column < 0 || row < 0 || column > this.grid.width - 1 || row > this.grid.height - 1) return 0
    const west = Math.floor(column), north = Math.floor(row)
    const east = Math.min(this.grid.width - 1, west + 1), south = Math.min(this.grid.height - 1, north + 1)
    const northWest = frame[north * this.grid.width + west]!, northEast = frame[north * this.grid.width + east]!
    const southWest = frame[south * this.grid.width + west]!, southEast = frame[south * this.grid.width + east]!
    if (northWest === 255 || northEast === 255 || southWest === 255 || southEast === 255) return 0
    const horizontal = column - west, vertical = row - north
    const northern = northWest + (northEast - northWest) * horizontal
    const southern = southWest + (southEast - southWest) * horizontal
    return northern + (southern - northern) * vertical
  }
}
