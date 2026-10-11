import { STILL_HOURS, stillEpoch, type LoopMode, type StillHour, type StillManifest } from './stills.js'

export interface SequencePlan {
  epochs: number[]
  loopFrames: number
  fps: number
  stillFrames: Array<{ hour: StillHour; index: number }>
}

export function sequencePlan(mode: LoopMode, manifest: StillManifest): SequencePlan {
  const now = Date.parse(manifest.now)
  // Regen op het tempo van de app (5 minuten kaarttijd per 650 ms, PLAYBACK_FRAME_DURATION_MS ≈ 7,5 min/s): 100 s
  // kaarttijd per frame bij 4,5 fps (PO 2026-10-11). Drie frames per radarbeeld van 5 minuten: elk derde frame is een
  // echte meting en elke still op een tiental minuten valt op een loopframe. Het was 45 s bij 10 fps; ruim de helft
  // minder frames voor hetzelfde tempo. Temperatuur en wind blijven 5 min per frame bij 10 fps.
  const fps = mode === 'weather' ? 4.5 : 10
  const stepSeconds = mode === 'weather' ? 100 : 300
  // Regen −1…+2 u (PO 2026-10-09); temperatuur en wind −2…+12 u.
  const startMinutes = mode === 'weather' ? -60 : -120
  const endMinutes = mode === 'weather' ? 120 : 720
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
