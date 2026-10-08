import { readFileSync } from 'node:fs'
import type { StyleSpecification } from 'maplibre-gl'
import { describe, expect, it } from 'vitest'
import { basemapBlendTargets, blendedPaintValue, contrastRatio, formatColor, mixColors, nightShare, parseColor, type Rgba } from './basemap-blend'

const style = (name: string) => JSON.parse(readFileSync(new URL(`../../public/basemap/${name}.json`, import.meta.url), 'utf8')) as StyleSpecification
const targets = basemapBlendTargets(style('licht'), style('donker'))

describe('basemap day/night blend (U62)', () => {
  it('parses the colour notations the styles use', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255, 1])
    expect(parseColor('#101d21')).toEqual([16, 29, 33, 1])
    expect(parseColor('rgb(158,189,255)')).toEqual([158, 189, 255, 1])
    expect(parseColor('rgba(176, 213, 154, 1)')).toEqual([176, 213, 154, 1])
    const wood = parseColor('hsla(98,61%,72%,0.7)')!
    expect(wood.map((channel) => Math.round(channel * 10) / 10)).toEqual([172, 227.2, 140, 0.7])
    expect(parseColor('interpolate')).toBeUndefined()
  })

  it('finds only paint colours that differ, on layers both styles share', () => {
    expect(targets.length).toBeGreaterThan(10)
    expect(new Set(targets.map((target) => target.property))).toEqual(new Set(['background-color', 'fill-color', 'line-color', 'text-color', 'text-halo-color']))
    expect(targets.find((target) => target.layer === 'water')).toMatchObject({ property: 'fill-color', light: 'rgb(158,189,255)', dark: '#183746' })
  })

  it('is exactly the light style by day and the dark style by night', () => {
    for (const target of targets) {
      for (const [night, expected] of [[0, target.light], [1, target.dark]] as const) {
        const value = blendedPaintValue(target, night)
        if (typeof expected !== 'string') continue
        if (typeof value !== 'string') { expect(Array.isArray(value), `${target.layer} ${target.property}`).toBe(true); continue }
        expect(parseColor(value)!.map(Math.round), `${target.layer} ${target.property} bij ${night}`).toEqual(parseColor(expected)!.map(Math.round))
      }
    }
  })

  it('blends a zoom ramp against a single colour stop by stop', () => {
    const residential = targets.find((target) => target.layer === 'landuse_residential')!
    const halfway = blendedPaintValue(residential, 0.5) as unknown[]
    expect(halfway.slice(0, 4)).toEqual((residential.light as unknown[]).slice(0, 4))
    expect(halfway.filter((part) => typeof part === 'string' && part.startsWith('rgba('))).toHaveLength(2)
  })

  it('keeps every label at 4.5:1 against its halo in every in-between state', () => {
    const labelLayers = [...new Set(targets.filter((target) => target.property === 'text-color').map((target) => target.layer))]
    expect(labelLayers.length).toBeGreaterThan(2)
    for (let step = 0; step <= 20; step++) {
      const night = step / 20
      for (const layer of labelLayers) {
        const valueOf = (property: string) => parseColor(blendedPaintValue(targets.find((target) => target.layer === layer && target.property === property)!, night) as string)!
        expect(contrastRatio(valueOf('text-color'), valueOf('text-halo-color')), `${layer} bij nacht ${night}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('mixes in linear light and follows the same twilight as the scrubber sky', () => {
    const white: Rgba = [255, 255, 255, 1]
    const black: Rgba = [0, 0, 0, 1]
    expect(formatColor(mixColors(white, black, 0.5))).toBe('rgba(188,188,188,1)')
    expect(nightShare(0.3)).toBe(0)
    expect(nightShare(0)).toBeCloseTo(0.5, 5)
    expect(nightShare(-0.3)).toBe(1)
  })
})
