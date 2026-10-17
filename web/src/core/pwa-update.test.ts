import { describe, expect, it, vi } from 'vitest'
import { applyUpdateWhenSafe, FRESH_START_MS, type UpdatePage } from './pwa-update'

function page(overrides: Partial<UpdatePage> = {}): UpdatePage & { hide: () => void } {
  let hiddenListener: (() => void) | undefined
  return {
    now: () => FRESH_START_MS + 1,
    hidden: () => false,
    touched: () => false,
    onHidden: (listener) => { hiddenListener = listener },
    hide: () => hiddenListener?.(),
    ...overrides,
  }
}

describe('applyUpdateWhenSafe', () => {
  it('updates at once on a fresh, untouched page, so a new session never runs the old version', () => {
    const apply = vi.fn()
    applyUpdateWhenSafe(apply, page({ now: () => 2_000 }))
    expect(apply).toHaveBeenCalledOnce()
  })

  it('waits for the background once someone is using the page', () => {
    const apply = vi.fn()
    const busy = page({ now: () => 2_000, touched: () => true })
    applyUpdateWhenSafe(apply, busy)
    expect(apply).not.toHaveBeenCalled()
    busy.hide()
    expect(apply).toHaveBeenCalledOnce()
  })

  it('waits for the background on a page that has been open a while, even untouched', () => {
    const apply = vi.fn()
    const open = page()
    applyUpdateWhenSafe(apply, open)
    expect(apply).not.toHaveBeenCalled()
    open.hide()
    expect(apply).toHaveBeenCalledOnce()
  })

  it('updates at once when the update arrives while the page is already in the background', () => {
    const apply = vi.fn()
    applyUpdateWhenSafe(apply, page({ hidden: () => true, touched: () => true }))
    expect(apply).toHaveBeenCalledOnce()
  })
})
