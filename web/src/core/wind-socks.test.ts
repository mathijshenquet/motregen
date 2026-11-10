import { describe, expect, it } from 'vitest'
import { DEFAULT_WINDSOCK_BADGE, WINDSOCK_SAMPLES, windsockBadge, windsockShape } from './wind-glyph'
import { sockRect } from './wind-socks'

describe('sockRect (U111)', () => {
  it('omvat zak en badge met marge, in canvaspixels naar buiten afgerond', () => {
    const headings = Array.from({ length: WINDSOCK_SAMPLES + 1 }, (_, index) => 120 + index * 9)
    const shape = windsockShape(6, headings, 'kaart')
    const badge = windsockBadge(shape, DEFAULT_WINDSOCK_BADGE, '6', 13)
    const ratio = 3
    const rect = sockRect(100.4, 200.7, shape, badge, ratio)
    for (const [x, y] of [...shape.left, ...shape.right, [badge.x - badge.radius, badge.y - badge.radius], [badge.x + badge.radius, badge.y + badge.radius]] as const) {
      // Dikste lijn plus schaduw reikt ~3 CSS-px voorbij de omtrek.
      expect((100.4 + x - 3) * ratio).toBeGreaterThanOrEqual(rect.x)
      expect((100.4 + x + 3) * ratio).toBeLessThanOrEqual(rect.x + rect.width)
      expect((200.7 + y - 3) * ratio).toBeGreaterThanOrEqual(rect.y)
      expect((200.7 + y + 3) * ratio).toBeLessThanOrEqual(rect.y + rect.height)
    }
    expect(Number.isInteger(rect.x) && Number.isInteger(rect.y) && Number.isInteger(rect.width) && Number.isInteger(rect.height)).toBe(true)
  })
})
