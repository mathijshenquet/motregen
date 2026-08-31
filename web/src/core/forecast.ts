import type { TimelineFrame } from './contract'

export interface HourlyForecastRow {
  epoch: number
  rainIndex: number | null
  uvIndex: number | null
  temperatureIndex: number | null
  feelsLikeIndex: number | null
  humidityIndex: number | null
  cloudIndex: number | null
  windUIndex: number | null
  windVIndex: number | null
}

export interface HourlyTimelines {
  rain: TimelineFrame[]
  uv: TimelineFrame[]
  temperature: TimelineFrame[]
  feelsLike: TimelineFrame[]
  humidity: TimelineFrame[]
  cloud: TimelineFrame[]
  windU: TimelineFrame[]
  windV: TimelineFrame[]
}

const hour = 3_600_000

export function buildHourlyForecast(
  timelines: HourlyTimelines,
  now: number,
  count = 24,
  historyCount = 4,
): HourlyForecastRow[] {
  const firstHour = Math.floor(now / hour) * hour - historyCount * hour
  return Array.from({ length: historyCount + count }, (_, index) => {
    const epoch = firstHour + index * hour
    return {
      epoch,
      rainIndex: nearestFrame(timelines.rain, epoch, hour / 2),
      uvIndex: nearestFrame(timelines.uv, epoch, hour / 2),
      temperatureIndex: nearestFrame(timelines.temperature, epoch, hour / 2),
      feelsLikeIndex: nearestFrame(timelines.feelsLike, epoch, hour / 2),
      humidityIndex: nearestFrame(timelines.humidity, epoch, hour / 2),
      cloudIndex: nearestFrame(timelines.cloud, epoch, hour / 2),
      windUIndex: nearestFrame(timelines.windU, epoch, hour / 2),
      windVIndex: nearestFrame(timelines.windV, epoch, hour / 2),
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
