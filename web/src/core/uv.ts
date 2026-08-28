export interface UvAdvice {
  value: number
  strength: 'matig' | 'sterk' | 'zeer sterk' | 'extreem'
}

export function uvAdvice(value: number | null | undefined): UvAdvice | null {
  if (value == null || !Number.isFinite(value) || value < 3) return null
  return {
    value: Math.round(value * 10) / 10,
    strength: value >= 11 ? 'extreem' : value >= 8 ? 'zeer sterk' : value >= 6 ? 'sterk' : 'matig',
  }
}
