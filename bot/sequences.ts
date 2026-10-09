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
  // Regen op het tempo van de app (5 minuten kaarttijd per 650 ms, PLAYBACK_FRAME_DURATION_MS): 45 s kaarttijd per
  // frame bij 10 fps ≈ 7,5 min/s (PO 2026-10-09). De native compositor warpt tussen de 5-minutenframes; de
  // Playwright-fallback rendert dan 241 frames. Temperatuur en wind blijven 5 min per frame.
  const stepMinutes = mode === 'weather' ? 0.75 : 5
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
