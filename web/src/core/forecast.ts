import { lightDarkness } from './cloud-section'
import type { TimelineFrame } from './contract'
import { cloudModification } from './uv'

export type HourlyRowKind = 'past' | 'now' | 'future'

export interface HourlyForecastRow {
  epoch: number
  kind: HourlyRowKind
  rainIndex: number | null
  uvIndex: number | null
  uvClearIndex: number | null
  radiationIndex: number | null
  radiationNextIndex: number | null
  temperatureIndex: number | null
  feelsLikeIndex: number | null
  cloudIndex: number | null
  windUIndex: number | null
  windVIndex: number | null
  gustIndex: number | null
}

export interface HourlyTimelines {
  rain: TimelineFrame[]
  uv: TimelineFrame[]
  uvClear: TimelineFrame[]
  radiation: TimelineFrame[]
  temperature: TimelineFrame[]
  feelsLike: TimelineFrame[]
  cloud: TimelineFrame[]
  windU: TimelineFrame[]
  windV: TimelineFrame[]
  gust: TimelineFrame[]
}

const hour = 3_600_000

export const FORECAST_HISTORY_HOURS = 6
// Rows further ahead only load once the table is scrolled near them. The former
// table asked for 24 h but its run-start-anchored data reached only now + 17…20 h,
// so 18 h keeps the passive cost of that table (MIP-8) and usually stays inside
// the first day-sized hourly chunk.
export const PASSIVE_FORECAST_HOURS = 18

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
      uvClearIndex: nearestFrame(timelines.uvClear, epoch),
      radiationIndex: nearestFrame(timelines.radiation, epoch),
      radiationNextIndex: nearestFrame(timelines.radiation, epoch + hour),
      temperatureIndex: nearestFrame(timelines.temperature, epoch),
      feelsLikeIndex: nearestFrame(timelines.feelsLike, epoch),
      cloudIndex: nearestFrame(timelines.cloud, epoch),
      windUIndex: nearestFrame(timelines.windU, epoch),
      windVIndex: nearestFrame(timelines.windV, epoch),
      gustIndex: nearestFrame(timelines.gust, epoch),
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
    row.cloudIndex != null || row.windUIndex != null || row.windVIndex != null
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

/**
 * Uurrijen waarvan de hemel in de scrubber de straling nodig heeft: elke uurstop leest het uurgemiddelde
 * dat op dat uur eindigt en het volgende (`radiationIndex`, `radiationNextIndex`). Het venster is wat de
 * scrubber toont, dus dezelfde uurstop krijgt bij elke cursor dezelfde invoer (U62: hing aan de
 * tabelrijen bij de cursor, waardoor de hemel per cursor tussen straling en wolkenlaagschatting
 * wisselde). Eén uur buiten het venster hoort erbij: het verloop aan de rand loopt naar die stop toe.
 * Het verleden schat de hemel altijd uit de lagen.
 */
export function skyRadiationRows<Row extends Pick<HourlyForecastRow, 'epoch' | 'kind'>>(rows: Row[], window: { start: number; end: number }): Row[] {
  return rows.filter((row) => row.kind !== 'past' && row.epoch >= window.start - hour && row.epoch <= window.end + hour)
}

/** Hemel van één uur voor de dag/nacht-kleuring van rijen, tabelkop en klokpil. */
export interface HourSky {
  daylight: boolean
  /** 0 = stralend, 1 = zwaar bewolkt; alleen overdag van betekenis. */
  overcast: number
}

/**
 * Donkerte (0–1) van een daguur: de bewolkingsfactor uit de straling op een perceptuele schaal (U47);
 * zonder straling laat 100 % bewolking 25 % licht door.
 */
export function hourDarkness(
  row: Pick<HourlyForecastRow, 'epoch' | 'radiationIndex' | 'radiationNextIndex' | 'cloudIndex'>,
  radiation: Array<number | null>,
  cloud: Array<number | null>,
  sinElevation: (epoch: number) => number,
): number {
  const valueAt = (series: Array<number | null>, index: number | null) => index == null ? null : series[index] ?? null
  const cover = valueAt(cloud, row.cloudIndex)
  const fallbackLight = cover == null ? 1 : 1 - 0.75 * Math.max(0, Math.min(1, cover / 100))
  return lightDarkness(cloudModification(row.epoch, valueAt(radiation, row.radiationIndex), valueAt(radiation, row.radiationNextIndex), sinElevation) ?? fallbackLight)
}
