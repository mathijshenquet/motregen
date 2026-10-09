import { solarElevationSin } from './solar.js'

export const DEFAULT_LOCATION = { lng: 5.18, lat: 52.1, label: 'De Bilt' } as const

export function stillMapTheme(epoch: number): 'light' | 'dark' {
  return solarElevationSin(epoch, DEFAULT_LOCATION.lng, DEFAULT_LOCATION.lat) <= 0 ? 'dark' : 'light'
}
