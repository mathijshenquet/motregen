import { describe, expect, it } from 'vitest'
import { windsockPill, windsockShape, WINDSOCK_SAMPLES } from './wind-glyph'
import { sockBadge, windsockExtent } from './wind-sock-draw'
import { sockRect, windsockDevOptions } from './wind-socks'
import { sockReach, socksClear } from './windsock-flow'

describe('windsockDevOptions', () => {
  it('kiest de zakeenheid uit de bekende vormen, standaard de pil (U113)', () => {
    expect(windsockDevOptions(new URLSearchParams('zakeenheid=cirkel')).unitStyle).toBe('cirkel')
    expect(windsockDevOptions(new URLSearchParams('zakeenheid=onzin')).unitStyle).toBe('pil')
    expect(windsockDevOptions(new URLSearchParams('')).unitStyle).toBe('pil')
  })
})

describe('de pil op de zak (U113)', () => {
  it('steekt uit naar de kant waar de zak niet is, en staat bij noordenwind in het midden', () => {
    expect(windsockPill(90, '2', 'Bft').x).toBeLessThan(0)
    expect(windsockPill(270, '2', 'Bft').x).toBeGreaterThan(0)
    expect(windsockPill(0, '2', 'Bft').x).toBeCloseTo(0)
    expect(windsockPill(90, '25', 'km/u').halfWidth).toBeGreaterThan(windsockPill(90, '2', 'Bft').halfWidth)
  })

  it('telt mee in de toets tegen de buurzak: twee pillen naar elkaar toe raken elkaar', () => {
    const west = sockReach([100, 100], 270, 3, windsockPill(270, '3', 'Bft'))
    const east = sockReach([148, 100], 90, 3, windsockPill(90, '3', 'Bft'))
    expect(socksClear(sockReach([100, 100], 270, 3), sockReach([148, 100], 90, 3))).toBe(true)
    expect(socksClear(west, east)).toBe(false)
  })

  it('de omvang omvat zak en pil', () => {
    const shape = windsockShape(5, Array<number>(WINDSOCK_SAMPLES + 1).fill(90), 'kaart')
    const pill = windsockPill(90, '5', 'Bft')
    const extent = windsockExtent(shape, pill)
    expect(extent.left).toBeLessThan(pill.x - pill.halfWidth)
    expect(extent.right).toBeGreaterThan(shape.axis.at(-1)![0])
  })
})

describe('sockRect (U111)', () => {
  it('omvat de omvang van zak en badge en het weggeveegde gat, in canvaspixels naar buiten afgerond', () => {
    const headings = Array.from({ length: WINDSOCK_SAMPLES + 1 }, (_, index) => 120 + index * 9)
    const shape = windsockShape(6, headings, 'kaart')
    const ratio = 3
    for (const style of ['pil', 'cirkel', 'onder'] as const) {
      const badge = sockBadge(shape, 120, '6', 'Bft', style, 13)
      const rect = sockRect(100.4, 200.7, shape, badge, ratio)
      const extent = windsockExtent(shape, badge)
      const hole = { left: badge.x - badge.halfWidth - badge.gap, right: badge.x + badge.halfWidth + badge.gap, top: badge.y - badge.halfHeight - badge.gap, bottom: badge.y + badge.halfHeight + badge.gap }
      for (const box of [extent, hole]) {
        expect((100.4 + box.left) * ratio).toBeGreaterThanOrEqual(rect.x)
        expect((100.4 + box.right) * ratio).toBeLessThanOrEqual(rect.x + rect.width)
        expect((200.7 + box.top) * ratio).toBeGreaterThanOrEqual(rect.y)
        expect((200.7 + box.bottom) * ratio).toBeLessThanOrEqual(rect.y + rect.height)
      }
      expect(Number.isInteger(rect.x) && Number.isInteger(rect.y) && Number.isInteger(rect.width) && Number.isInteger(rect.height)).toBe(true)
    }
  })
})
