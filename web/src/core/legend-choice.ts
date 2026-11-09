/**
 * Legenda (U107, PO 2026-11-09): op desktop altijd zichtbaar als vlakke strook, zonder knop; op de telefoon dicht tot
 * je de chip gebruikt, en die keuze wordt per apparaat bewaard. Wordt het venster na het laden breed of smal, dan volgt
 * hij de layout.
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
  return !phoneLayout || choice === 'open'
}

/** Telefoonchip (alleen `?dev&legendaknop=`, U107): `schaal` (standaard) een mini-kleurschaal, `woord` "Legenda". */
export const LEGEND_BUTTON_VARIANTS = ['schaal', 'woord'] as const
export type LegendButtonVariant = typeof LEGEND_BUTTON_VARIANTS[number]
export function legendButtonVariant(params: URLSearchParams): LegendButtonVariant {
  const value = params.get('legendaknop')
  return LEGEND_BUTTON_VARIANTS.includes(value as LegendButtonVariant) ? value as LegendButtonVariant : 'schaal'
}
