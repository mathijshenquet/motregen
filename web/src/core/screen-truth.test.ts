import { describe, expect, it } from 'vitest'
import { slotState, visibleSlotStates } from './screen-truth'

describe('schermwaarheid per slot', () => {
  it('noemt een slot geladen zodra de waarde er is, ook als er fog getekend wordt', () => {
    expect(slotState({ epoch: 0, loaded: true, fogDrawn: true })).toBe('loaded')
  })

  it('onderscheidt zichtbaar "komt nog" van leeg', () => {
    expect(slotState({ epoch: 0, loaded: false, fogDrawn: true })).toBe('fog')
    expect(slotState({ epoch: 0, loaded: false, fogDrawn: false })).toBe('blank')
  })

  it('telt alleen slots binnen het zichtbare venster, grenzen inbegrepen', () => {
    const slots = [
      { epoch: 0, loaded: false, fogDrawn: false },
      { epoch: 10, loaded: true, fogDrawn: false },
      { epoch: 20, loaded: false, fogDrawn: true },
      { epoch: 30, loaded: false, fogDrawn: false },
      { epoch: 40, loaded: false, fogDrawn: false },
    ]
    expect(visibleSlotStates(slots, { start: 10, end: 30 })).toEqual({ loaded: 1, fog: 1, blank: 1 })
  })
})
