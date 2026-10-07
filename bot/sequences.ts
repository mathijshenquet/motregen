import { STILL_HOURS, type LoopMode, type StillHour, type StillManifest } from './stills.js'

export interface SequencePlan {
  epochs: number[]
  loopFrames: number
  fps: number
  stillFrames: Array<{ hour: StillHour; index: number }>
}

export function sequencePlan(mode: LoopMode, manifest: StillManifest): SequencePlan {
  const now = Date.parse(manifest.now)
  // Temperatuur in stappen van tien minuten op 10 fps (PO 2026-10-08: per uur op 4 fps oogde schokkerig).
  // Die frames bestonden al voor de stills; de app interpoleert tussen de uurvelden. Wind beweegt op de
  // simulatieklok en houdt zijn kwartierstap.
  const fps = mode === 'wind' ? 4 : 10
  const stepMinutes = mode === 'weather' ? 5 : mode === 'wind' ? 15 : 10
  const startMinutes = mode === 'weather' ? -120 : 0
  const endMinutes = mode === 'weather' ? 120 : 720
  const epochs: number[] = []
  for (let minute = startMinutes; minute <= endMinutes; minute += stepMinutes) epochs.push(now + minute * 60_000)
  const loopFrames = epochs.length
  if (mode !== 'wind') {
    for (const hour of STILL_HOURS) {
      const epoch = now + hour * 3_600_000
      if (!epochs.includes(epoch)) epochs.push(epoch)
    }
  }
  const stillFrames = mode === 'wind' ? [] : STILL_HOURS.map((hour) => ({ hour, index: epochs.indexOf(now + hour * 3_600_000) }))
  return { epochs, loopFrames, fps, stillFrames }
}
