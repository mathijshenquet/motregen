import { STILL_HOURS, stillEpoch, type LoopMode, type StillHour, type StillManifest } from './stills.js'

// PLAYBACK_TEMPO_HOURS = 8 / timelinePlaybackRate in web/src/App.tsx: gemeten 9,35 kaartminuten/s
// op 2026-10-11. PO: alle films 100 s/frame × 5,6 fps = 9,33 min/s; regen −1…+2 u, overige −1…+5 u.
export const LOOP_TIMING = {
  stepSeconds: 100,
  fps: 5.6,
  startMinutes: -60,
  endMinutes: { weather: 120, wind: 300, feels: 300 } satisfies Record<LoopMode, number>,
}

export interface SequencePlan {
  epochs: number[]
  loopFrames: number
  fps: number
  stillFrames: Array<{ hour: StillHour; index: number }>
}

export function sequencePlan(mode: LoopMode, manifest: StillManifest): SequencePlan {
  const now = Date.parse(manifest.now)
  const { fps, stepSeconds, startMinutes } = LOOP_TIMING
  const endMinutes = LOOP_TIMING.endMinutes[mode]
  const epochs: number[] = []
  for (let second = startMinutes * 60; second <= endMinutes * 60; second += stepSeconds) epochs.push(now + second * 1000)
  const loopFrames = epochs.length
  // Stills voorbij de loophorizon blijven in dezelfde renderpass, buiten de MP4.
  if (mode !== 'wind') {
    for (const hour of STILL_HOURS) {
      const epoch = stillEpoch(manifest, hour)
      if (!epochs.includes(epoch)) epochs.push(epoch)
    }
  }
  const stillFrames = mode === 'wind' ? [] : STILL_HOURS.map((hour) => ({ hour, index: epochs.indexOf(stillEpoch(manifest, hour)) }))
  return { epochs, loopFrames, fps, stillFrames }
}

/** Aantal herhalingen van het laatste beeld: ongeveer één seconde, ook bij een gebroken beeldsnelheid. */
export function holdFrames(plan: Pick<SequencePlan, 'fps'>): number {
  return Math.round(plan.fps)
}

export function fpsFraction(fps: number): { numerator: number; denominator: number } {
  const denominator = 10 ** (String(fps).split('.')[1]?.length ?? 0)
  const numerator = Math.round(fps * denominator)
  const gcd = (left: number, right: number): number => right === 0 ? left : gcd(right, left % right)
  const divisor = gcd(numerator, denominator)
  return { numerator: numerator / divisor, denominator: denominator / divisor }
}
