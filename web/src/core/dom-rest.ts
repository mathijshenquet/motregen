/**
 * `?dev&domrust=uit` (U111 ronde 4, vervalt 2026-11-24): het oude per-frame-werk in DOM en layout terug, om op de
 * telefoon te vergelijken. Standaard rust: geen nieuwe elementen per frame, geen layoutflush uit het tekenpad.
 */
function readDomRest(): boolean {
  if (typeof location === 'undefined') return true
  const params = new URLSearchParams(location.search)
  return !(params.has('dev') && params.get('domrust') === 'uit')
}

export const domRest = readDomRest()
