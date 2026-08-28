import { describe, expect, it } from 'vitest'
import { encodeMotionTexture, motionWarpStrength, neutralizeNoData, packRainTexture, rainColormap, WARP_CAP_CELLS } from './rain-layer'

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
    expect(Array.from(packRainTexture(source))).toEqual([0, 255, 1, 255, 254, 255, 0, 0])
  })

  it('encodes signed motion as RG8 with a separate no-data mask', () => {
    const motion = encodeMotionTexture({ width: 2, height: 1, vectors: Uint8Array.of(1, 255, 128, 0) })
    expect(Array.from(motion.vectors)).toEqual([129, 127, 128, 128])
    expect(Array.from(motion.mask)).toEqual([255, 0])
  })

  it('caps large warps and slides fully back to crossfade', () => {
    expect(motionWarpStrength(0)).toBe(1)
    expect(motionWarpStrength(WARP_CAP_CELLS)).toBe(1)
    expect(motionWarpStrength(20) * 20).toBeLessThanOrEqual(WARP_CAP_CELLS)
    expect(motionWarpStrength(30)).toBe(0)
  })
})
