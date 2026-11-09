/**
 * Legenda open of dicht (U107, PO 2026-11-09): zonder eigen keuze volgt hij de layout — open naast het zijpaneel
 * (desktop), dicht op de telefoon — en blijft hij die volgen als het venster pas na het laden breed wordt. Een klik
 * op de knop is een keuze voor dit apparaat en wordt bewaard.
 */
export const LEGEND_STORAGE_KEY = 'motregen-legend'
/** Dezelfde grens als de telefoonlayout in styles.css (max-width: 959px). */
export const PHONE_LAYOUT_QUERY = '(max-width: 959px)'

export type LegendChoice = 'open' | 'dicht'

export function readLegendChoice(storage: Pick<Storage, 'getItem'> | undefined): LegendChoice | undefined {
  try {
    const value = storage?.getItem(LEGEND_STORAGE_KEY)
    return value === 'open' || value === 'dicht' ? value : undefined
  } catch {
    return undefined
  }
}

export function storeLegendChoice(storage: Pick<Storage, 'setItem'> | undefined, choice: LegendChoice): void {
  try {
    storage?.setItem(LEGEND_STORAGE_KEY, choice)
  } catch {
    // Geen opslag (privévenster, vol): de keuze geldt dan alleen voor deze sessie.
  }
}

export function legendIsOpen(choice: LegendChoice | undefined, phoneLayout: boolean): boolean {
  return choice ? choice === 'open' : !phoneLayout
}
