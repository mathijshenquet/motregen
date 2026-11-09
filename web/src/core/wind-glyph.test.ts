import { describe, expect, it } from 'vitest'
import { WINDSOCK_SAMPLES, windsockBadge, windsockShape, windsockSvg } from './wind-glyph'

const straight = (degrees: number) => Array<number>(WINDSOCK_SAMPLES + 1).fill(degrees)
const tipOf = (strength: number, degrees = 0) => windsockShape(strength, straight(degrees), 'kaart').axis.at(-1)!

describe('windzak', () => {
  it('wordt langer en rechter met de windkracht, tot hij bij 5 Bft vol staat', () => {
    const [calmX, calmY] = tipOf(1), [fullX, fullY] = tipOf(5)
    expect(Math.hypot(fullX, fullY)).toBeGreaterThan(Math.hypot(calmX, calmY) * 1.5)
    // Slap buigt hij af; vol staat hij recht naar boven ("heen").
    expect(calmX).toBeGreaterThan(2)
    expect(fullX).toBeCloseTo(0, 6)
    expect(tipOf(5)).toEqual(tipOf(9))
  })

  it('volgt de schermhoek per asstuk', () => {
    const [eastX, eastY] = tipOf(5, 90)
    expect(eastX).toBeGreaterThan(40)
    expect(eastY).toBeCloseTo(0, 6)
    const bent = windsockShape(5, straight(0).map((_, index) => index * 3), 'kaart')
    expect(bent.headings.at(-1)).toBeCloseTo(60, 6)
  })

  it('houdt de tabelzak in vijf banden binnen het vak', () => {
    const svg = windsockSvg(3, 71.6)
    expect(svg.match(/sock-orange/g)).toHaveLength(3)
    expect(svg.match(/sock-white/g)).toHaveLength(2)
    expect(svg).toContain('rotate(72deg)')
    const coordinates = [...svg.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].flatMap((match) => [Number(match[1]), Number(match[2])])
    expect(Math.min(...coordinates)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...coordinates)).toBeLessThanOrEqual(24)
  })
})

describe('badge met het getal', () => {
  it('staat midden op de zak of over de mond, en houdt drie cijfers binnen de cirkel', () => {
    const shape = windsockShape(5, straight(90), 'kaart')
    const middle = windsockBadge(shape, 'midden', '5')
    expect(middle.x).toBeCloseTo(shape.axis[WINDSOCK_SAMPLES / 2]![0], 6)
    expect(middle.cutRadius).toBeGreaterThan(middle.radius)
    expect(windsockBadge(shape, 'mond', '5')).toMatchObject({ x: 0, y: 0 })
    expect(windsockBadge(shape, 'midden', '104').fontPx).toBeLessThan(middle.fontPx)
  })
})

describe('zakstijl', () => {
  it('kent de vijf varianten plus de huidige en valt anders terug op de zak', async () => {
    const { windsockStyleName, WINDSOCK_STYLE_NAMES } = await import('./wind-sock-styles')
    expect(WINDSOCK_STYLE_NAMES).toEqual(['zak', 'gravure', 'emaille', 'windwijzer', 'wimpel', 'glans'])
    expect(windsockStyleName('emaille')).toBe('emaille')
    expect(windsockStyleName('onbekend')).toBe('zak')
    expect(windsockStyleName(null)).toBe('zak')
  })
})
