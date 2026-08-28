export type Source = 'rtcor' | 'nowcast' | 'harmonie'
export type Field = 'rain_rate' | 'radiation' | 'temp_c' | 'feels_like_c' | 'wind_u_ms' | 'wind_v_ms' | 'uv'

export interface Grid {
  crs: 'EPSG:3857'
  x0: number
  y0: number
  dx: number
  dy: number
  width: number
  height: number
}

export interface ManifestChunk {
  url: string
  source: Source
  field?: Field
  run: string
  header_len: number
  times: string[]
}

export interface Manifest {
  version: 0
  generated: string
  now: string
  chunks: ManifestChunk[]
}

export interface FrameIndex {
  time: string
  offset: number
  len: number
}

export interface MrfHeader {
  version: 0
  field?: Field
  grid: Grid
  quant: Array<number | null>
  source: Source
  run: string
  frames: FrameIndex[]
  dict: null
}

export interface TimelineFrame {
  time: string
  epoch: number
  source: Source
  run: string
  chunk: ManifestChunk
  frameIndex: number
}

export function chunkField(chunk: Pick<ManifestChunk, 'field'>): Field {
  return chunk.field ?? 'rain_rate'
}
