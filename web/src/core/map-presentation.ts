export const MAP_FOCUS_SATURATION = 0.55
export const TEMPERATURE_LINE_OPACITY = 0.4
export const ISOBAR_LINE_OPACITY = 0.27

export function isolineWidthCss(zoom: number): number {
  return zoom <= 5 ? 0.9 : zoom >= 9 ? 1.4 : 0.9 + (zoom - 5) * 0.125
}

/**
 * Capsuleprofiel voor een lijn van `width` doelpixels. Onder 1 px verliest dat profiel zijn
 * behoud van dekking over subpixelposities (bij 0,65 px: 0,83 op een pixelmidden, 0,65
 * ertussen), dus bewegende lijnen flikkeren; daarom minimaal 1 px en de rest als lagere alpha.
 */
export function lineProfile(width: number): { halfWidth: number; alpha: number } {
  return width >= 1 ? { halfWidth: width / 2, alpha: 1 } : { halfWidth: 0.5, alpha: Math.max(0, width) }
}
