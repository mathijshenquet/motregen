import { describe, expect, it } from 'vitest'
import { windGlyph, windGlyphName, windGlyphSvg } from './wind-glyph'

const inkSegments = (body: string) => (/class="glyph-ink-line" d="([^"]*)"/.exec(body)?.[1] ?? '').split('M').length - 1

describe('windveer', () => {
  it('telt halve veren als 1 Bft, hele als 2 Bft en een vaantje als 10 Bft', () => {
    expect(inkSegments(windGlyph('veer', 1, 'kaart').body)).toBe(2) // staf + halve
    expect(inkSegments(windGlyph('veer', 5, 'kaart').body)).toBe(4) // staf + 2 hele + halve
    expect(windGlyph('veer', 5, 'kaart').body).not.toContain('class="glyph-ink" d=')
    expect(windGlyph('veer', 11, 'kaart').body).toContain('class="glyph-ink" d=')
  })

  it('tekent bij windstilte alleen het kringetje', () => {
    expect(windGlyph('veer', 0, 'kaart').body).toContain('<circle class="glyph-ink-line"')
  })
})

describe('glyphs', () => {
  it('houdt de windzak bij vijf banden, oranje-wit', () => {
    const body = windGlyph('windzak', 3, 'kaart').body
    expect(body.match(/sock-orange/g)).toHaveLength(3)
    expect(body.match(/sock-white/g)).toHaveLength(2)
  })

  it('past in de tabelcel van 24 px en draait naar de windrichting', () => {
    for (const name of ['veer', 'windzak', 'komeet'] as const) expect(windGlyph(name, 6, 'tabel').box).toBeLessThanOrEqual(24)
    expect(windGlyphSvg('komeet', 3, 'tabel', 271.6)).toContain('rotate(272deg)')
  })

  it('kent alleen de drie varianten', () => {
    expect(windGlyphName('windzak')).toBe('windzak')
    expect(windGlyphName('pijl')).toBeUndefined()
    expect(windGlyphName(null)).toBeUndefined()
  })
})
