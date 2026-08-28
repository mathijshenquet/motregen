import { describe, expect, it } from 'vitest'
import { parseCentroid } from './pdok'

describe('PDOK centroid', () => {
  it('parses the longitude-latitude WKT returned by lookup', () => {
    expect(parseCentroid('POINT(5.09520363 52.0886922)')).toEqual({ lng: 5.09520363, lat: 52.0886922 })
    expect(parseCentroid('POLYGON((0 0))')).toBeUndefined()
  })
})
