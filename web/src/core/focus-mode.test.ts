import { describe, expect, it } from 'vitest'
import { DEFAULT_WIND_TUNING } from './wind-layer'
import { contextOpacity, DEFAULT_FOCUS_MODE, easeOutCubic, FocusMode, focusValue, rainPresentation, retargetFocus, windFocusIntensity, type FocusKind } from './focus-mode'

describe('focus tween math', () => {
  it('eases out and clamps', () => {
    expect(easeOutCubic(-1)).toBe(0)
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(2)).toBe(1)
  })

  it('interpolates between from and to over the duration', () => {
    const tween = { from: 0, to: 1, start: 100, duration: 200 }
    expect(focusValue(tween, 100)).toBe(0)
    expect(focusValue(tween, 200)).toBeCloseTo(0.875)
    expect(focusValue(tween, 300)).toBe(1)
    expect(focusValue({ ...tween, from: 1, to: 0 }, 200)).toBeCloseTo(0.125)
  })

  it('retargets from the current value with a distance-scaled duration', () => {
    const fadeIn = retargetFocus({ from: 0, to: 0, start: 0, duration: 0 }, 0, 1, false)
    expect(fadeIn).toEqual({ from: 0, to: 1, start: 0, duration: 250 })
    const midway = focusValue(fadeIn, 125)
    const fadeOut = retargetFocus(fadeIn, 125, 0, false)
    expect(fadeOut.from).toBeCloseTo(midway)
    expect(fadeOut.duration).toBeCloseTo(400 * midway)
    expect(focusValue(fadeOut, 125)).toBeCloseTo(midway)
  })

  it('jumps immediately under reduced motion', () => {
    const tween = retargetFocus({ from: 0, to: 0, start: 0, duration: 0 }, 50, 1, true)
    expect(tween.duration).toBe(0)
    expect(focusValue(tween, 50)).toBe(1)
  })

  it('dims context to the configured level at full focus', () => {
    expect(contextOpacity(0, 0.25)).toBe(1)
    expect(contextOpacity(1, 0.25)).toBe(0.25)
    expect(contextOpacity(0.5, 0.25)).toBeCloseTo(0.625)
  })

  it('brings the damped wind back to full at full wind focus', () => {
    // PO 2026-09-25 live (U34): default 0,5, windfocus 0,8.
    expect(windFocusIntensity(DEFAULT_WIND_TUNING.intensity, 0)).toBe(0.5)
    expect(windFocusIntensity(DEFAULT_WIND_TUNING.intensity, 1)).toBeCloseTo(0.8)
    expect(windFocusIntensity(DEFAULT_WIND_TUNING.intensity / 2, 1)).toBeCloseTo(0.8 / 2)
  })
})

