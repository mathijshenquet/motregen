import { describe, expect, it } from 'vitest'
import { conciseLocationLabel, parseCentroid } from './pdok'

describe('PDOK centroid', () => {
  it('parses the longitude-latitude WKT returned by lookup', () => {
    expect(parseCentroid('POINT(5.09520363 52.0886922)')).toEqual({ lng: 5.09520363, lat: 52.0886922 })
    expect(parseCentroid('POLYGON((0 0))')).toBeUndefined()
  })

  it('keeps the place name concise while retaining context for disambiguation', () => {
    expect(conciseLocationLabel('Hilvarenbeek, Hilvarenbeek, Noord-Brabant')).toEqual({
      label: 'Hilvarenbeek',
      detail: 'Hilvarenbeek · Noord-Brabant',
    })
  })
})
