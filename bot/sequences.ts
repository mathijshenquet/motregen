import { STILL_HOURS, stillEpoch, type LoopMode, type StillHour, type StillManifest } from './stills.js'

export interface SequencePlan {
  epochs: number[]
  loopFrames: number
  fps: number
  stillFrames: Array<{ hour: StillHour; index: number }>
}

export function sequencePlan(mode: LoopMode, manifest: StillManifest): SequencePlan {
  const now = Date.parse(manifest.now)
  const fps = 10
  const stepMinutes = 5
  // Regen −1…+2 u (PO 2026-10-09); temperatuur en wind −2…+12 u.
  const startMinutes = mode === 'weather' ? -60 : -120
  const endMinutes = mode === 'weather' ? 120 : 720
  const epochs: number[] = []
  for (let minute = startMinutes; minute <= endMinutes; minute += stepMinutes) epochs.push(now + minute * 60_000)
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
