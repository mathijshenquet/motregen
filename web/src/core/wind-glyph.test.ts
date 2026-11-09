import { describe, expect, it } from 'vitest'
import { uprightTextAngle, WINDSOCK_SAMPLES, windsockShape, windsockSvg } from './wind-glyph'

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

describe('getal op de zak', () => {
  it('staat langs de as en nooit ondersteboven', () => {
    expect(uprightTextAngle(90)).toBe(0) // zak naar het oosten: tekst gewoon horizontaal
    expect(uprightTextAngle(270)).toBe(0) // naar het westen: geflipt, niet op zijn kop
    expect(uprightTextAngle(0)).toBe(-90)
    expect(uprightTextAngle(180)).toBe(90)
    for (let heading = -360; heading <= 720; heading += 7) expect(Math.abs(uprightTextAngle(heading))).toBeLessThanOrEqual(90)
  })
})
