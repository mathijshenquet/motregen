import type { LngLat, Map as MapLibreMap, Marker } from 'maplibre-gl'
import type { Viewport } from './map-constraint'

export interface Vector {
  x: number
  y: number
}

export const PIN_EDGE_MARGIN = 48
// Stilhouden in de rand pant nog door, sneller naarmate de pin dieper in de rand zit.
const dwellSpeedPerPx = 12
const tapSlop = 6
const doubleTapMs = 350
const doubleTapDistance = 24
const velocityStaleMs = 60

/**
 * Pan-snelheid (px/s, kaartcamera) voor een versleepte pin op `tip` (px in het kaartvlak).
 * Buiten de randmarge staat de kaart stil. Erbinnen volgt de kaart met de sleepsnelheid
 * richting de rand, en minstens met een dwell-snelheid evenredig aan de diepte.
 */
export function edgePanVelocity(tip: Vector, viewport: Viewport, dragVelocity: Vector = { x: 0, y: 0 }, margin = PIN_EDGE_MARGIN): Vector {
  const { top = 0, right = 0, bottom = 0, left = 0 } = viewport.insets ?? {}
  return {
    x: axisVelocity(tip.x, left, viewport.width - right, margin, dragVelocity.x),
    y: axisVelocity(tip.y, top, viewport.height - bottom, margin, dragVelocity.y),
  }
}

function axisVelocity(position: number, low: number, high: number, margin: number, dragSpeed: number): number {
  const lowDepth = Math.min(margin, low + margin - position)
  const highDepth = Math.min(margin, position - (high - margin))
  if (lowDepth > 0 && lowDepth >= highDepth) return -Math.max(lowDepth * dwellSpeedPerPx, -dragSpeed)
  if (highDepth > 0) return Math.max(highDepth * dwellSpeedPerPx, dragSpeed)
  return 0
}

export interface PinNavigationOptions {
  map: MapLibreMap
  marker: Marker
  viewport: () => Viewport
  onDrop: (lngLat: LngLat) => void
  onDoubleTap?: () => void
}

/** Pin slepen (met edge-scroll) en dubbeltik-centreren; MapLibre's eigen handlers zien de pin niet. */
export function attachPinNavigation({ map, marker, viewport, onDrop, onDoubleTap }: PinNavigationOptions): () => void {
  const element = marker.getElement()
  element.classList.add('location-pin')
  let drag: {
    pointerId: number
    start: Vector
    grab: Vector
    tip: Vector
    velocity: Vector
    lastMove: number
    moved: boolean
    frame?: number
    lastFrame?: number
  } | undefined
  let lastTap: { time: number; point: Vector } | undefined

  const localPoint = (event: PointerEvent): Vector => {
    const box = map.getContainer().getBoundingClientRect()
    return { x: event.clientX - box.left, y: event.clientY - box.top }
  }

  const placePin = (tip: Vector) => marker.setLngLat(map.unproject([tip.x, tip.y]))

  const step = (time: number) => {
    if (!drag) return
    const dt = drag.lastFrame === undefined ? 0 : Math.min(0.05, (time - drag.lastFrame) / 1000)
    drag.lastFrame = time
    if (performance.now() - drag.lastMove > velocityStaleMs) drag.velocity = { x: 0, y: 0 }
    const pan = edgePanVelocity(drag.tip, viewport(), drag.velocity)
    if ((pan.x || pan.y) && dt > 0) {
      map.panBy([pan.x * dt, pan.y * dt], { duration: 0 })
      placePin(drag.tip)
    }
    drag.frame = requestAnimationFrame(step)
  }

  const finish = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return
    const ended = drag
    drag = undefined
    if (ended.frame !== undefined) cancelAnimationFrame(ended.frame)
    element.classList.remove('dragging')
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
    if (ended.moved) {
      lastTap = undefined
      onDrop(marker.getLngLat())
      return
    }
    if (event.type === 'pointercancel') return
    const now = performance.now()
    const point = localPoint(event)
    if (lastTap && now - lastTap.time < doubleTapMs && distance(point, lastTap.point) < doubleTapDistance) {
      lastTap = undefined
      map.easeTo({ center: marker.getLngLat(), duration: 450 })
      onDoubleTap?.()
    } else {
      lastTap = { time: now, point }
    }
  }

  const listeners: Array<[string, (event: never) => void]> = [
    ['pointerdown', (event: PointerEvent) => {
      if (event.button !== 0 || drag) return
      event.stopPropagation()
      event.preventDefault()
      element.setPointerCapture(event.pointerId)
      const start = localPoint(event)
      const anchor = map.project(marker.getLngLat())
      drag = {
        pointerId: event.pointerId,
        start,
        grab: { x: start.x - anchor.x, y: start.y - anchor.y },
        tip: { x: anchor.x, y: anchor.y },
        velocity: { x: 0, y: 0 },
        lastMove: performance.now(),
        moved: false,
      }
    }],
    ['pointermove', (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      const point = localPoint(event)
      if (!drag.moved) {
        if (distance(point, drag.start) < tapSlop) return
        drag.moved = true
        element.classList.add('dragging')
        drag.frame = requestAnimationFrame(step)
      }
      const now = performance.now()
      const tip = { x: point.x - drag.grab.x, y: point.y - drag.grab.y }
      const dt = Math.max(1, now - drag.lastMove) / 1000
      drag.velocity = { x: (tip.x - drag.tip.x) / dt, y: (tip.y - drag.tip.y) / dt }
      drag.lastMove = now
      drag.tip = tip
      placePin(tip)
    }],
    ['pointerup', finish],
    ['pointercancel', finish],
  ]
  // Mouse-/touch-compat-events en kliks van de pin niet naar de kaart: geen pan, geen pick, geen dblclick-zoom.
  for (const type of ['mousedown', 'touchstart', 'touchmove', 'touchend', 'touchcancel', 'click', 'dblclick']) {
    listeners.push([type, (event: Event) => event.stopPropagation()])
  }
  for (const [type, listener] of listeners) element.addEventListener(type, listener as EventListener)
  return () => {
    if (drag?.frame !== undefined) cancelAnimationFrame(drag.frame)
    drag = undefined
    for (const [type, listener] of listeners) element.removeEventListener(type, listener as EventListener)
  }
}

/** Alleen pan en zoom: geen rotatie of tilt, langs geen enkel gebaar. */
export const PAN_ZOOM_ONLY = { dragRotate: false, touchPitch: false, pitchWithRotate: false, maxPitch: 0, bearing: 0, pitch: 0 } as const

/** Op touch pant één vinger niet (de pagina scrolt), twee vingers en pinch wel. */
export function restrictMapGestures(map: MapLibreMap, coarsePointer: boolean): void {
  map.keyboard.disableRotation()
  map.touchZoomRotate.disableRotation()
  if (coarsePointer) map.cooperativeGestures.enable()
}

function distance(a: Vector, b: Vector): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
