import { describe, expect, it } from 'vitest'
import { telegramPresets } from '../web/src/core/telegram-presets.js'
import { cacheKey, caption, keyboard, matchingModes, miniAppLink, parseCallback, presetUrl, STILL_HOURS, STILL_MINUTES, STILL_MODES, stillEpoch, stillTime, validateManifest, type StillManifest } from './stills.js'

const manifest: StillManifest = {
  version: 0,
  generated: '2026-10-07T12:00:00Z',
  now: '2026-10-07T12:10:00Z',
  chunks: [{ url: 'chunks/rain.mrf', times: ['2026-10-07T12:10:00Z'] }],
}

describe('stills and Telegram selections', () => {
  it('formats Dutch captions in Amsterdam time through the daylight-saving boundary', () => {
    expect(stillTime(Date.parse('2026-10-10T12:10:00Z'))).toBe('za 14:10')
    expect(stillTime(Date.parse('2026-10-25T01:10:00Z'))).toBe('zo 02:10')
    for (const definition of STILL_MODES) {
      const text = caption(definition.mode, Date.parse(manifest.now))
      expect(text).toMatch(/^<a href="https:\/\/motregen\.nl\/\?.*">motregen\.nl<\/a>$/)
      expect(text).not.toContain('KNMI')
      expect(text).not.toContain('Regenintensiteit')
      expect(text).toContain(`modus=${definition.query}`)
      expect(text.length).toBeLessThanOrEqual(1024)
    }
  })

  it('isolates modes, hours and manifest generations in stable cache keys', () => {
    const selection = { mode: 'weather', hour: 0 } as const
    const first = cacheKey(selection, manifest)
    expect(cacheKey(selection, { ...manifest })).toBe(first)
    expect(cacheKey({ mode: 'air', hour: 0 }, manifest)).not.toBe(first)
    expect(cacheKey({ mode: 'weather', hour: 3 }, manifest)).not.toBe(first)
    expect(cacheKey(selection, { ...manifest, generated: '2026-10-07T12:05:00Z' })).not.toBe(first)
    expect(cacheKey(selection, { ...manifest, now: '2026-10-07T12:15:00Z' })).not.toBe(first)
    expect(first).toMatch(/^weather-\d{13}-[a-f0-9]{24}$/)
  })

  it('gives the still URL and Mini App deep link identical presets', () => {
    const epoch = stillEpoch(manifest, 3)
    const still = new URL(presetUrl('https://motregen.nl', 'air', epoch, true))
    const app = new URL(presetUrl('https://motregen.nl', 'air', epoch))
    const launch = new URL(miniAppLink('motregen_bot', 'air', epoch))
    expect(still.searchParams.get('still')).toBe('1')
    expect(app.searchParams.get('tg')).toBe('1')
    expect(app.searchParams.get('t')).toBe(still.searchParams.get('t'))
    expect(telegramPresets(launch.searchParams.get('startapp')!)).toEqual({ mode: 'air', epoch })
    expect(app.searchParams.has('lat')).toBe(false)
  })

  it('provides relative steps with an independent now button and no duplicate app button', () => {
    expect(STILL_MODES.map((entry) => entry.command)).toEqual(['regen', 'lucht', 'gevoel'])
    expect(STILL_MINUTES).toHaveLength(85)
    expect(STILL_MINUTES[0]).toBe(-120)
    expect(STILL_MINUTES.at(-1)).toBe(720)
    const selections = new Set<string>()
    for (const definition of STILL_MODES) {
      for (const hour of STILL_HOURS) {
        const selection = { mode: definition.mode, hour }
        const inline = keyboard(selection, stillEpoch(manifest, hour), manifest.generated)
        expect(inline.inline_keyboard).toHaveLength(2)
        expect(inline.inline_keyboard[0]).toHaveLength(4)
        expect(inline.inline_keyboard[1].length).toBeLessThanOrEqual(6)
        for (const button of inline.inline_keyboard.flat()) {
          expect(button.web_app).toBeUndefined()
          expect(button.url).toBeUndefined()
          if (button.callback_data) {
            expect(Buffer.byteLength(button.callback_data)).toBeLessThanOrEqual(64)
            expect(parseCallback(button.callback_data)).toBeDefined()
            selections.add(button.callback_data)
          }
        }
      }
    }
    expect(selections.size).toBe(262)
    const stepButtons = keyboard({ mode: 'air', hour: 3 }, stillEpoch(manifest, 3), manifest.generated).inline_keyboard[1]
    expect(stepButtons.map((button) => button.text)).toEqual(['−1u', '−10m', 'nu', '+10m', '+1u', 'Loop'])
    expect(parseCallback(stepButtons[1].callback_data)).toEqual({ mode: 'air', hour: 'at', epoch: stillEpoch(manifest, 3) - 600_000, generated: Date.parse(manifest.generated) })
    expect(parseCallback(stepButtons[2].callback_data)).toEqual({ mode: 'air', hour: 0 })
  })

  it('rejects wind stills and filters all four loop modes', () => {
    for (const invalid of [undefined, 'pollen:0', 'wind:01', 'wind:25', 'wind:0:extra', 'wind:-1', 'wind:0', 'weather:24', 'weather:at:bad:123', 'wind:at:1791375000000:1791375000000']) expect(parseCallback(invalid)).toBeUndefined()
    expect(matchingModes('')).toHaveLength(4)
    expect(matchingModes(' WIND ')).toEqual(['wind'])
    expect(parseCallback('wind:loop')).toEqual({ mode: 'wind', hour: 'loop' })
    expect(keyboard({ mode: 'wind', hour: 'loop' }, stillEpoch(manifest, 0)).inline_keyboard[1].map((button) => button.callback_data)).toEqual(['wind:loop'])
    expect(matchingModes('gevoel')).toEqual(['feels'])
    expect(matchingModes('pollen')).toEqual([])
  })

  it('rejects an unavailable or invalid manifest before launching Chromium', () => {
    expect(validateManifest(manifest)).toEqual(manifest)
    for (const invalid of [null, {}, { ...manifest, generated: 'bad' }, { ...manifest, chunks: [] }, { ...manifest, chunks: [{ url: 'bad', times: ['bad'] }] }]) {
      expect(() => validateManifest(invalid)).toThrow()
    }
  })
})
