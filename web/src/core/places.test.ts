import { describe, expect, it } from 'vitest'
import { nearestPlace } from './places'

describe('nearest place', () => {
  it('uses a local Dutch place list for immediate map-click labels', () => {
    expect(nearestPlace(4.9, 52.36).name).toBe('Amsterdam')
    expect(nearestPlace(3.58, 51.45).name).toBe('Vlissingen')
    expect(nearestPlace(6.5, 53.21).name).toBe('Groningen')
  })

  it('labels Flemish map clicks with the nearest Flemish city', () => {
    expect(nearestPlace(3.73, 51.06).name).toBe('Gent')
    expect(nearestPlace(4.41, 51.21).name).toBe('Antwerpen')
    expect(nearestPlace(4.36, 50.84).name).toBe('Brussel')
    expect(nearestPlace(5.33, 50.93).name).toBe('Hasselt')
    // Grensstreek: Baarle/Zeeuws-Vlaanderen blijft bij de dichtstbijzijnde stad, ongeacht het land.
    expect(nearestPlace(3.84, 51.33).name).toBe('Terneuzen')
  })
})
