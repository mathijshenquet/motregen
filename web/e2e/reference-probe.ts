export interface ReferenceEvent {
  kind: 'document' | 'radar-frame' | 'time-label'
  /** Wandkloktijd: de toestemmingsstroom wisselt van document, dus performance.now() begint steeds opnieuw. */
  wallMs: number
  value: string
  /** Radarbeeld: ligt er iets anders dan de kaart bovenop (toestemmingsmuur), dan ziet de bezoeker het niet. */
  covered?: boolean
}

declare global {
  interface Window { __referenceEvent?: (event: ReferenceEvent) => void }
}

/**
 * Volgt op een vreemde radarsite welk radarbeeld zichtbaar is. Een wissel van dat beeld is het
 * bewijs dat de animatie loopt; het tijdlabel dient als tweede, onafhankelijke getuige.
 */
export function installReferenceProbe(selectors: { radarImage: string; mapContainer: string; timeLabel: string }): void {
  if (window.top !== window) return
  const report = (kind: ReferenceEvent['kind'], value: string, covered?: boolean) => window.__referenceEvent?.({ kind, wallMs: Date.now(), value, covered })
  report('document', location.href)
  let shownFrame = ''
  let shownCovered = false
  let shownLabel = ''
  const sample = () => {
    const visibleFrames: string[] = []
    let covered = false
    for (const image of Array.from(document.querySelectorAll<HTMLImageElement>(selectors.radarImage))) {
      if (!image.complete || image.naturalWidth === 0) continue
      const box = image.getBoundingClientRect()
      const style = getComputedStyle(image)
      if (box.width === 0 || box.height === 0 || style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) <= 0.01) continue
      visibleFrames.push(image.currentSrc || image.src)
      const mapBox = image.closest(selectors.mapContainer)?.getBoundingClientRect()
      if (!mapBox) continue
      const topmost = document.elementFromPoint(mapBox.left + mapBox.width / 2, mapBox.top + mapBox.height / 2)
      if (!topmost?.closest(selectors.mapContainer)) covered = true
    }
    const frame = visibleFrames.join(' | ')
    if (frame && (frame !== shownFrame || covered !== shownCovered)) {
      shownFrame = frame
      shownCovered = covered
      report('radar-frame', frame, covered)
    }
    const label = document.querySelector<HTMLElement>(selectors.timeLabel)?.innerText.trim() ?? ''
    if (label && label !== shownLabel) {
      shownLabel = label
      report('time-label', label)
    }
  }
  const start = () => {
    new MutationObserver(sample).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'style', 'class'], characterData: true })
    setInterval(sample, 50)
  }
  if (document.documentElement) start()
  else document.addEventListener('DOMContentLoaded', start, { once: true })
}
