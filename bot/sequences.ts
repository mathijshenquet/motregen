import { STILL_HOURS, type LoopMode, type StillHour, type StillManifest } from './stills.js'

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
  const startMinutes = -120
  const endMinutes = 720
  const epochs: number[] = []
  for (let minute = startMinutes; minute <= endMinutes; minute += stepMinutes) epochs.push(now + minute * 60_000)
  const loopFrames = epochs.length
  const stillFrames = mode === 'wind' ? [] : STILL_HOURS.map((hour) => ({ hour, index: epochs.indexOf(now + hour * 3_600_000) }))
  return { epochs, loopFrames, fps, stillFrames }
}
