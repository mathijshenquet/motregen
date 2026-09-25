// Maanfase voor de nachtcel van de UV-kolom (PO 2026-09-25 live, U34): gemiddelde synodische maand
// vanaf een bekende nieuwe maan; de afwijking van de echte fase is hooguit ~half dag, ruim genoeg voor
// een icoon en een percentage.
const SYNODIC_MONTH_DAYS = 29.530588853
// Nieuwe maan 2000-01-06 18:14 UTC (Meeus, hfst. 49).
const REFERENCE_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14)
const DAY_MS = 86_400_000

export interface MoonPhase {
  /** 0 = nieuwe maan, 0,5 = volle maan, oplopend naar 1. */
  phase: number
  /** Verlicht deel van de schijf, 0–1. */
  illumination: number
  waxing: boolean
  label: string
}

export function moonPhase(epoch: number): MoonPhase {
  const cycles = (epoch - REFERENCE_NEW_MOON) / DAY_MS / SYNODIC_MONTH_DAYS
  const phase = cycles - Math.floor(cycles)
  const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2
  const waxing = phase < 0.5
  const label = illumination < 0.03 ? 'nieuwe maan' : illumination > 0.97 ? 'volle maan' : `${waxing ? 'wassende' : 'afnemende'} maan`
  return { phase, illumination, waxing, label }
}

/**
 * SVG-pad van het verlichte deel op een schijf (cx, cy, r), zoals vanaf het noordelijk halfrond:
 * wassend rechts verlicht, afnemend links. De terminator is een halve ellips met straal r·|cos|.
 */
export function moonLitPath(phase: number, cx: number, cy: number, r: number): string {
  const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2
  if (illumination < 0.005) return ''
  const waxing = phase < 0.5
  const terminator = r * Math.abs(Math.cos(2 * Math.PI * phase))
  const outerSweep = waxing ? 1 : 0
  // Minder dan half verlicht: de terminator buigt naar de verlichte kant; meer dan half: ervan af.
  const innerSweep = (illumination < 0.5) === waxing ? 0 : 1
  const top = `${cx} ${cy - r}`
  const bottom = `${cx} ${cy + r}`
  return `M${top}A${r} ${r} 0 0 ${outerSweep} ${bottom}A${terminator.toFixed(3)} ${r} 0 0 ${innerSweep} ${top}Z`
}
