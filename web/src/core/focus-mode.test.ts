import { describe, expect, it } from 'vitest'
import { contextOpacity, DEFAULT_FOCUS_TUNING, easeOutCubic, FocusMode, focusValue, retargetFocus } from './focus-mode'

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
    const fadeIn = retargetFocus({ from: 0, to: 0, start: 0, duration: 0 }, 0, 1, DEFAULT_FOCUS_TUNING, false)
    expect(fadeIn).toEqual({ from: 0, to: 1, start: 0, duration: 250 })
    const midway = focusValue(fadeIn, 125)
    const fadeOut = retargetFocus(fadeIn, 125, 0, DEFAULT_FOCUS_TUNING, false)
    expect(fadeOut.from).toBeCloseTo(midway)
    expect(fadeOut.duration).toBeCloseTo(400 * midway)
    expect(focusValue(fadeOut, 125)).toBeCloseTo(midway)
  })

  it('jumps immediately under reduced motion', () => {
    const tween = retargetFocus({ from: 0, to: 0, start: 0, duration: 0 }, 50, 1, DEFAULT_FOCUS_TUNING, true)
    expect(tween.duration).toBe(0)
    expect(focusValue(tween, 50)).toBe(1)
  })

  it('dims context to the configured level at full focus', () => {
    expect(contextOpacity(0, 0.25)).toBe(1)
    expect(contextOpacity(1, 0.25)).toBe(0.25)
    expect(contextOpacity(0.5, 0.25)).toBeCloseTo(0.625)
  })
})

describe('focus mode sources', () => {
  function harness(reducedMotion = false) {
    let now = 0
    const frames: Array<(time: number) => void> = []
    const values: number[] = []
    const focus = new FocusMode((value) => values.push(value), () => DEFAULT_FOCUS_TUNING, () => reducedMotion, () => now,
      (callback) => frames.push(callback), () => undefined)
    const advance = (ms: number) => {
      now += ms
      const pending = frames.splice(0)
      for (const callback of pending) callback(now)
    }
    return { focus, values, frames, advance }
  }

  it('stays focused while any source is active and animates back out', () => {
    const { focus, values, frames, advance } = harness()
    focus.set('map', true)
    focus.set('table', true)
    advance(300)
    expect(values.at(-1)).toBe(1)
    expect(frames).toHaveLength(0)
    focus.set('map', false)
    expect(frames).toHaveLength(0)
    focus.set('table', false)
    advance(200)
    expect(values.at(-1)).toBeGreaterThan(0)
    expect(values.at(-1)).toBeLessThan(0.2)
    advance(200)
    expect(values.at(-1)).toBe(0)
    expect(frames).toHaveLength(0)
  })

  it('applies the end value synchronously under reduced motion', () => {
    const { focus, values, frames } = harness(true)
    focus.set('keyboard', true)
    expect(values).toEqual([1])
    expect(frames).toHaveLength(0)
  })
})
