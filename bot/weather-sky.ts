import { CLOUD_LAYERS, layerTransmission, lightDarkness, skyAt, skyStars, skyStops, skyStrokes, sunCrossings, type CloudLayer, type SkyStop } from '../web/src/core/cloud-section.js'
import type { SearchPlace } from '../web/src/core/place-search.js'
import { solarElevationSin } from '../web/src/core/solar.js'
import { seriesValueAt } from '../web/src/core/time-model.js'
import { WEATHER_HOUR, type WeatherSeries } from './weather-series.js'

// Expressief: dezelfde kleuren en OKLab-mengingen als de hemel, wolken en dag/nacht-koppen in styles.css.
const palettes = {
  light: {
    text: '#102630', muted: '#3a525c', accent: '#0b607e', panel: '#ffffff',
    bright: '#4fb0f7', dull: '#5c7084', night: '#1b2a3b', nightDull: '#10161b',
    cloudBright: '#ffffff', cloudStorm: '#262f35', cloudNight: '#4a5964', cloudShadow: '#1c262d',
    zenith: '#1563d6', haze: '#fff1cf', amber: '#ffb85c', rose: '#ef4269', purple: '#7b3989',
    rulerDayVeil: '#ffffff', rulerDayStrength: .5, rulerDayInk: '#17313b',
  },
  dark: {
    text: '#edf8fc', muted: '#91aab5', accent: '#48c4e9', panel: '#0a1820',
    bright: '#2489e0', dull: '#36485a', night: '#0c1a27', nightDull: '#05080a',
    cloudBright: '#f1f6f8', cloudStorm: '#141a1e', cloudNight: '#2b3a44', cloudShadow: '#04080b',
    zenith: '#0a2f7a', haze: '#ffe3a8', amber: '#ffab52', rose: '#e24069', purple: '#6e2b80',
    rulerDayVeil: '#06121a', rulerDayStrength: .45, rulerDayInk: '#edf8fc',
  },
}
type Palette = typeof palettes.light
type Channels = [number, number, number]

export function weatherSky(place: SearchPlace, series: WeatherSeries) {
  const sinElevation = (epoch: number) => solarElevationSin(epoch, place.lng, place.lat)
  const coverAt = (epoch: number) => Object.fromEntries(CLOUD_LAYERS.map((layer) => [layer,
    (seriesValueAt(series.clouds.timeline[layer], series.clouds.values[layer], epoch, 30 * 60_000) ?? 0) / 100,
  ])) as Record<CloudLayer, number>
  const theme = sinElevation(series.now) <= 0 ? 'dark' : 'light'
  const palette = { ...palettes[theme] }
  if (theme === 'light') {
    const overcast = lightDarkness(layerTransmission(coverAt(series.now)))
    palette.panel = mixOklab('#ffffff', mixOklab('#64c6f2', '#8ba4a8', overcast * .74), .44)
  }
  return { theme, palette, sinElevation, stops: skyStops(series.start, series.end, { sinElevation, coverAt, lightAt: () => null }) }
}

export function rulerInk(palette: Palette, stop: SkyStop): string {
  return stop.daylight < .5 ? '#e3f1f6' : palette.rulerDayInk
}

function skyColor(palette: Palette, stop: SkyStop): string {
  const day = mixOklab(palette.bright, palette.dull, stop.darkness)
  const night = mixOklab(palette.night, palette.nightDull, stop.darkness)
  return mixOklab(night, day, stop.daylight)
}

function cloudColor(palette: Palette, stop: SkyStop, layer: CloudLayer): string {
  const weight = { high: .35, mid: .85, low: 1 }[layer]
  const lit = mixOklab(palette.cloudBright, palette.cloudStorm, stop.darkness * weight)
  return mixOklab(lit, palette.cloudNight, (1 - stop.daylight) * .55)
}