describe('focus mode sources', () => {
  function harness(reducedMotion = false) {
    let now = 0
    const frames: Array<(time: number) => void> = []
    const values: Record<FocusKind, number[]> = { weather: [], air: [], temperature: [], wind: [] }
    const focus = new FocusMode<FocusKind>(['weather', 'air', 'temperature', 'wind'], DEFAULT_FOCUS_MODE, (mode, value) => values[mode].push(value),
      () => reducedMotion, () => now, (callback) => frames.push(callback), () => undefined)
    const advance = (ms: number) => {
      now += ms
      const pending = frames.splice(0)
      for (const callback of pending) callback(now)
    }
    return { focus, values, frames, advance }
  }

  it('starts with weather pinned and never removes the active pin', () => {
    const { focus } = harness(true)
    expect(focus.pinned()).toBe('weather')
    expect(focus.active()).toBe('weather')
    expect(focus.pin('weather')).toBe(false)
    expect(focus.pinned()).toBe('weather')
    expect(focus.pin('wind')).toBe(true)
    expect(focus.pinned()).toBe('wind')
    expect(focus.active()).toBe('wind')
  })

  it('stays focused while any source of the mode is active and animates back out', () => {
    const { focus, values, frames, advance } = harness()
    focus.set('temperature', 'keyboard', true)
    focus.set('temperature', 'table', true)
    advance(500)
    expect(values.temperature.at(-1)).toBe(1)
    expect(frames).toHaveLength(0)
    focus.set('temperature', 'keyboard', false)
    expect(frames).toHaveLength(0)
    focus.set('temperature', 'table', false)
    advance(200)
    expect(values.temperature.at(-1)).toBeGreaterThan(0)
    expect(values.temperature.at(-1)).toBeLessThan(0.2)
    advance(200)
    expect(values.temperature.at(-1)).toBe(0)
    expect(frames).toHaveLength(0)
    expect(values.wind).toEqual([])
  })

  it('lets the last activated mode win and hands back when it leaves', () => {
    const { focus, values, advance } = harness()
    focus.pin('temperature')
    advance(300)
    expect(focus.active()).toBe('temperature')
    focus.set('wind', 'table', true)
    expect(focus.active()).toBe('wind')
    advance(500)
    expect(values.wind.at(-1)).toBe(1)
    expect(values.temperature.at(-1)).toBe(0)
    // De vastgezette temperatuurfocus komt terug zodra de windhover eindigt.
    focus.set('wind', 'table', false)
    advance(500)
    expect(focus.active()).toBe('temperature')
    expect(values.wind.at(-1)).toBe(0)
    expect(values.temperature.at(-1)).toBe(1)
  })

  it('crossfades both modes in one frame loop', () => {
    const { focus, values, frames, advance } = harness()
    focus.set('wind', 'table', true)
    advance(300)
    focus.set('temperature', 'table', true)
    expect(frames).toHaveLength(1)
    advance(100)
    expect(values.temperature.at(-1)).toBeGreaterThan(0)
    expect(values.temperature.at(-1)).toBeLessThan(1)
    expect(values.wind.at(-1)).toBeGreaterThan(0)
    expect(values.wind.at(-1)).toBeLessThan(1)
    advance(400)
    expect(values.temperature.at(-1)).toBe(1)
    expect(values.wind.at(-1)).toBe(0)
    expect(frames).toHaveLength(0)
  })

  it('re-activating an older source makes its mode win again', () => {
    const { focus } = harness(true)
    focus.set('temperature', 'keyboard', true)
    focus.set('wind', 'table', true)
    expect(focus.active()).toBe('wind')
    focus.set('temperature', 'keyboard', true)
    expect(focus.active()).toBe('temperature')
    expect(focus.has('wind', 'table')).toBe(true)
  })

  it('applies the end value synchronously under reduced motion', () => {
    const { focus, values, frames } = harness(true)
    focus.set('wind', 'keyboard', true)
    expect(values.wind).toEqual([1])
    expect(values.temperature).toEqual([])
    expect(frames).toHaveLength(0)
    focus.set('temperature', 'keyboard', true)
    expect(values.wind).toEqual([1, 0])
    expect(values.temperature).toEqual([1])
  })
})

describe('rain presentation (U62)', () => {
  const base = { temperatureFocus: 0, windFocus: 0, airFocus: 0, night: false }

  it('draws the rain untouched in weather and hides it in temperature, day and night', () => {
    for (const night of [false, true]) {
      expect(rainPresentation({ ...base, night })).toEqual({ opacity: 1, saturation: 1, brightness: 1, multiply: false })
      expect(rainPresentation({ ...base, night, temperatureFocus: 1 }).opacity).toBe(0)
      expect(rainPresentation({ ...base, night, temperatureFocus: 0.5 }).opacity).toBe(0.5)
    }
  })

  it('multiplies the rain with the light map in wind instead of fading it', () => {
    expect(rainPresentation({ ...base, windFocus: 1 })).toEqual({ opacity: 0.9, saturation: 1, brightness: 1, multiply: true })
    // De mengmodus wisselt halverwege de focus-tween.
    expect(rainPresentation({ ...base, windFocus: 0.4 }).multiply).toBe(false)
    expect(rainPresentation({ ...base, windFocus: 0.5 }).multiply).toBe(true)
  })

  it('multiplies the rain with the white cloud veil by day', () => {
    expect(rainPresentation({ ...base, airFocus: 1 })).toEqual({ opacity: 1, saturation: 1, brightness: 1, multiply: true })
  })

  it('mutes the rain at night, where multiplying would make it disappear on the dark map', () => {
    const wind = rainPresentation({ ...base, night: true, windFocus: 1 })
    expect(wind.multiply).toBe(false)
    expect(wind.opacity).toBeCloseTo(0.8, 5)
    expect(wind.saturation).toBeCloseTo(0.7, 5)
    expect(wind.brightness).toBeCloseTo(0.9, 5)
    const air = rainPresentation({ ...base, night: true, airFocus: 1 })
    expect(air.multiply).toBe(false)
    expect(air.opacity).toBeCloseTo(0.7, 5)
    expect(air.saturation).toBeCloseTo(0.7, 5)
    expect(air.brightness).toBeCloseTo(0.85, 5)
  })
})
