import { containView, MAP_CONTAIN_BOUNDS } from '../web/src/core/map-constraint.js'
import { FRAME } from './config.js'

export const NATIVE_VIEW = containView(MAP_CONTAIN_BOUNDS, FRAME)
