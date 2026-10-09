import { CLOUD_LAYERS, cloudBand, skyAt, type CloudLayer } from '../web/src/core/cloud-section.js'
import type { SearchPlace } from '../web/src/core/place-search.js'
import { rainChartMaximum, rainChartPosition, rainColor } from '../web/src/core/rain-chart.js'
import { seriesValueAt } from '../web/src/core/time-model.js'
import { FRAME } from './config.js'
import { WEATHER_HOUR, weatherTime, type WeatherSeries } from './weather-series.js'
import { rulerInk, weatherSky, weatherSkySvg } from './weather-sky.js'

export const WEATHER_IMAGE = { width: FRAME.width, height: 400, scale: 2 } as const

export function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

export function weatherSvg(place: SearchPlace, series: WeatherSeries): string {
  const sky = weatherSky(place, series)
  const { theme, palette } = sky
  const width = WEATHER_IMAGE.width
  const left = 18
  const plotWidth = width - left * 2
  const cloudTop = 98
  const cloudHeight = 96
  const rainTop = cloudTop + cloudHeight + 12
  const rainHeight = 116
  const bottom = rainTop + rainHeight
  const xAt = (epoch: number) => (epoch - series.start) / (series.end - series.start) * plotWidth
  const maximum = rainChartMaximum(series.rain.values)
  const nowX = xAt(series.now)
  const elements: string[] = []
  elements.push(`<rect width="${width}" height="400" fill="${palette.panel}"/>`)
  elements.push(`<text x="18" y="35" font-size="25" font-weight="600">${escapeHtml(place.name)}</text>`)
  const date = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Amsterdam' }).format(series.now)
  elements.push(`<text x="18" y="59" fill="${palette.muted}" font-size="13">${date} · ${weatherTime(series.now)}</text>`)
  elements.push(`<g transform="translate(${left} 0)">`)
  elements.push(`<defs><clipPath id="plot"><rect y="${cloudTop}" width="${plotWidth}" height="${bottom - cloudTop}"/></clipPath><clipPath id="clouds"><rect x="${nowX}" y="${cloudTop}" width="${plotWidth - nowX}" height="${cloudHeight}"/></clipPath><filter id="day-rain"><feColorMatrix type="saturate" values="1.35"/><feComponentTransfer><feFuncR type="linear" slope=".86"/><feFuncG type="linear" slope=".86"/><feFuncB type="linear" slope=".86"/></feComponentTransfer></filter></defs>`)
  elements.push(weatherSkySvg(sky, series, plotWidth, cloudTop, bottom - cloudTop, nowX))
  for (let epoch = Math.ceil(series.start / WEATHER_HOUR) * WEATHER_HOUR; epoch <= series.end; epoch += WEATHER_HOUR) {
    const position = xAt(epoch)
    elements.push(`<line x1="${position}" x2="${position}" y1="${cloudTop}" y2="${bottom}" stroke="#fff" stroke-opacity=".14"/>`)
    if (Math.abs(position - nowX) > 22 && position > 12 && position < plotWidth - 12) {
      elements.push(`<text x="${position}" y="88" fill="${rulerInk(palette, skyAt(sky.stops, position / plotWidth))}" font-size="12" font-weight="600" text-anchor="middle">${weatherTime(epoch).slice(0, 2)}u</text>`)
    }
  }
  elements.push('<g clip-path="url(#plot)">')
  // Het buitenste clip blijft ná blur gelden: ook een zachte wolkenrand mag niet vóór nu verschijnen.
  elements.push(`<g clip-path="url(#clouds)"><g transform="translate(${nowX} 0)"><g id="weather-clouds" filter="url(#soft-clouds)">`)
  for (const [index, layer] of CLOUD_LAYERS.entries()) {
    const geometry = { width: plotWidth - nowX, top: cloudTop + index * cloudHeight / 3, height: cloudHeight / 3, start: series.now, end: series.end }
    const band = cloudBand(series.clouds.timeline[layer], series.clouds.values[layer], layer, geometry)
    for (const path of band.paths) {
      elements.push(`<path d="${path}" fill="url(#cloud-${layer})" fill-opacity="${layer === 'high' ? '.8' : '.94'}"/>`)
      if (layer !== 'high') elements.push(`<path d="${path}" fill="url(#cloud-shadow)"/>`)
    }
  }
  elements.push('</g></g></g>')
  elements.push(`<g${theme === 'light' ? ' filter="url(#day-rain)"' : ''}>`)
  const frames = series.rain.timeline
  const pitch = frames.length > 1 ? xAt(frames[1]!.epoch) - xAt(frames[0]!.epoch) : plotWidth
  const gap = pitch > 6 ? 1.5 : pitch > 3.5 ? 1 : .5
  for (const [index, frame] of frames.entries()) {
    const value = series.rain.values[index]
    const previous = frames[index - 1]
    const next = frames[index + 1]
    const leftEpoch = previous ? (previous.epoch + frame.epoch) / 2 : frame.epoch - (next ? (next.epoch - frame.epoch) / 2 : WEATHER_HOUR / 2)
    const rightEpoch = next ? (frame.epoch + next.epoch) / 2 : frame.epoch + (previous ? (frame.epoch - previous.epoch) / 2 : WEATHER_HOUR / 2)
    const start = xAt(leftEpoch)
    const end = xAt(rightEpoch)
    const barWidth = Math.max(1.2, end - start - gap)
    const position = (start + end - barWidth) / 2
    if (value == null) {
      elements.push(`<rect x="${position}" y="${bottom - 2}" width="${barWidth}" height="2" fill="${palette.muted}"/>`)
      continue
    }
    if (value <= 0) continue
    const height = Math.max(2, rainHeight * rainChartPosition(value, maximum))
    elements.push(`<rect x="${position}" y="${bottom - height}" width="${barWidth}" height="${height + 3}" rx="${Math.min(3, barWidth / 2)}" fill="${rainColor(value)}" opacity="${frame.epoch < series.now ? '.72' : '1'}" stroke="#fff" stroke-opacity=".6" stroke-width="1"/>`)
  }
  elements.push('</g></g>')
  elements.push(`<line x1="0" x2="${plotWidth}" y1="${rainTop - 6}" y2="${rainTop - 6}" stroke="#fff" stroke-opacity=".14"/>`)
  elements.push(`<line x1="${nowX}" x2="${nowX}" y1="${cloudTop - 4}" y2="${bottom + 3}" stroke="${palette.accent}" stroke-width="2"/>`)
  elements.push(`<rect x="${nowX - 12}" y="75" width="24" height="17" rx="4" fill="${palette.panel}"/><text x="${nowX}" y="88" font-size="12" font-weight="600" text-anchor="middle" fill="${palette.accent}">nu</text>`)
  const current = seriesValueAt(series.rain.timeline, series.rain.values, series.now, 0)
  const rate = current == null ? 'geen data' : current < .05 ? 'droog' : `${current.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} mm/u`
  const rateNight = sky.stops.at(-1)!.daylight < .5
  elements.push(`<rect x="${plotWidth - 110}" y="${rainTop + 1}" width="110" height="18" rx="4" fill="${rateNight ? '#06121a' : '#fff'}" opacity=".75"/><text x="${plotWidth - 4}" y="${rainTop + 14}" fill="${rateNight ? '#e3f1f6' : '#17313b'}" font-size="12" text-anchor="end">nu ${rate}</text>`)
  for (const [index, frame] of frames.entries()) {
    if (index > 0 && frames[index - 1]!.source === frame.source) continue
    const following = frames.slice(index + 1).find((candidate) => candidate.source !== frame.source)
    const startEpoch = index === 0 ? series.start : (frames[index - 1]!.epoch + frame.epoch) / 2
    const previous = following ? frames[frames.indexOf(following) - 1]! : undefined
    const endEpoch = following ? (previous!.epoch + following.epoch) / 2 : series.end
    const start = Math.max(0, xAt(startEpoch))
    const end = Math.min(plotWidth, xAt(endEpoch))
    if (end <= start) continue
    const label = { rtcor: 'radar', nowcast: 'nowcast', seamless: 'naadloos', harmonie: 'HARMONIE', uv: 'UV' }[frame.source]
    elements.push(`<line x1="${start + 1}" x2="${end - 1}" y1="${bottom + 8}" y2="${bottom + 8}" stroke="${palette.accent}" stroke-opacity="${frame.source === 'rtcor' ? '.4' : '.8'}" stroke-width="2"/>`)
    if (end - start > 40) elements.push(`<text x="${(start + end) / 2}" y="${bottom + 26}" font-size="11" text-anchor="middle" fill="${palette.muted}">${label}</text>`)
  }
  elements.push('</g>')
  const labels: Record<CloudLayer, string> = { high: 'hoog', mid: 'midden', low: 'laag' }
  elements.push(`<text x="18" y="383" font-size="11" fill="${palette.muted}">Wolken: ${CLOUD_LAYERS.map((layer) => labels[layer]).join(' · ')} · Bron: KNMI</text>`)
  elements.push(`<text x="${width - 18}" y="383" font-size="12" fill="${palette.accent}" text-anchor="end">motregen.nl</text>`)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="400" viewBox="0 0 ${width} 400"><g font-family="Inter, Noto Sans, sans-serif" fill="${palette.text}">${elements.join('')}</g></svg>`
}
