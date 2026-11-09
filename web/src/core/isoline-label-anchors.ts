/** Minimale afstand tussen twee labels in CSS-px (Label-afstand, U8b; knop weg in U30). */
export const LABEL_MIN_DISTANCE_PX = 90
/** Afstand langs een lijn tussen kandidaat-ankers bij het spawnen (Label-spatiëring, U7/U30). */
export const LABEL_SPACING_PX = 260
export const MAX_LABEL_ANCHORS = 60

export function* lineLabelCandidates(points: ReadonlyArray<readonly [number, number]>, spacing: number): Generator<[number, number]> {
  let until = spacing / 2
  for (let index = 1; index < points.length; index++) {
    const [ax, ay] = points[index - 1]!, [bx, by] = points[index]!
    const length = Math.hypot(bx - ax, by - ay)
    while (until <= length) {
      const weight = until / length
      yield [ax + (bx - ax) * weight, ay + (by - ay) * weight]
      until += spacing
    }
    until -= length
  }
}

/**
 * ?dev-proef U100 (vervalt 2026-11-23): labelgrootte, afstand langs een lijn en puntlabels waar binnen `fill` px geen
 * lijnlabel staat (0 = uit). De standaard is het huidige beeld; de PO kiest uit een vergelijkingsblad.
 */
export interface LabelTuning {
  size: number
  spacing: number
  fill: number
}
export const DEFAULT_LABEL_TUNING: LabelTuning = { size: 11, spacing: LABEL_SPACING_PX, fill: 0 }
export const LABEL_TUNING_RANGES: Record<keyof LabelTuning, { min: number; max: number; step: number }> = {
  size: { min: 11, max: 16, step: 1 },
  spacing: { min: 140, max: 300, step: 10 },
  fill: { min: 0, max: 300, step: 10 },
}
/** Onder deze straal is een puntlabel zinloos dicht; de schuif springt van 0 (uit) naar hier. */
export const MIN_FILL_RADIUS_PX = 120
export const LABEL_TUNING_PARAMETERS: Record<keyof LabelTuning, string> = { size: 'labelgrootte', spacing: 'labelafstand', fill: 'labelvulling' }

export function clampLabelTuning(key: keyof LabelTuning, value: number): number {
  const { min, max } = LABEL_TUNING_RANGES[key]
  if (!Number.isFinite(value)) return DEFAULT_LABEL_TUNING[key]
  const clamped = Math.max(min, Math.min(max, Math.round(value)))
  return key === 'fill' && clamped > 0 && clamped < MIN_FILL_RADIUS_PX ? MIN_FILL_RADIUS_PX : clamped
}

/** URL (`?dev&labelgrootte=13`) gaat voor opslag; alles buiten de range wordt geklemd. */
export function loadLabelTuning(search: string, storage?: Pick<Storage, 'getItem'>, defaults: LabelTuning = DEFAULT_LABEL_TUNING): LabelTuning {
  const params = new URLSearchParams(search)
  const tuning = { ...defaults }
  for (const key of Object.keys(DEFAULT_LABEL_TUNING) as Array<keyof LabelTuning>) {
    let raw = params.get(LABEL_TUNING_PARAMETERS[key])
    if (raw === null) {
      try { raw = storage?.getItem(`motregen-dev-${LABEL_TUNING_PARAMETERS[key]}`) ?? null } catch { raw = null }
    }
    if (raw !== null && raw !== '') tuning[key] = clampLabelTuning(key, Number(raw))
  }
  return tuning
}

/** Kandidaten voor puntlabels: een vast rooster (in cellen) met maaswijdte `spacing`, zodat pannen ze niet laat verspringen. */
export function* pointLabelCandidates(view: { left: number; right: number; top: number; bottom: number }, spacing: number): Generator<[number, number]> {
  for (let row = Math.ceil(view.top / spacing) * spacing; row <= view.bottom; row += spacing) {
    // Om de rij een halve maas verschoven: een driehoeksrooster dekt gelijkmatiger dan een vierkant.
    const offset = Math.round(row / spacing) % 2 === 0 ? 0 : spacing / 2
    for (let column = Math.ceil((view.left - offset) / spacing) * spacing + offset; column <= view.right; column += spacing) yield [column, row]
  }
}
