import { describe, expect, it } from 'vitest'
import { nearestPlace } from './places'

describe('nearest place', () => {
  it('uses a local Dutch place list for immediate map-click labels', () => {
    expect(nearestPlace(4.9, 52.36).name).toBe('Amsterdam')
    expect(nearestPlace(3.58, 51.45).name).toBe('Vlissingen')
    expect(nearestPlace(6.5, 53.21).name).toBe('Groningen')
  })
})
