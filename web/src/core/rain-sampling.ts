export type RainKernel = 'bilinear' | 'source-blur'

export interface RainSampling {
  kernel: RainKernel
  /** Breedte van één broncel in rastercellen; alleen de `source-`kernen gebruiken hem. */
  sourceCellWidth: number
  /** Alleen `source-blur`: sigma van de Gauss, in broncellen. */
  blurSigma?: number
}

/** Tot welke verplaatsing per framepaar de regen met het bewegingsveld meeschuift; daarboven wordt het een kruisfade. */
export interface RainWarpLimit {
  capCells: number
  fadeEndCells: number
}

// Het venster van de Gauss reikt tot minstens 2,6 sigma; daar is hij op 3 % van zijn top.
export const BLUR_RADIUS_SIGMA = 2.6
export function blurTaps(sigma: number): number {
  return Math.ceil(BLUR_RADIUS_SIGMA * sigma) * 2 + 1
}
