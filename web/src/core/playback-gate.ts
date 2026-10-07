/** Afspeelrichting in frames: vooruit of terug. */
export type PlaybackDirection = 1 | -1

export interface PlaybackReach {
  /**
   * Verste cursorpositie (frame-index, mag gebroken zijn) die afspelen nu mag halen: het laatste
   * frame van de aaneengesloten geladen reeks vanaf de cursor.
   */
  limit: number
  /** Het frame waarop afspelen bij `limit` wacht; null als de reeks tot het eind van de tijdlijn doorloopt. */
  waitingFor: number | null
}

/**
 * De speelregel van MIP-19 §De lat: spelen mag zodra het frame op de cursor en het volgende frame
 * in afspeelrichting er zijn, en loopt door tot het eerste frame dat ontbreekt. Daar wacht de
 * cursor zichtbaar op precies dat frame in plaats van onzichtbaar te pauzeren.
 *
 * Het kaartbeeld mengt de twee frames rond de cursor. Zonder geladen frame aan de vertrekkant
 * valt er niets te tonen: dan is `limit` de cursor zelf en `waitingFor` dat frame.
 */
export function playbackReach(cursor: number, direction: PlaybackDirection, frameCount: number, present: (index: number) => boolean): PlaybackReach {
  if (frameCount <= 0) return { limit: cursor, waitingFor: null }
  const lastIndex = frameCount - 1
  const clamped = Math.min(lastIndex, Math.max(0, cursor))
  const departure = direction === 1 ? Math.floor(clamped) : Math.ceil(clamped)
  if (!present(departure)) return { limit: clamped, waitingFor: departure }
  let reached = departure
  while (reached + direction >= 0 && reached + direction <= lastIndex && present(reached + direction)) reached += direction
  const next = reached + direction
  const atEnd = next < 0 || next > lastIndex
  // Tussen twee geladen frames staat de cursor al voorbij `reached`; hij hoeft niet terug.
  const limit = direction === 1 ? Math.max(clamped, reached) : Math.min(clamped, reached)
  return { limit, waitingFor: atEnd ? null : next }
}

/** Of afspelen vanaf de cursor nu één frame verder kan: cursorframe én het volgende zijn er. */
export function canPlay(cursor: number, direction: PlaybackDirection, frameCount: number, present: (index: number) => boolean): boolean {
  const reach = playbackReach(cursor, direction, frameCount, present)
  return direction === 1 ? reach.limit > cursor || reach.waitingFor === null : reach.limit < cursor || reach.waitingFor === null
}

/** Zet een gewenste volgende cursorpositie terug op wat afspelen nu mag halen. */
export function clampPlaybackCursor(wanted: number, reach: PlaybackReach, direction: PlaybackDirection): number {
  return direction === 1 ? Math.min(wanted, reach.limit) : Math.max(wanted, reach.limit)
}
