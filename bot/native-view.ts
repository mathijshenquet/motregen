import { containView } from '../web/src/core/map-constraint.js'
import { FRAME } from './config.js'

// PO: botkaarten passen Nederland; Vlaanderen bepaalt het kader niet meer.
export const NATIVE_VIEW = containView(
  { west: 3.35, south: 50.75, east: 7.23, north: 53.56 },
  { ...FRAME, insets: { top: 8, right: 8, bottom: 0, left: 8 } },
)
