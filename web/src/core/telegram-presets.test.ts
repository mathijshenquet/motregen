import { describe, expect, it } from 'vitest'
import { telegramPresetSearch, telegramPresets, telegramStartParameter } from './telegram-presets'

describe('Telegram launch presets', () => {
  const epoch = Date.parse('2026-10-07T14:10:00Z')

  it('round trips all modes and an absolute time through a startapp token', () => {
    for (const mode of ['weather', 'air', 'feels', 'wind'] as const) {
      expect(telegramPresets(telegramStartParameter(mode, epoch))).toEqual({ mode, epoch })
    }
  })

  it('keeps explicit URL presets and never adds location or identity', () => {
    const search = telegramPresetSearch('?tg=1&modus=lucht&t=+2u', telegramStartParameter('wind', epoch))
    expect(search.get('modus')).toBe('lucht')
    expect(search.get('t')).toBe(' 2u')
    expect([...search.keys()]).toEqual(['tg', 'modus', 't'])
  })

  it('ignores launch parameters outside Telegram and malformed tokens', () => {
    expect(telegramPresetSearch('?startapp=wind_1791382200').has('modus')).toBe(false)
    for (const parameter of ['wind', 'pollen_1791382200', 'wind_-1', 'wind_1&lat=52', 'wind_999999999999999']) {
      expect(telegramPresets(parameter)).toEqual({})
    }
  })
})
