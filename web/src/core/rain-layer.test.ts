import { describe, expect, it } from 'vitest'
import { neutralizeNoData, rainColormap } from './rain-layer'

describe('rain rendering transitions', () => {
  it('keeps a blue hue while alpha rises continuously from dry into drizzle', () => {
    const lut = rainColormap()
    const color = (index: number) => Array.from(lut.subarray(index * 4, index * 4 + 4))
    expect(color(0)).toEqual([54, 183, 255, 0])
    expect(color(1).slice(0, 3)).toEqual(color(0).slice(0, 3))
    expect(color(54).slice(0, 3)).toEqual(color(0).slice(0, 3))
    expect(color(1)[3]).toBeLessThan(4)
    expect(color(54)[3]).toBeGreaterThan(color(1)[3]!)
  })

  it('maps no-data to dry before linear texture sampling without mutating decoded frames', () => {
    const source = Uint8Array.from([0, 1, 254, 255])
    expect(Array.from(neutralizeNoData(source))).toEqual([0, 1, 254, 0])
    expect(Array.from(source)).toEqual([0, 1, 254, 255])
    const withoutNoData = source.subarray(0, 3)
    expect(neutralizeNoData(withoutNoData)).toBe(withoutNoData)
  })
})
