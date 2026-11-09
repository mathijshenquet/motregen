import { describe, expect, it } from 'vitest'
import { islandBox, lookLabelTuning, nestedPlaces, TEMPERATURE_NUMBER_PLACES, placeNamePaddingPx, placeNumberSpacingPx, regionNumbers, TEMPERATURE_LABEL_PLANS, temperatureLabelLook, temperatureLabelSize, type RegionOptions } from './temperature-numbers'
import { loadLabelTuning } from './isoline-label-anchors'

const options: RegionOptions = { cellPx: 6, insetPx: 14, keepInsetPx: 9, minDistancePx: 44, repeatPx: 160, max: 60 }

describe('templabels variants (U100 ronde 3)', () => {
  it('reads the variant from the URL and ignores unknown values', () => {
    expect(temperatureLabelLook('?dev&templabels=vlakken')).toBe('vlakken')
    expect(temperatureLabelLook('?dev&templabels=plekken-half')).toBe('plekken-half')
    expect(temperatureLabelLook('?dev&templabels=onzin')).toBeUndefined()
    expect(temperatureLabelLook('?dev')).toBeUndefined()
  })

  it('offsets the lines by half a degree exactly where the number must match its band', () => {
    expect(TEMPERATURE_LABEL_PLANS.lijn).toEqual({ offset: 0 })
    expect(TEMPERATURE_LABEL_PLANS.plekken).toEqual({ numbers: 'plekken', offset: 0 })
    expect(TEMPERATURE_LABEL_PLANS.vlakken).toEqual({ numbers: 'vlakken', offset: 0.5 })
    expect(TEMPERATURE_LABEL_PLANS['plekken-half']).toEqual({ numbers: 'plekken', offset: 0.5 })
  })

  it('uses 13 px on desktop and 12 px on a phone, and starts the comparison from those without stored sliders', () => {
    expect(temperatureLabelSize(1440, 900)).toBe(13)
    expect(temperatureLabelSize(402, 844)).toBe(12)
    expect(lookLabelTuning(1440, 900)).toEqual({ size: 13, spacing: 160, fill: 0 })
    expect(loadLabelTuning('?dev&templabels=lijn', undefined, lookLabelTuning(402, 844))).toEqual({ size: 12, spacing: 160, fill: 0 })
    expect(loadLabelTuning('?dev&templabels=lijn&labelgrootte=15', undefined, lookLabelTuning(402, 844)).size).toBe(15)
  })

  it('spaces the places like the wind socks and sizes the island from the text', () => {
    expect(placeNumberSpacingPx(1440, 900)).toBe(56)
    expect(placeNumberSpacingPx(402, 844)).toBe(40)
    expect(islandBox('10°', 13)).toEqual({ width: 36, height: 19 })
    expect(placeNamePaddingPx(6.9)).toBe(18)
    expect(placeNamePaddingPx(10.5)).toBe(4)
  })
})

describe('one number per region', () => {
  // Drie verticale stroken: 5 °C (x < 200), 6 °C (200–400), 7 °C (≥ 400) op een 600 × 300-beeld.
  const strips = (x: number) => x < 200 ? 5.2 : x < 400 ? 5.8 : 7.1

  it('puts each region number at the point farthest from its edges', () => {
    const labels = regionNumbers(strips, 600, 300, { ...options, repeatPx: 1000 })
    expect(labels.map((label) => label.value).sort()).toEqual([5, 6, 7])
    const middle = labels.find((label) => label.value === 6)!
    expect(Math.abs(middle.x - 300)).toBeLessThanOrEqual(6)
    // Een strook van 200 px heeft een plateau (100 px van beide randen) tussen y = 100 en 200.
    expect(middle.y).toBeGreaterThanOrEqual(94)
    expect(middle.y).toBeLessThanOrEqual(206)
  })

  it('repeats a number in a large region, never closer than the repeat distance', () => {
    const labels = regionNumbers(() => 9.3, 1200, 300, options)
    expect(labels.length).toBeGreaterThan(2)
    expect(labels.every((label) => label.value === 9)).toBe(true)
    for (const label of labels) {
      for (const other of labels) if (other !== label) expect(Math.hypot(label.x - other.x, label.y - other.y)).toBeGreaterThanOrEqual(160)
    }
  })

  it('skips regions too narrow for an island, and areas without data', () => {
    const narrow = (x: number) => x < 290 ? 3.2 : x < 310 ? 4 : x < 450 ? 5.1 : undefined
    const values = regionNumbers(narrow, 600, 300, options).map((label) => label.value)
    expect(values).toContain(3)
    expect(values).toContain(5)
    expect(values).not.toContain(4)
  })

  it('keeps a previous number in place while it still fits, so playback does not shuffle them', () => {
    const previous = [{ x: 260, y: 90, value: 6 }]
    const labels = regionNumbers(strips, 600, 300, { ...options, repeatPx: 1000 }, previous)
    expect(labels).toContainEqual({ x: 260, y: 90, value: 6 })
    expect(labels.filter((label) => label.value === 6)).toHaveLength(1)
    // Ligt het vorige getal inmiddels in een ander vlak, dan vervalt het.
    expect(regionNumbers(strips, 600, 300, options, [{ x: 100, y: 90, value: 6 }])).not.toContainEqual({ x: 100, y: 90, value: 6 })
  })

  it('lets the caller block spots (place names, the pin)', () => {
    const labels = regionNumbers(() => 2, 300, 300, { ...options, blocked: (x, y) => Math.hypot(x - 150, y - 150) < 40 })
    expect(labels.length).toBeGreaterThan(0)
    for (const label of labels) expect(Math.hypot(label.x - 150, label.y - 150)).toBeGreaterThanOrEqual(40)
  })
})

describe('stable places while zooming', () => {
  it('only adds places when zooming in and only removes them when zooming out', () => {
    let previous: string[] = []
    for (let zoom = 5; zoom <= 10; zoom += 0.25) {
      const names = nestedPlaces(zoom, 50, TEMPERATURE_NUMBER_PLACES).map((place) => place.name)
      expect(names.slice(0, previous.length)).toEqual(previous)
      previous = names
    }
    expect(previous.length).toBeGreaterThan(nestedPlaces(5, 50, TEMPERATURE_NUMBER_PLACES).length)
  })

})
