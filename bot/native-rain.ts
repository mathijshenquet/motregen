import type { Field, Grid, Manifest, MrfHeader, TimelineFrame } from '../web/src/core/contract.js'
import { decodeFrame, parseMrfHeader } from '../web/src/core/mrf-codec.js'
import { buildTimeline, frameBlend } from '../web/src/core/time-model.js'
import { rainColormap } from '../web/src/core/rain-chart.js'
import { rainPresentation } from '../web/src/core/rain-presentation.js'
import { solarElevationSin } from '../web/src/core/solar.js'
import { selectPairMotion } from '../web/src/core/motion-selection.js'
import { motionWarpStrength } from '../web/src/core/rain-motion.js'
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
        const vectors = decodeFrame(chunk.bytes.subarray(start, start + index.len), size.bw * size.bh * 2)
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
      raster = decodeFrame(chunk.bytes.subarray(start, start + index.len), width * height, chunk.header.pred ? { width, height } : undefined)
      chunk.frames.set(frame.frameIndex, raster)
    }
    return { grid: chunk.header.grid, raster, header: chunk.header }
  }
}

export function rainTheme(epoch: number): NativeTheme {
  return solarElevationSin(epoch, 5.12, 52.09) <= 0 ? 'dark' : 'light'
}

export class RainCompositor {
  private readonly columns: Float64Array
  private readonly rows: Float64Array
  private readonly colors = rainColormap()
  constructor(private readonly grid: Grid, private readonly size = FRAME_PIXELS, view = NATIVE_VIEW) {
    const worldMeters = 2 * Math.PI * 6378137
    const metersPerPixel = worldMeters / (512 * 2 ** view.zoom * (size.width / FRAME_PIXELS.width * 1.5))
    const centerX = view.lng * Math.PI / 180 * 6378137
    const centerY = Math.log(Math.tan(Math.PI / 4 + view.lat * Math.PI / 360)) * 6378137
    this.columns = Float64Array.from({ length: size.width }, (_, column) => (centerX + (column + 0.5 - size.width / 2) * metersPerPixel - grid.x0) / grid.dx - 0.5)
    this.rows = Float64Array.from({ length: size.height }, (_, row) => (centerY - (row + 0.5 - size.height / 2) * metersPerPixel - grid.y0) / grid.dy - 0.5)
  }

  compose(base: Uint8Array, frame: RainFrame, night: boolean): Buffer {
    const rgb = Buffer.from(base)
    const presentation = rainPresentation({ temperatureFocus: 0, windFocus: 0, airFocus: 0, night })
    for (let row = 0; row < this.size.height; row++) {
      const cellY = this.rows[row]!
      if (cellY < 0 || cellY > this.grid.height - 1) continue
      for (let column = 0; column < this.size.width; column++) {
        const cellX = this.columns[column]!
        if (cellX < 0 || cellX > this.grid.width - 1) continue
        const displacement = frame.motion ? this.displacement(frame, cellX, cellY) : [0, 0]
        const left = this.sample(frame.left, cellX - displacement[0]! * frame.mix, cellY - displacement[1]! * frame.mix)
        const right = this.sample(frame.right, cellX + displacement[0]! * (1 - frame.mix), cellY + displacement[1]! * (1 - frame.mix))
        const value = left * (1 - frame.mix) + right * frame.mix
        // WebGL LUT coordinates address texel centres at (index + 0.5)/256.
        const lutPosition = Math.max(0, Math.min(255, value * 256 / 255 - 0.5))
        const lower = Math.floor(lutPosition), upper = Math.min(255, lower + 1)
        const weight = lutPosition - lower
        const alpha = (this.colors[lower * 4 + 3]! * (1 - weight) + this.colors[upper * 4 + 3]! * weight) / 255 * presentation.opacity
        if (alpha === 0) continue
        const offset = (row * this.size.width + column) * 3
        for (let channel = 0; channel < 3; channel++) {
          const color = this.colors[lower * 4 + channel]! * (1 - weight) + this.colors[upper * 4 + channel]! * weight
          // The app's transparent WebGL canvas uses SRC_ALPHA for both RGB and alpha.
          rgb[offset + channel] = Math.min(255, Math.round(color * alpha + rgb[offset + channel]! * (1 - alpha * alpha)))
        }
      }
    }
    return rgb
  }

  private displacement(frame: RainFrame, column: number, row: number): number[] {
    const motion = frame.motion!
    const motionX = Math.max(0, Math.min(motion.width - 1, (column + 0.5) / this.grid.width * motion.width - 0.5))
    const motionY = Math.max(0, Math.min(motion.height - 1, (row + 0.5) / this.grid.height * motion.height - 0.5))
    const west = Math.floor(motionX), north = Math.floor(motionY)
    const east = Math.min(motion.width - 1, west + 1), south = Math.min(motion.height - 1, north + 1)
    const indexes = [north * motion.width + west, north * motion.width + east, south * motion.width + west, south * motion.width + east]
    if (indexes.some((index) => motion.vectors[index * 2] === -128 || motion.vectors[index * 2 + 1] === -128)) return [0, 0]
    const horizontal = motionX - west, vertical = motionY - north
    const velocity = [0, 1].map((channel) => {
      const values = indexes.map((index) => motion.vectors[index * 2 + channel]!)
      return ((values[0]! * (1 - horizontal) + values[1]! * horizontal) * (1 - vertical) + (values[2]! * (1 - horizontal) + values[3]! * horizontal) * vertical) * 0.1 * frame.intervalMinutes
    })
    const strength = motionWarpStrength(Math.hypot(velocity[0]!, velocity[1]!))
    return velocity.map((value) => value * strength)
  }

  private sample(frame: Uint8Array, column: number, row: number): number {
    if (column < 0 || row < 0 || column > this.grid.width - 1 || row > this.grid.height - 1) return 0
    const west = Math.floor(column), north = Math.floor(row)
    const east = Math.min(this.grid.width - 1, west + 1), south = Math.min(this.grid.height - 1, north + 1)
    const northWest = frame[north * this.grid.width + west]!, northEast = frame[north * this.grid.width + east]!
    const southWest = frame[south * this.grid.width + west]!, southEast = frame[south * this.grid.width + east]!
    if (northWest === 255 || northEast === 255 || southWest === 255 || southEast === 255) return 0
    const horizontal = column - west, vertical = row - north
    return (northWest * (1 - horizontal) + northEast * horizontal) * (1 - vertical) + (southWest * (1 - horizontal) + southEast * horizontal) * vertical
  }
}
