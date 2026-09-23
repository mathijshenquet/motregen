export interface UvAdvice {
  value: number
  strength: 'matig' | 'sterk' | 'zeer sterk' | 'extreem'
}

export function formatUv(value: number | null | undefined): string {
  return value == null ? '—' : value.toLocaleString('nl-NL', { maximumFractionDigits: 1 })
}

export function uvChipLabel(value: number | null | undefined): string | null {
  const advice = uvAdvice(value)
  return advice ? `Insmeren · UV ${formatUv(advice.value)} ${advice.strength}` : null
}

export function uvAdvice(value: number | null | undefined): UvAdvice | null {
  if (value == null || !Number.isFinite(value) || value < 3) return null
  return {
    value: Math.round(value * 10) / 10,
    strength: value >= 11 ? 'extreem' : value >= 8 ? 'zeer sterk' : value >= 6 ? 'sterk' : 'matig',
  }
}

// Fitted on live KNMI UV analyses against HARMONIE hour-mean radiation; the
// calibration run and its errors are documented in docs/fields.md (UV-schatting).
export const UV_ESTIMATE_EXPONENT = 0.35
export const UV_ESTIMATE_SCALE = 0.84

/** Madronich's clear-sky UV index for a sun at sin(elevation) `mu`, ozone ≈ 300 DU. */
export function clearSkyUv(mu: number): number {
  return mu > 0 ? 12.5 * Math.pow(mu, 2.42) : 0
}

/** Haurwitz clear-sky global horizontal irradiance in W/m². */
export function clearSkyRadiation(mu: number): number {
  return mu > 0.01 ? 1_098 * mu * Math.exp(-0.057 / mu) : 0
}

/**
 * UV index at `epoch` from the HARMONIE hour means that end at `epoch`
 * (`radiationBefore`) and one hour later (`radiationAfter`): the clear-sky UV
 * scaled by how much of the clear-sky irradiance reached the ground.
 */
export function estimateUv(
  epoch: number,
  radiationBefore: number | null | undefined,
  radiationAfter: number | null | undefined,
  sinElevation: (epoch: number) => number,
): number | null {
  const clearUv = clearSkyUv(sinElevation(epoch))
  const ratios: number[] = []
  for (const [radiation, end] of [[radiationBefore, epoch], [radiationAfter, epoch + 3_600_000]] as const) {
    if (radiation == null || !Number.isFinite(radiation)) continue
    let clear = 0
    for (let step = 0; step < 6; step++) clear += clearSkyRadiation(sinElevation(end - (step + 0.5) * 600_000)) / 6
    if (clear > 20) ratios.push(Math.max(0, Math.min(1.2, radiation / clear)))
  }
  if (!ratios.length) return radiationBefore == null && radiationAfter == null ? null : UV_ESTIMATE_SCALE * clearUv
  const cloudModification = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length
  return UV_ESTIMATE_SCALE * clearUv * Math.pow(cloudModification, UV_ESTIMATE_EXPONENT)
}
