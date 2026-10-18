export type Source = 'rtcor' | 'nowcast' | 'seamless' | 'harmonie' | 'uv' | 'ecmwf'
export type Field = 'rain_rate' | 'radiation' | 'temp_c' | 'feels_like_c' | 'wind_u_ms' | 'wind_v_ms' | 'uv' | 'uv_clear' | 'rel_humidity' | 'cloud_frac' | 'pressure_hpa' | 'gust_ms' | 'cloud_low' | 'cloud_mid' | 'cloud_high' | EcmwfDayField | EcmwfStepField
export type EcmwfStepField = 'step_tmax_c' | 'step_tmin_c' | 'step_precip_mm' | 'step_gust_ms' | 'step_temp_c' | 'step_wind_u_ms' | 'step_wind_v_ms' | 'step_cloud'
export type EcmwfDayField = 'day_tmax_c' | 'day_tmin_c' | 'day_precip_mm' | 'day_precip_prob' | 'day_precip_prob5' | 'day_wind_ms' | 'day_wind_dir' | 'day_gust_ms' | 'day_cloud'

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
  ecmwf?: EcmwfSection
}

/**
 * Dagverwachting (MIP-36): frame i van elke `day_*`-chunk hoort bij `days[i]`, frame i van elke `step_*`-chunk
 * bij `steps[i]` (U90b; de frametijd is het einde van de stap).
 */
export interface EcmwfSection {
  run: string
  license: string
  days: EcmwfDay[]
  steps?: EcmwfStep[]
}

/** UTC-interval van één modelstap: begin inclusief, einde exclusief. */
export interface EcmwfStep {
  start: string
  end: string
}

/** Lokale kalenderdag (Europe/Amsterdam) als ISO-datum, met UTC-grenzen: begin inclusief, einde exclusief. */
export interface EcmwfDay {
  date: string
  start: string
  end: string
}

export interface FrameIndex {
  time: string
  offset: number
  len: number
  /** Inhoudshash van de gecomprimeerde member (docs/mrf.md §Member hashes); ontbreekt in oudere chunks. */
  hash?: string
  motion?: PayloadIndex
}

export interface PayloadIndex {
  offset: number
  len: number
  hash?: string
}

export interface MotionGrid {
  bw: number
  bh: number
}

/** Bewegingsvectoren van één frame, int8 per blok (x, y) in 0,1 cel per minuut; −128 = geen vector. */
export interface MotionField {
  width: number
  height: number
  vectors: Uint8Array
}

export interface MrfHeader {
  version: 0
  field?: Field
  grid: Grid
  quant: Array<number | null>
  source: Source
  run: string
  frames: FrameIndex[]
  motion_grid?: MotionGrid
  /** Frames zijn verliesvrij predictief gecodeerd (docs/mrf.md §Predictive frames). */
  pred?: { v: number }
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
