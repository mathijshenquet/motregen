import { describe, expect, it } from 'vitest'
import { nightCue } from './dev-settings'
import { skyColorAt, skyRailGradient } from './sky-rail'
import { sunEvents } from './solar'

const at = (iso: string) => Date.parse(iso)
const utrecht = { lng: 5.12, lat: 52.09 }

describe('sky rail', () => {
  it('runs from night navy through twilight to day blue, clamped at both ends', () => {
    expect(skyColorAt(-40)).toBe('rgb(27 36 64)')
    expect(skyColorAt(-18)).toBe('rgb(27 36 64)')
    expect(skyColorAt(-1)).toBe('rgb(224 120 106)')
    expect(skyColorAt(60)).toBe('rgb(95 179 234)')
    expect(skyColorAt(0.5)).toBe('rgb(233 150 107)') // halverwege horizon en laag daglicht
  })

  it('puts the sunrise colour at its real moment inside a twelve-hour day row', () => {
    const start = at('2026-10-21T04:00:00Z') // Dag 06–18 lokaal
    const end = at('2026-10-21T16:00:00Z')
    const sunrise = sunEvents(start, end, utrecht.lng, utrecht.lat).find((event) => event.kind === 'rise')!
    const gradient = skyRailGradient(start, end, utrecht.lng, utrecht.lat)
    const stops = [...gradient.matchAll(/rgb\((\d+) (\d+) (\d+)\) ([\d.]+)%/g)].map((match) => ({ red: Number(match[1]), share: Number(match[4]) }))
    expect(stops).toHaveLength(25) // elk half uur
    // De warmste stop (rood het hoogst) ligt binnen een half uur van de echte zonsopkomst.
    const warmest = stops.reduce((best, stop) => stop.red > best.red ? stop : best)
    expect(Math.abs(start + (end - start) * warmest.share / 100 - sunrise.epoch)).toBeLessThanOrEqual(30 * 60_000)
  })

  it('maps only the non-dark values to a night cue', () => {
    expect(['rail', 'symbool', 'sterren', 'breed', 'smal', 'sterk'].map((value) => nightCue(value as never))).toEqual(['rail', 'symbool', 'sterren', undefined, undefined, undefined])
  })
})
