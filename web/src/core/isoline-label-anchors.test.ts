import { describe, expect, it } from 'vitest'
import { clampLabelTuning, DEFAULT_LABEL_TUNING, loadLabelTuning, pointLabelCandidates } from './isoline-label-anchors'

const storage = (values: Record<string, string>) => ({ getItem: (key: string) => values[key] ?? null })

describe('label tuning (U100, ?dev)', () => {
  it('keeps today’s look without parameters', () => {
    expect(loadLabelTuning('?dev', storage({}))).toEqual(DEFAULT_LABEL_TUNING)
  })

  it('takes the URL over storage and clamps to the ranges', () => {
    const stored = storage({ 'motregen-dev-labelgrootte': '14', 'motregen-dev-labelvulling': '200' })
    expect(loadLabelTuning('?dev&labelgrootte=13&labelafstand=999', stored)).toEqual({ size: 13, spacing: 300, fill: 200 })
  })

  it('treats a fill radius below 120 px as 120 and 0 as off', () => {
    expect(clampLabelTuning('fill', 0)).toBe(0)
    expect(clampLabelTuning('fill', 50)).toBe(120)
    expect(clampLabelTuning('size', Number.NaN)).toBe(DEFAULT_LABEL_TUNING.size)
  })

  it('survives storage that throws', () => {
    const broken = { getItem: () => { throw new Error('geen opslag') } }
    expect(loadLabelTuning('?dev&labelgrootte=15', broken)).toEqual({ ...DEFAULT_LABEL_TUNING, size: 15 })
  })
})

describe('point label candidates', () => {
  it('lie on a fixed staggered grid, independent of the view origin', () => {
    const view = { left: 0, right: 20, top: 0, bottom: 20 }
    const points = [...pointLabelCandidates(view, 10)]
    expect(points).toContainEqual([0, 0])
    expect(points).toContainEqual([5, 10])
    const shifted = [...pointLabelCandidates({ left: 3, right: 23, top: 3, bottom: 23 }, 10)]
    for (const point of shifted) expect(points.some(([column, row]) => column === point[0] && row === point[1]) || point[0] > 20 || point[1] > 20).toBe(true)
  })
})
