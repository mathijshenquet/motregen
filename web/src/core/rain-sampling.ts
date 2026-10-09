export type RainKernel = 'nearest' | 'bilinear' | 'source-linear' | 'source-cubic' | 'source-blur'

export interface RainSampling {
  kernel: RainKernel
  /** Breedte van één broncel in rastercellen; alleen de `source-`kernen gebruiken hem. */
  sourceCellWidth: number
  /** Alleen `source-blur`: sigma van de Gauss, in broncellen. */
  blurSigma?: number
}

/** Eén pass van het voorfilter, gemeten tot de GPU klaar is (alleen als iemand luistert). */
export interface RainFilterPass {
  kernel: RainKernel
  taps: number
  sourceCellWidth: number
  axis: 'x' | 'y'
  milliseconds: number
}

/** Tot welke verplaatsing per framepaar de regen met het bewegingsveld meeschuift; daarboven wordt het een kruisfade. */
export interface RainWarpLimit {
  capCells: number
  fadeEndCells: number
}

export function kernelTaps(kernel: Exclude<RainKernel, 'nearest' | 'bilinear'>, sigma: number): number {
  if (kernel === 'source-linear') return 2
  if (kernel === 'source-cubic') return 4
  return Math.ceil(2.6 * sigma) * 2 + 1
}
