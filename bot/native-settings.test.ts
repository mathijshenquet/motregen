import { expect, it } from 'vitest'
import { nativeRenderer } from './native-settings.js'

it('selects every native mode by default and supports independent browser rollback', () => {
  for (const mode of ['weather', 'feels', 'wind'] as const) expect(nativeRenderer(mode, {})).toBe('native')
  expect(nativeRenderer('feels', { MOTREGEN_NATIVE_RENDERER: 'weather,wind' })).toBe('playwright')
  expect(nativeRenderer('wind', { MOTREGEN_NATIVE_RENDERER: 'weather,wind' })).toBe('native')
  expect(nativeRenderer('weather', { MOTREGEN_NATIVE_RENDERER: 'playwright' })).toBe('playwright')
  expect(nativeRenderer('weather', { MOTREGEN_RAIN_RENDERER: 'playwright' })).toBe('playwright')
  expect(nativeRenderer('weather', { MOTREGEN_RAIN_RENDERER: 'playwright', MOTREGEN_NATIVE_RENDERER: 'weather' })).toBe('native')
  for (const value of ['', 'weather,weather', 'native', 'weather,unknown']) expect(() => nativeRenderer('feels', { MOTREGEN_NATIVE_RENDERER: value })).toThrow('MOTREGEN_NATIVE_RENDERER')
})
