import { drawStroke } from './native-strokes.js'
import { NativeRainData, type RainFrame } from './native-rain.js'
import { nativeProjection } from './native-projection.js'
import { FRAME, FRAME_PIXELS } from './config.js'
import { WIND_PARAMETERS, WIND_FOCUS_INTENSITY, WIND_INITIAL_STAGGER_SECONDS, WIND_SIMULATION_FPS, windLifeScale, halfFloatTrailFloor, bufferDecay, windColor, windScreenSpeed, weakWindTempo, speedDamping, particleCountForViewport, headAlpha, expectedLifetime } from '../web/src/core/wind-presentation.js'
import type { StillManifest } from './stills.js'
import type { NativeTheme, WaterMask } from './native-map.js'

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
  readonly eastwardData: NativeRainData
  readonly northwardData: NativeRainData
  constructor(origin: string, manifest: StillManifest) {
    this.eastwardData = new NativeRainData(origin, manifest, 'wind_u_ms')
    this.northwardData = new NativeRainData(origin, manifest, 'wind_v_ms')
    if (this.eastwardData.timeline.length !== this.northwardData.timeline.length || this.eastwardData.timeline.some((entry, index) => entry.epoch !== this.northwardData.timeline[index]!.epoch)) throw new Error('Windcomponenten hebben verschillende tijdlijnen')
  }
  async prepare(epochs: readonly number[]): Promise<void> { await Promise.all([this.eastwardData.prefetch(epochs), this.northwardData.prefetch(epochs)]) }
  clear(): void { this.eastwardData.clear(); this.northwardData.clear() }
  async draw(base: Buffer, epoch: number, simulationMs: number, theme: NativeTheme, water: WaterMask, coverage?: Uint8Array): Promise<Buffer> {
    const [eastwardData, northwardData] = await Promise.all([this.eastwardData.frame(epoch), this.northwardData.frame(epoch)])
    if (JSON.stringify(eastwardData.grid) !== JSON.stringify(northwardData.grid)) throw new Error('Windcomponenten hebben verschillende roosters')
    const projection = nativeProjection(eastwardData.grid)
    const count = particleCountForViewport(FRAME.width, FRAME.height)
    const columns = Math.ceil(Math.sqrt(count * FRAME.width / FRAME.height)), rows = Math.ceil(count / columns)
    let randomState = 0x71b
    const random = () => { randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0; return randomState / 4294967296 }
    const rgb = base
    for (let particle = 0; particle < count; particle++) {
      const screenX = ((particle % columns) + 0.5 + (random() - 0.5) * WIND_PARAMETERS.spawnJitter) / columns * FRAME_PIXELS.width
      const screenY = (Math.floor(particle / columns) + 0.5 + (random() - 0.5) * WIND_PARAMETERS.spawnJitter) / rows * FRAME_PIXELS.height
      const column = projection.columns[0]! + (projection.columns[1]! - projection.columns[0]!) * (screenX - 0.5)
      const row = projection.rows[0]! + (projection.rows[1]! - projection.rows[0]!) * (screenY - 0.5)
      const east = sampleWind(eastwardData, column, row), north = sampleWind(northwardData, column, row)
      if (east === undefined || north === undefined) continue
      const speed = Math.hypot(east, north)
      if (speed < 0.01) continue
      const screenSpeed = windScreenSpeed(speed) * weakWindTempo(speed)
      const lifeScale = windLifeScale(random())
      const delay = random() * WIND_INITIAL_STAGGER_SECONDS
      const age = simulationMs / 1000 - delay
      if (age <= 0) continue
      const duration = expectedLifetime(screenSpeed, { trailDistance: WIND_PARAMETERS.trailDistance * lifeScale, maxAge: WIND_PARAMETERS.maxAge * lifeScale })
      const phase = (age % duration) / duration
      const lifeDistance = Math.min(WIND_PARAMETERS.trailDistance * lifeScale, screenSpeed * WIND_PARAMETERS.maxAge * lifeScale)
      const distance = (phase - 0.5) * lifeDistance * FRAME.scale
      const decayLength = screenSpeed / -Math.log(WIND_PARAMETERS.bufferFade) * FRAME.scale
      const travelled = phase * lifeDistance
      const length = Math.min(travelled, 3 * decayLength / FRAME.scale) * FRAME.scale
      const directionX = east / speed, directionY = -north / speed
      const headX = screenX + directionX * distance, headY = screenY + directionY * distance
      const color = windColor(speed, theme).map((channel) => Math.round(channel * 255))
      const life = { age: phase * duration, travelled, distance: lifeDistance, remaining: lifeDistance - travelled }
      const waterColumn = Math.max(0, Math.min(water.width - 1, Math.floor(headX / FRAME_PIXELS.width * water.width)))
      const waterRow = Math.max(0, Math.min(water.height - 1, Math.floor(headY / FRAME_PIXELS.height * water.height)))
      const waterFactor = 1 - WIND_PARAMETERS.seaPenalty * water.values[waterRow * water.width + waterColumn]! / 255
      const opacity = waterFactor * WIND_FOCUS_INTENSITY * WIND_PARAMETERS.headIntensity * speedDamping(speed, WIND_PARAMETERS.speedDamping)
      const floor = WIND_FOCUS_INTENSITY * halfFloatTrailFloor(1 / WIND_SIMULATION_FPS) / (1 - bufferDecay(WIND_PARAMETERS.bufferFade, 1 / WIND_SIMULATION_FPS))
      const trailOpacity = (distance: number, sinceRespawn = 0) => (behind: number, coverage: number) => {
        const pastTravelled = distance - behind / FRAME.scale
        const strength = headAlpha({ ...life, age: pastTravelled / screenSpeed, travelled: pastTravelled, remaining: lifeDistance - pastTravelled }, WIND_PARAMETERS)
        const decay = bufferDecay(WIND_PARAMETERS.bufferFade, sinceRespawn + behind / FRAME.scale / screenSpeed)
        return Math.max(0, opacity * coverage * strength * decay - floor * (1 - decay))
      }
      const tailX = headX - directionX * length, tailY = headY - directionY * length
      drawStroke(rgb, FRAME_PIXELS, [tailX, tailY], [headX, headY], WIND_PARAMETERS.lineWidth * FRAME.scale, color, trailOpacity(travelled), coverage)
      if (age >= duration) {
        const sinceRespawn = age % duration
        const previousLength = Math.min(lifeDistance, 3 * decayLength / FRAME.scale) * FRAME.scale
        const previousHeadX = screenX + directionX * lifeDistance * FRAME.scale / 2
        const previousHeadY = screenY + directionY * lifeDistance * FRAME.scale / 2
        if (opacity * bufferDecay(WIND_PARAMETERS.bufferFade, sinceRespawn) >= 1 / 255) drawStroke(rgb, FRAME_PIXELS, [previousHeadX - directionX * previousLength, previousHeadY - directionY * previousLength], [previousHeadX, previousHeadY], WIND_PARAMETERS.lineWidth * FRAME.scale, color, trailOpacity(lifeDistance, sinceRespawn), coverage)
      }
    }
    return rgb
  }
}
