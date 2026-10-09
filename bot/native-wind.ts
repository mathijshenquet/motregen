import sharp from 'sharp'
import { NativeRainData, type RainFrame } from './native-rain.js'
import { nativeProjection } from './native-projection.js'
import { FRAME, FRAME_PIXELS } from './config.js'
import { WIND_PARAMETERS, WIND_FOCUS_INTENSITY, windColor, windScreenSpeed, weakWindTempo, speedDamping, particleCountForViewport } from '../web/src/core/wind-presentation.js'
import type { StillManifest } from './stills.js'
import type { NativeTheme } from './native-map.js'

export function sampleWind(frame: RainFrame, column: number, row: number): number | undefined {
  if (column < 0 || row < 0 || column > frame.grid.width - 1 || row > frame.grid.height - 1) return undefined
  const west = Math.floor(column), north = Math.floor(row)
  const east = Math.min(frame.grid.width - 1, west + 1), south = Math.min(frame.grid.height - 1, north + 1)
  const horizontal = column - west, vertical = row - north
  const indexes = [north * frame.grid.width + west, north * frame.grid.width + east, south * frame.grid.width + west, south * frame.grid.width + east]
  const weights = [(1 - horizontal) * (1 - vertical), horizontal * (1 - vertical), (1 - horizontal) * vertical, horizontal * vertical]
  let value = 0
  for (let corner = 0; corner < 4; corner++) {
    if (!weights[corner]) continue
    const left = frame.leftHeader.quant[frame.left[indexes[corner]!]!]
    const right = frame.rightHeader.quant[frame.right[indexes[corner]!]!]
    if ((frame.mix < 1 && left == null) || (frame.mix > 0 && right == null)) return undefined
    value += ((left ?? 0) * (1 - frame.mix) + (right ?? 0) * frame.mix) * weights[corner]!
  }
  return value
}

export class NativeWindData {
  readonly u: NativeRainData
  readonly v: NativeRainData
  constructor(origin: string, manifest: StillManifest) {
    this.u = new NativeRainData(origin, manifest, 'wind_u_ms')
    this.v = new NativeRainData(origin, manifest, 'wind_v_ms')
    if (this.u.timeline.length !== this.v.timeline.length || this.u.timeline.some((entry, index) => entry.epoch !== this.v.timeline[index]!.epoch)) throw new Error('Windcomponenten hebben verschillende tijdlijnen')
  }
  async prepare(epochs: readonly number[]): Promise<void> { await Promise.all([this.u.prefetch(epochs), this.v.prefetch(epochs)]) }
  async draw(base: Buffer, epoch: number, simulationMs: number, theme: NativeTheme): Promise<Buffer> {
    const [u, v] = await Promise.all([this.u.frame(epoch), this.v.frame(epoch)])
    if (JSON.stringify(u.grid) !== JSON.stringify(v.grid)) throw new Error('Windcomponenten hebben verschillende roosters')
    const projection = nativeProjection(u.grid)
    const count = particleCountForViewport(FRAME.width, FRAME.height)
    const columns = Math.ceil(Math.sqrt(count * FRAME.width / FRAME.height)), rows = Math.ceil(count / columns)
    let randomState = 0x71b
    const random = () => { randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0; return randomState / 4294967296 }
    const paths: string[] = []
    for (let particle = 0; particle < count; particle++) {
      const x = ((particle % columns) + 0.5 + (random() - 0.5) * WIND_PARAMETERS.spawnJitter) / columns * FRAME_PIXELS.width
      const y = (Math.floor(particle / columns) + 0.5 + (random() - 0.5) * WIND_PARAMETERS.spawnJitter) / rows * FRAME_PIXELS.height
      const column = projection.columns[0]! + (projection.columns[1]! - projection.columns[0]!) * (x - 0.5)
      const row = projection.rows[0]! + (projection.rows[1]! - projection.rows[0]!) * (y - 0.5)
      const east = sampleWind(u, column, row), north = sampleWind(v, column, row)
      if (east === undefined || north === undefined) continue
      const speed = Math.hypot(east, north)
      if (speed < 0.01) continue
      const screenSpeed = windScreenSpeed(speed) * weakWindTempo(speed)
      const phase = (random() + simulationMs / 1000 / WIND_PARAMETERS.maxAge) % 1
      const lifeDistance = Math.min(WIND_PARAMETERS.trailDistance, screenSpeed * WIND_PARAMETERS.maxAge)
      const distance = (phase - 0.5) * lifeDistance * FRAME.scale
      const length = Math.min(lifeDistance * 0.5, screenSpeed / -Math.log(WIND_PARAMETERS.bufferFade)) * FRAME.scale
      const directionX = east / speed, directionY = -north / speed
      const headX = x + directionX * distance, headY = y + directionY * distance
      const color = windColor(speed, theme).map((channel) => Math.round(channel * 255))
      const opacity = WIND_FOCUS_INTENSITY * WIND_PARAMETERS.headIntensity * speedDamping(speed, WIND_PARAMETERS.speedDamping)
      const tailX = headX - directionX * length, tailY = headY - directionY * length
      const id = `wind-${particle}`
      paths.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${tailX}" y1="${tailY}" x2="${headX}" y2="${headY}"><stop stop-color="rgb(${color.join(',')})" stop-opacity="0"/><stop offset="1" stop-color="rgb(${color.join(',')})" stop-opacity="${opacity}"/></linearGradient><path d="M${tailX},${tailY}L${headX},${headY}" stroke="url(#${id})" stroke-width="${WIND_PARAMETERS.lineWidth * FRAME.scale}"/>`)
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME_PIXELS.width}" height="${FRAME_PIXELS.height}">${paths.join('')}</svg>`
    return sharp(base, { raw: { ...FRAME_PIXELS, channels: 3 } }).composite([{ input: Buffer.from(svg) }]).removeAlpha().raw().toBuffer()
  }
}
