// Een tik op de backdrop van een modale dialog sluit hem en mag niets doorgeven
// aan de kaart eronder (geen pan, klik of locatiekeuze).
export function backdropHandlers(dialog: () => HTMLDialogElement) {
  const swallow = (event: Event): boolean => {
    if (event.target !== dialog()) return false
    event.preventDefault()
    event.stopPropagation()
    return true
  }
  return {
    onPointerDown: swallow,
    onClick: (event: MouseEvent) => { if (swallow(event)) dialog().close() },
  }
}
