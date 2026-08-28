import type { Manifest, MrfHeader, TimelineFrame } from './contract'
import { buildTimeline } from './time-model'

export interface WindTimelineFrame {
  epoch: number
  u: TimelineFrame
  v: TimelineFrame
}

export function buildWindTimeline(manifest: Manifest): WindTimelineFrame[] {
  const u = buildTimeline(manifest, 'wind_u_ms')
  const v = buildTimeline(manifest, 'wind_v_ms')
  if (!u.length || u.length !== v.length) return []
  if (u.some((frame, index) => frame.epoch !== v[index]!.epoch)) return []
  return u.map((frame, index) => ({ epoch: frame.epoch, u: frame, v: v[index]! }))
}

export function zipWindFrame(u: Uint8Array, v: Uint8Array, uHeader: MrfHeader, vHeader: MrfHeader): Float32Array {
  if (u.length !== v.length || !sameGrid(uHeader, vHeader)) throw new Error('Windcomponenten hebben geen identiek grid')
  const vectors = new Float32Array(u.length * 2)
  for (let index = 0; index < u.length; index++) {
    const east = uHeader.quant[u[index]!] ?? Number.NaN
    const north = vHeader.quant[v[index]!] ?? Number.NaN
    vectors[index * 2] = east
    vectors[index * 2 + 1] = north
  }
  return vectors
}

export function sameGrid(left: MrfHeader, right: MrfHeader): boolean {
  return left.grid.crs === right.grid.crs && left.grid.x0 === right.grid.x0 && left.grid.y0 === right.grid.y0 &&
    left.grid.dx === right.grid.dx && left.grid.dy === right.grid.dy && left.grid.width === right.grid.width &&
    left.grid.height === right.grid.height
}
