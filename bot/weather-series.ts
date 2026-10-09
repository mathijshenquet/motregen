import type { CloudLayer, CloudSeries } from '../web/src/core/cloud-section.js'
import { CLOUD_LAYERS } from '../web/src/core/cloud-section.js'
import type { TimelineFrame } from '../web/src/core/contract.js'
import { classifyRain } from '../web/src/core/rain-chart.js'
import { seriesValueAt } from '../web/src/core/time-model.js'
import { NativeRainData } from './native-rain.js'
import type { StillManifest } from './stills.js'

export const WEATHER_HOUR = 3_600_000
export interface PointSeries { timeline: TimelineFrame[]; values: Array<number | null> }
export interface WeatherSeries { now: number; start: number; end: number; rain: PointSeries; clouds: CloudSeries }

export class WeatherData {
  private readonly rain: NativeRainData
  private readonly clouds: Record<CloudLayer, NativeRainData>
  readonly now: number

  constructor(origin: string, manifest: StillManifest) {
    this.now = Date.parse(manifest.now)
    this.rain = new NativeRainData(origin, manifest)
    this.clouds = Object.fromEntries(CLOUD_LAYERS.map((layer) => [layer, new NativeRainData(origin, manifest, `cloud_${layer}`)])) as Record<CloudLayer, NativeRainData>
  }

  async series(point: { lng: number; lat: number }): Promise<WeatherSeries> {
    const start = this.now - 2 * WEATHER_HOUR
    const end = this.now + 12 * WEATHER_HOUR
    const [rain, ...clouds] = await Promise.all([
      this.rain.pointSeries(point, start, end),
      ...CLOUD_LAYERS.map((layer) => this.clouds[layer].pointSeries(point, start, end)),
    ])
    if (!rain.values.some((value) => value != null) || clouds.some((series) => !series.values.some((value) => value != null))) throw new Error('Punt valt buiten de beschikbare data')
    return {
      now: this.now, start, end, rain,
      clouds: {
        timeline: Object.fromEntries(CLOUD_LAYERS.map((layer, index) => [layer, clouds[index]!.timeline])) as CloudSeries['timeline'],
        values: Object.fromEntries(CLOUD_LAYERS.map((layer, index) => [layer, clouds[index]!.values])) as CloudSeries['values'],
      },
    }
  }
}

const timeFormat = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })
export function weatherTime(epoch: number): string { return timeFormat.format(epoch) }

export function rainSummary(series: WeatherSeries): string {
  const step = 5 * 60_000
  const horizon = series.now + 2 * WEATHER_HOUR
  let wetStart: number | undefined
  let wetEnd: number | undefined
  let peak = 0
  for (let epoch = series.now; epoch <= horizon; epoch += step) {
    const rate = seriesValueAt(series.rain.timeline, series.rain.values, epoch, 0)
    if (rate == null) return 'De regenverwachting voor de komende 2 uur is onvolledig'
    if (rate >= 0.05) {
      wetStart ??= epoch
      peak = Math.max(peak, rate)
    } else if (wetStart !== undefined) {
      wetEnd = epoch
      break
    }
  }
  if (wetStart === undefined) return 'Komende 2 uur droog'
  const intensity = { light: 'lichte', moderate: 'matige', heavy: 'zware' }[classifyRain(peak)]
  const until = wetEnd === undefined ? `tot minstens ${weatherTime(horizon)}` : `tot ${weatherTime(wetEnd)}`
  return wetStart === series.now ? `${intensity[0]!.toUpperCase()}${intensity.slice(1)} regen ${until}`
    : `Droog tot ${weatherTime(wetStart)}, dan ${intensity} regen ${until}`
}
