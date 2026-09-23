import type { TimelineFrame } from './contract'

export type HourlyRowKind = 'past' | 'now' | 'future'

export interface HourlyForecastRow {
  epoch: number
  kind: HourlyRowKind
  rainIndex: number | null
  uvIndex: number | null
  radiationIndex: number | null
  radiationNextIndex: number | null
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
  radiation: TimelineFrame[]
  temperature: TimelineFrame[]
  feelsLike: TimelineFrame[]
  humidity: TimelineFrame[]
  cloud: TimelineFrame[]
  windU: TimelineFrame[]
  windV: TimelineFrame[]
}

const hour = 3_600_000

export const FORECAST_HISTORY_HOURS = 6
// Rows further ahead only load once the table is scrolled near them, so the
// passive cost stays that of the former fixed 24-hour table (MIP-8).
export const PASSIVE_FORECAST_HOURS = 24

/**
 * One row per whole hour from `historyHours` before the current hour up to
 * the last hour any field reaches; leading history and trailing rows without
 * any data are dropped, the current hour always stays.
 */
export function buildHourlyForecast(
  timelines: HourlyTimelines,
  now: number,
  historyHours = FORECAST_HISTORY_HOURS,
): HourlyForecastRow[] {
  const currentHour = Math.floor(now / hour) * hour
  const lastEpoch = Math.max(currentHour, ...Object.values(timelines).map((frames) => frames.at(-1)?.epoch ?? 0))
  const lastHour = Math.floor((lastEpoch + hour / 2) / hour) * hour
  const rows: HourlyForecastRow[] = []
  for (let epoch = currentHour - historyHours * hour; epoch <= lastHour; epoch += hour) {
    rows.push({
      epoch,
      kind: epoch < currentHour ? 'past' : epoch === currentHour ? 'now' : 'future',
      rainIndex: nearestFrame(timelines.rain, epoch),
      uvIndex: nearestFrame(timelines.uv, epoch),
      radiationIndex: nearestFrame(timelines.radiation, epoch),
      radiationNextIndex: nearestFrame(timelines.radiation, epoch + hour),
      temperatureIndex: nearestFrame(timelines.temperature, epoch),
      feelsLikeIndex: nearestFrame(timelines.feelsLike, epoch),
      humidityIndex: nearestFrame(timelines.humidity, epoch),
      cloudIndex: nearestFrame(timelines.cloud, epoch),
      windUIndex: nearestFrame(timelines.windU, epoch),
      windVIndex: nearestFrame(timelines.windV, epoch),
    })
  }
  const first = rows.findIndex((row) => row.kind === 'now' || hasData(row))
  let last = rows.length - 1
  while (last > 0 && rows[last]!.kind === 'future' && !hasData(rows[last]!)) last--
  return rows.slice(first, last + 1)
}

export function isPassiveRow(row: HourlyForecastRow, now: number): boolean {
  return row.epoch <= now + PASSIVE_FORECAST_HOURS * hour
}

function hasData(row: HourlyForecastRow): boolean {
  return row.rainIndex != null || row.uvIndex != null || row.temperatureIndex != null || row.feelsLikeIndex != null ||
    row.humidityIndex != null || row.cloudIndex != null || row.windUIndex != null || row.windVIndex != null
}

function nearestFrame(frames: TimelineFrame[], epoch: number, tolerance = hour / 2): number | null {
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
