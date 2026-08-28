import type { TimelineFrame } from './contract'

export interface HourlyForecastRow {
  epoch: number
  rainIndex: number | null
  radiationIndex: number | null
}

const hour = 3_600_000

export function buildHourlyForecast(
  rain: TimelineFrame[],
  radiation: TimelineFrame[],
  now: number,
  count = 24,
): HourlyForecastRow[] {
  const firstHour = Math.floor(now / hour) * hour + hour
  return Array.from({ length: count }, (_, index) => {
    const epoch = firstHour + index * hour
    return {
      epoch,
      rainIndex: nearestFrame(rain, epoch, hour / 2),
      radiationIndex: nearestFrame(radiation, epoch, hour / 2),
    }
  })
}

function nearestFrame(frames: TimelineFrame[], epoch: number, tolerance: number): number | null {
  let nearest: number | null = null
  let distance = Number.POSITIVE_INFINITY
  for (let index = 0; index < frames.length; index++) {
    const candidateDistance = Math.abs(frames[index]!.epoch - epoch)
    if (candidateDistance < distance) {
      nearest = index
      distance = candidateDistance
    }
  }
  return distance <= tolerance ? nearest : null
}
