import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import type { Field, Manifest } from '../web/src/core/contract.js'
import { decodeFrame, parseMrfHeader } from '../web/src/core/mrf-codec.js'
import { buildTimeline, frameBlend, seriesValueAt } from '../web/src/core/time-model.js'
import { WeatherData, WEATHER_HOUR, rainSummary } from './weather-series.js'
import { PlaceWeatherRenderer } from './weather.js'
import { weatherSvg } from './weather-chart.js'

const place = { name: 'Amsterdam', slug: 'amsterdam', lng: 4.9, lat: 52.37 }
let manifest: Manifest
let directory: string
beforeAll(async () => { manifest = JSON.parse(await readFile(resolve('../web/public/data/manifest.json'), 'utf8')) })
afterEach(async () => { vi.unstubAllGlobals(); if (directory) await rm(directory, { recursive: true, force: true }) })

function fixtureFetch(missing = false) {
  const request = vi.fn(async (input: URL | Request | string) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('manifest.json')) return Response.json(manifest)
    if (missing) return new Response('missing', { status: 404 })
    return new Response(await readFile(resolve('../web/public', `.${url.pathname}`)))
  })
  vi.stubGlobal('fetch', request)
  return request
}

it('matches app rain and all cloud fractions at one place/time using the web MRF fixtures', async () => {
  fixtureFetch()
  const now = Date.parse(manifest.now)
  const epoch = now + 45 * 60_000
  const bot = await new WeatherData('https://fixture.test', manifest).series(place)
  expect(bot.start).toBe(now - 2 * WEATHER_HOUR)
  expect(bot.end).toBe(now + 12 * WEATHER_HOUR)
  for (const field of ['rain_rate', 'cloud_high', 'cloud_mid', 'cloud_low'] satisfies Field[]) {
    const timeline = buildTimeline(manifest, field)
    const blend = frameBlend(timeline, epoch)
    const values: Array<number | null> = Array(timeline.length).fill(null)
    for (const index of [blend.left, blend.right]) {
      const frame = timeline[index]!
      const bytes = new Uint8Array(await readFile(resolve('../web/public/data', frame.chunk.url)))
      const header = parseMrfHeader(bytes.subarray(0, frame.chunk.header_len))
      const entry = header.frames[frame.frameIndex]!
      const raster = decodeFrame(bytes.subarray(frame.chunk.header_len + entry.offset, frame.chunk.header_len + entry.offset + entry.len), header.grid.width * header.grid.height)
      const projectedX = place.lng * Math.PI / 180 * 6378137
      const projectedY = Math.log(Math.tan(Math.PI / 4 + place.lat * Math.PI / 360)) * 6378137
      const column = Math.floor((projectedX - header.grid.x0) / header.grid.dx)
      const row = Math.floor((projectedY - header.grid.y0) / header.grid.dy)
      values[index] = header.quant[raster[row * header.grid.width + column]!] ?? null
    }
    const expected = seriesValueAt(timeline, values, epoch, 0)
    const layer = field === 'rain_rate' ? undefined : field.slice(6) as 'high' | 'mid' | 'low'
    const actual = layer ? seriesValueAt(bot.clouds.timeline[layer], bot.clouds.values[layer], epoch, 0) : seriesValueAt(bot.rain.timeline, bot.rain.values, epoch, 0)
    expect(expected).not.toBeNull()
    expect(actual).toBe(expected)
  }
})

