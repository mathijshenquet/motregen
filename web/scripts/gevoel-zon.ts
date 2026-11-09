import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Manifest, MrfHeader, TimelineFrame } from '../src/core/contract'
import { FEELS_Q_FACTOR, FEELS_VARIANTS, feelsLikeC, feelsLikeSunC, sunQAt } from '../src/core/feels-sun'
import { decodeFrame, parseMrfHeader } from '../src/core/mrf'
import { pointValue } from '../src/core/point-value'
import { solarElevationSin } from '../src/core/solar'
import { buildTimeline } from '../src/core/time-model'

// U105 / MIP-41: getallen voor de gevoelsvarianten.
//   pnpm exec tsx scripts/gevoel-zon.ts tabel             zes typische situaties, alle varianten (TEMPERATURES=15 voor de sanity)
//   pnpm exec tsx scripts/gevoel-zon.ts scan <snapshot>   per HARMONIE-uur overdag: T, straling en gevoel per stad
const [command, snapshot] = process.argv.slice(2)
const HOUR = 3_600_000
const cities = { 'De Bilt': [5.18, 52.1], Amsterdam: [4.9, 52.37], Groningen: [6.57, 53.22], Maastricht: [5.69, 50.85], Vlissingen: [3.6, 51.44] } as const
const round = (value: number) => value.toFixed(1).replace('.', ',')

if (command === 'tabel') {
  // Middag 20 april in De Bilt (zon ~48°); zon: 700 W/m², 2 Bft, RH 60 %; bewolkt: 150 W/m², 3 Bft, RH 85 %.
  const noon = Date.parse('2026-04-20T11:40:00Z')
  const sin = (epoch: number) => solarElevationSin(epoch, ...cities['De Bilt'])
  const situations = [
    { sky: 'zon', global: 700, wind: 2.5, humidity: 0.6 },
    { sky: 'bewolkt', global: 150, wind: 4.4, humidity: 0.85 },
  ]
  console.log(`| situatie | Q (W/m²) | ${FEELS_VARIANTS.join(' | ')} |`)
  console.log(`| --- | ---: | ${FEELS_VARIANTS.map(() => '---:').join(' | ')} |`)
  for (const situation of situations) {
    const q = sunQAt(noon, situation.global, situation.global, sin)
    for (const temperature of process.env.TEMPERATURES?.split(',').map(Number) ?? [12, 18, 24]) {
      const values = FEELS_VARIANTS.map((variant) => variant === 'nu'
        ? feelsLikeC(temperature, situation.humidity, situation.wind)
        : feelsLikeSunC(temperature, situation.humidity, situation.wind, FEELS_Q_FACTOR[variant] * q))
      console.log(`| ${situation.sky}, ${temperature} °C, ${round(situation.wind)} m/s, RH ${situation.humidity * 100} % | ${Math.round(q)} | ${values.map((value) => `${round(value)} °C`).join(' | ')} |`)
    }
  }
} else if (command === 'scan' && snapshot) {
  const manifest = JSON.parse(readFileSync(join(snapshot, 'manifest.json'), 'utf8')) as Manifest
  const files = new Map<string, Uint8Array>()
  const read = (frame: TimelineFrame | undefined): { header: MrfHeader; frame: Uint8Array } | undefined => {
    if (!frame) return undefined
    let file = files.get(frame.chunk.url)
    if (!file) files.set(frame.chunk.url, file = new Uint8Array(readFileSync(join(snapshot, frame.chunk.url))))
    const header = parseMrfHeader(file.subarray(0, frame.chunk.header_len))
    const index = header.frames[frame.frameIndex]!
    const start = frame.chunk.header_len + index.offset
    return { header, frame: decodeFrame(file.subarray(start, start + index.len), header.grid.width * header.grid.height, header.pred ? { width: header.grid.width, height: header.grid.height } : undefined) }
  }
  const byEpoch = (field: Parameters<typeof buildTimeline>[1]) => new Map(buildTimeline(manifest, field).map((frame) => [frame.epoch, frame]))
  const [feels, temperature, humidity, windU, windV, radiation] = (['feels_like_c', 'temp_c', 'rel_humidity', 'wind_u_ms', 'wind_v_ms', 'radiation'] as const).map(byEpoch)
  for (const [epoch, feelsFrame] of feels!) {
    const hour = new Date(epoch).getUTCHours()
    if (hour < 9 || hour > 15) continue
    const fields = [read(feelsFrame), read(temperature!.get(epoch)), read(humidity!.get(epoch)), read(windU!.get(epoch)), read(windV!.get(epoch)), read(radiation!.get(epoch)), read(radiation!.get(epoch + HOUR))]
    const cells = Object.entries(cities).map(([name, [lng, lat]]) => {
      const x = lng * Math.PI / 180 * 6_378_137
      const y = Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 6_378_137
      const [base, t, rh, u, v, at, after] = fields.map((field) => field && pointValue(field.header, field.frame, x, y))
      if (base == null || t == null || rh == null || u == null || v == null) return `${name} –`
      const wind = Math.hypot(u, v)
      const q = sunQAt(epoch, at, after, (moment) => solarElevationSin(moment, lng, lat))
      const variant = (factor: number) => t <= 10 ? base : base + feelsLikeSunC(t, rh / 100, wind, factor * q) - feelsLikeC(t, rh / 100, wind)
      return `${name} T ${round(t)} G ${Math.round(at ?? 0)} v ${round(wind)} Q ${Math.round(q)} → ${round(base)}/${round(variant(1))}/${round(variant(2))}`
    })
    console.log(new Date(epoch).toISOString().slice(0, 16), cells.join(' · '))
  }
} else {
  throw new Error('usage: pnpm exec tsx scripts/gevoel-zon.ts tabel | scan <snapshotmap>')
}
