export type Source = 'rtcor' | 'nowcast' | 'harmonie'

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