export function weatherSkySvg(sky: ReturnType<typeof weatherSky>, series: WeatherSeries, width: number, top: number, height: number, cloudStart: number): string {
  const { palette, stops, sinElevation } = sky
  const pxPerHour = width / ((series.end - series.start) / WEATHER_HOUR)
  const gradient = (id: string, color: (stop: SkyStop) => string, start = 0) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${start}" x2="${width + start}" y1="0" y2="0">${stops.map((stop) => `<stop offset="${stop.offset}" stop-color="${color(stop)}"/>`).join('')}</linearGradient>`
  const elements = ['<defs>', gradient('sky', (stop) => skyColor(palette, stop))]
  for (const layer of CLOUD_LAYERS) elements.push(gradient(`cloud-${layer}`, (stop) => cloudColor(palette, stop, layer), -cloudStart))
  elements.push(`<linearGradient id="sky-depth" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${palette.zenith}" stop-opacity=".3"/><stop offset=".55" stop-color="${palette.zenith}" stop-opacity="0"/></linearGradient>`)
  elements.push(`<linearGradient id="sky-haze" gradientUnits="userSpaceOnUse" x1="0" x2="${width}" y1="0" y2="0">${stops.map((stop) => `<stop offset="${stop.offset}" stop-color="${palette.haze}" stop-opacity="${.5 * stop.daylight * (1 - stop.darkness)}"/>`).join('')}</linearGradient>`)
  elements.push(`<linearGradient id="sky-veil" gradientUnits="userSpaceOnUse" x1="0" x2="${width}" y1="0" y2="0">${stops.map((stop) => `<stop offset="${stop.offset}" stop-color="${stop.daylight < .5 ? '#06121a' : palette.rulerDayVeil}" stop-opacity="${stop.daylight < .5 ? .4 : palette.rulerDayStrength}"/>`).join('')}</linearGradient>`)
  elements.push(`<linearGradient id="cloud-shadow" x1="0" x2="0" y1="0" y2="1"><stop offset=".25" stop-color="${palette.cloudShadow}" stop-opacity="0"/><stop offset="1" stop-color="${palette.cloudShadow}" stop-opacity=".42"/></linearGradient><filter id="soft-clouds" x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation=".9"/></filter>`)
  for (const [tint, strength] of [['amber', .95], ['rose', .6], ['purple', .5]] as const) {
    elements.push(`<radialGradient id="dusk-${tint}"><stop offset="0" stop-color="${palette[tint]}" stop-opacity="${strength}"/><stop offset="1" stop-color="${palette[tint]}" stop-opacity="0"/></radialGradient>`)
  }
  elements.push(`<clipPath id="sky-plot"><rect y="${top - 26}" width="${width}" height="${height + 26}"/></clipPath></defs><g clip-path="url(#sky-plot)">`)
  elements.push(`<rect y="${top - 26}" width="${width}" height="${height + 26}" fill="url(#sky)"/><rect y="${top}" width="${width}" height="${height}" fill="url(#sky-depth)"/>`)
  for (let index = 0; index < 16; index++) {
    const share = .45 + .55 * index / 16
    elements.push(`<rect y="${top + height * share}" width="${width}" height="${height * (1 - share)}" fill="url(#sky-haze)" opacity=".075"/>`)
  }
  for (const crossing of sunCrossings(series.start, series.end, sinElevation)) {
    const position = (crossing.epoch - series.start) / (series.end - series.start) * width
    const side = crossing.rising ? 1 : -1
    const radius = Math.min(height * .62, pxPerHour)
    const strength = 1 - .75 * skyAt(stops, position / width).darkness
    elements.push(`<g opacity="${strength}"><circle cx="${position - side * radius * .55}" cy="${top + height}" r="${radius * 1.5}" fill="url(#dusk-purple)"/><circle cx="${position + side * radius * .35}" cy="${top + height}" r="${radius * 1.25}" fill="url(#dusk-rose)"/><circle cx="${position}" cy="${top + height}" r="${radius}" fill="url(#dusk-amber)"/></g>`)
  }
  elements.push(`<rect y="${top - 26}" width="${width}" height="26" fill="${palette.zenith}" opacity=".3"/><rect y="${top - 26}" width="${width}" height="26" fill="url(#sky-veil)"/>`)
  elements.push(`<g transform="translate(0 ${top})">`)
  for (const stroke of skyStrokes(width, height, pxPerHour, stops)) elements.push(`<path d="${stroke.path}" fill="${stroke.light ? '#fff' : '#04121c'}" fill-opacity="${stroke.strength * (stroke.light ? .05 : .07)}"/>`)
  for (const star of skyStars(width, height, pxPerHour, stops)) elements.push(`<circle cx="${star.x}" cy="${star.y}" r="${star.radius}" fill="#fff8e0" opacity="${star.brightness}"/>`)
  elements.push('</g></g>')
  return elements.join('')
}

function toOklab(hex: string): Channels {
  const [red, green, blue] = hex.slice(1).match(/../g)!.map((pair) => {
    const channel = parseInt(pair, 16) / 255
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
  }) as Channels
  const long = Math.cbrt(.4122214708 * red + .5363325363 * green + .0514459929 * blue)
  const medium = Math.cbrt(.2119034982 * red + .6806995451 * green + .1073969566 * blue)
  const short = Math.cbrt(.0883024619 * red + .2817188376 * green + .6299787005 * blue)
  return [.2104542553 * long + .793617785 * medium - .0040720468 * short,
    1.9779984951 * long - 2.428592205 * medium + .4505937099 * short,
    .0259040371 * long + .7827717662 * medium - .808675766 * short]
}

function mixOklab(from: string, to: string, share: number): string {
  const left = toOklab(from)
  const right = toOklab(to)
  const [lightness, greenRed, blueYellow] = left.map((channel, index) => channel + (right[index]! - channel) * share) as Channels
  const long = (lightness + .3963377774 * greenRed + .2158037573 * blueYellow) ** 3
  const medium = (lightness - .1055613458 * greenRed - .0638541728 * blueYellow) ** 3
  const short = (lightness - .0894841775 * greenRed - 1.291485548 * blueYellow) ** 3
  const channels = [4.0767416621 * long - 3.3077115913 * medium + .2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - .3413193965 * short,
    -.0041960863 * long - .7034186147 * medium + 1.707614701 * short]
  return `#${channels.map((linear) => {
    const channel = linear <= .0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - .055
    return Math.round(Math.max(0, Math.min(1, channel)) * 255).toString(16).padStart(2, '0')
  }).join('')}`
}
