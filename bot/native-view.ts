import { containView } from '../web/src/core/map-constraint.js'
import { ISOLINE_TOLERANCE_PX } from '../web/src/core/isolines.js'
import { ELEMENT_SCALE, FRAME } from './config.js'

// PO: botkaarten passen Nederland; Vlaanderen bepaalt het kader niet meer. De marge is 12 uitvoerpixels, onafhankelijk van ELEMENT_SCALE.
const MARGIN = 8 / ELEMENT_SCALE
export const NATIVE_VIEW = containView(
  { west: 3.35, south: 50.75, east: 7.23, north: 53.56 },
  { ...FRAME, insets: { top: MARGIN, right: MARGIN, bottom: 0, left: MARGIN } },
)

/** De zoom waarop zoomafhankelijke elementmaten (isolijndikte) zijn afgesteld: de kaart zelf staat ELEMENT_SCALE lager. */
export const ELEMENT_ZOOM = NATIVE_VIEW.zoom + Math.log2(ELEMENT_SCALE)

/** Isolijntolerantie in CSS-px van FRAME: in uitvoerpixels gelijk aan die bij BASE_FRAME_SCALE, zodat dikkere lijnen niet grover worden. */
export function isolineTolerancePx(): number {
  return ISOLINE_TOLERANCE_PX / ELEMENT_SCALE
}