it('shares rendering and chunks, persists the PNG cache and returns text when a chunk is missing', async () => {
  directory = await mkdtemp(join(tmpdir(), 'motregen-weather-'))
  const request = fixtureFetch()
  const renderer = new PlaceWeatherRenderer('https://fixture.test', directory)
  const [cold, duplicate] = await Promise.all([renderer.render(place, manifest), renderer.render(place, manifest)])
  expect(cold.media).toBeDefined()
  expect(cold.media!.path).toBe(duplicate.media!.path)
  expect(cold.caption).toContain('/weer/amsterdam')
  const metadata = await sharp(cold.media!.path).metadata()
  expect([metadata.width, metadata.height]).toEqual([1280, 800])
  const count = request.mock.calls.length
  const warm = await new PlaceWeatherRenderer('https://fixture.test', directory).render(place, manifest)
  expect(warm.cached).toBe(true)
  expect(request).toHaveBeenCalledTimes(count)
  fixtureFetch(true)
  const next = { ...manifest, generated: new Date(Date.parse(manifest.generated) + 300_000).toISOString() }
  const fallback = await renderer.render(place, next)
  expect(fallback.media).toBeUndefined()
  expect(fallback.caption).toContain('tijdelijk niet compleet')
  fixtureFetch()
  expect((await renderer.render(place, next)).media).toBeDefined()
})

it('summarizes dry weather, rain onset and incomplete coverage without claiming unknown hours are dry', async () => {
  fixtureFetch()
  const series = await new WeatherData('https://fixture.test', manifest).series(place)
  series.rain.values.fill(0)
  expect(rainSummary(series)).toBe('Komende 2 uur droog')
  const atNow = series.rain.timeline.findIndex((frame) => frame.epoch >= series.now)
  series.rain.values[atNow] = 10
  expect(rainSummary(series)).toMatch(/^Zware regen tot /)
  series.rain.values.fill(null)
  expect(rainSummary(series)).toContain('onvolledig')
})

it('renders the expressive day/night sky from chart time while the process clock stays fixed', async () => {
  fixtureFetch()
  const series = await new WeatherData('https://fixture.test', manifest).series(place)
  for (const layer of ['high', 'mid', 'low'] as const) series.clouds.values[layer].fill(0)
  const renderAt = async (now: number) => {
    const shifted = structuredClone(series)
    const offset = now - series.now
    shifted.now += offset
    shifted.start += offset
    shifted.end += offset
    for (const frame of shifted.rain.timeline) frame.epoch += offset
    for (const layer of ['high', 'mid', 'low'] as const) for (const frame of shifted.clouds.timeline[layer]) frame.epoch += offset
    return sharp(Buffer.from(weatherSvg(place, shifted))).removeAlpha().raw().toBuffer()
  }
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-09T00:00:00Z'))
  try {
    const day = await renderAt(Date.parse('2026-10-09T12:00:00Z'))
    const night = await renderAt(Date.parse('2026-10-09T00:00:00Z'))
    expect([...night.subarray(0, 3)]).toEqual([10, 24, 32])
    const [red, green, blue] = day.subarray(0, 3)
    expect(red).toBeGreaterThan(160)
    expect(green).toBeGreaterThan(red!)
    expect(blue).toBeGreaterThan(green!)
    expect(day.equals(night)).toBe(false)
  } finally {
    vi.restoreAllMocks()
  }
})

it('draws clouds only from now and clips blurred edges before the cursor', async () => {
  fixtureFetch()
  const series = await new WeatherData('https://fixture.test', manifest).series(place)
  series.rain.values.fill(0)
  for (const layer of ['high', 'mid', 'low'] as const) series.clouds.values[layer].fill(100)
  const svg = weatherSvg(place, series)
  const withoutClouds = svg.replace(/<g id="weather-clouds"[^>]*>.*?<\/g>/s, '')
  expect(withoutClouds).not.toBe(svg)
  const nowX = 18 + (series.now - series.start) / (series.end - series.start) * 604
  const pixels = (source: string, left: number, width: number) => sharp(Buffer.from(source), { density: 144 })
    .extract({ left, top: 196, width, height: 192 }).raw().toBuffer()
  // De laatste volledige pixel links van nu telt mee: blur mag geen wolkenrand laten lekken.
  const pastWidth = Math.floor(nowX * 2) - 36
  expect((await pixels(svg, 36, pastWidth)).equals(await pixels(withoutClouds, 36, pastWidth))).toBe(true)
  const futureLeft = Math.ceil(nowX * 2)
  expect((await pixels(svg, futureLeft, 1244 - futureLeft)).equals(await pixels(withoutClouds, futureLeft, 1244 - futureLeft))).toBe(false)
})
