import type { EpochWindow } from './time-model'

/** Schermwaarheid per slot (MIP-19 §Meetkant): wat staat er op het scherm voor een tijdstip dat data verwacht. */
export type SlotState = 'loaded' | 'fog' | 'blank'

export interface VisibleSlot {
  epoch: number
  loaded: boolean
  /** Het scherm toont dit slot zichtbaar als "komt nog". */
  fogDrawn: boolean
}

export function slotState(slot: VisibleSlot): SlotState {
  if (slot.loaded) return 'loaded'
  return slot.fogDrawn ? 'fog' : 'blank'
}

/** Telt de slots binnen het zichtbare venster per staat; slots erbuiten doen niet mee. */
export function visibleSlotStates(slots: VisibleSlot[], window: EpochWindow): Record<SlotState, number> {
  const counts: Record<SlotState, number> = { loaded: 0, fog: 0, blank: 0 }
  for (const slot of slots) {
    if (slot.epoch < window.start || slot.epoch > window.end) continue
    counts[slotState(slot)]++
  }
  return counts
}
