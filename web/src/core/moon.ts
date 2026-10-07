// Maanfase voor de nachtcel van de UV-kolom (PO 2026-09-25 live, U34): gemiddelde synodische maand
// vanaf een bekende nieuwe maan; de afwijking van de echte fase is hooguit ~half dag, ruim genoeg voor
// een icoon en een percentage.
const SYNODIC_MONTH_DAYS = 29.530588853
// Nieuwe maan 2000-01-06 18:14 UTC (Meeus, hfst. 49).
const REFERENCE_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14)
const DAY_MS = 86_400_000
const RADIANS = Math.PI / 180
const J1970 = 2_440_587.5
const J2000 = 2_451_545
const OBLIQUITY = 23.4397 * RADIANS

export interface MoonPhase {
  /** 0 = nieuwe maan, 0,5 = volle maan, oplopend naar 1. */
  phase: number
  /** Verlicht deel van de schijf, 0–1. */
  illumination: number
  waxing: boolean
  label: string
}

export function moonPhase(epoch: number): MoonPhase {
  const cycles = (epoch - REFERENCE_NEW_MOON) / DAY_MS / SYNODIC_MONTH_DAYS
  const phase = cycles - Math.floor(cycles)
  const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2
  const waxing = phase < 0.5
  const label = illumination < 0.03 ? 'nieuwe maan' : illumination > 0.97 ? 'volle maan' : `${waxing ? 'wassende' : 'afnemende'} maan`
  return { phase, illumination, waxing, label }
}

/**
 * SVG-pad van het verlichte deel op een schijf (cx, cy, r), zoals vanaf het noordelijk halfrond:
 * wassend rechts verlicht, afnemend links. De terminator is een halve ellips met straal r·|cos|.
 */
export function moonLitPath(phase: number, cx: number, cy: number, r: number): string {
  const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2
  if (illumination < 0.005) return ''
  const waxing = phase < 0.5
  const terminator = r * Math.abs(Math.cos(2 * Math.PI * phase))
  const outerSweep = waxing ? 1 : 0
  // Minder dan half verlicht: de terminator buigt naar de verlichte kant; meer dan half: ervan af.
  const innerSweep = (illumination < 0.5) === waxing ? 0 : 1
  const top = `${cx} ${cy - r}`
  const bottom = `${cx} ${cy + r}`
  return `M${top}A${r} ${r} 0 0 ${outerSweep} ${bottom}A${terminator.toFixed(3)} ${r} 0 0 ${innerSweep} ${top}Z`
}

export interface MoonEvent {
  epoch: number
  kind: 'rise' | 'set'
}

/** Lage-precisie maanpositie (Meeus): ruim nauwkeurig genoeg voor de minuutweergave in de tabel. */
function apparentMoonAltitude(epoch: number, longitude: number, latitude: number): number {
  const days = epoch / DAY_MS + J1970 - J2000
  const meanLongitude = (218.316 + 13.176396 * days) * RADIANS
  const meanAnomaly = (134.963 + 13.064993 * days) * RADIANS
  const argumentOfLatitude = (93.272 + 13.229350 * days) * RADIANS
  const eclipticLongitude = meanLongitude + 6.289 * RADIANS * Math.sin(meanAnomaly)
  const eclipticLatitude = 5.128 * RADIANS * Math.sin(argumentOfLatitude)
  const rightAscension = Math.atan2(
    Math.sin(eclipticLongitude) * Math.cos(OBLIQUITY) - Math.tan(eclipticLatitude) * Math.sin(OBLIQUITY),
    Math.cos(eclipticLongitude),
  )
  const declination = Math.asin(
    Math.sin(eclipticLatitude) * Math.cos(OBLIQUITY) +
    Math.cos(eclipticLatitude) * Math.sin(OBLIQUITY) * Math.sin(eclipticLongitude),
  )
  const hourAngle = (280.16 + 360.9856235 * days + longitude) * RADIANS - rightAscension
  const observerLatitude = latitude * RADIANS
  const altitude = Math.asin(
    Math.sin(observerLatitude) * Math.sin(declination) +
    Math.cos(observerLatitude) * Math.cos(declination) * Math.cos(hourAngle),
  )
  const refractionAltitude = Math.max(0, altitude)
  const refraction = 0.0002967 / Math.tan(refractionAltitude + 0.00312536 / (refractionAltitude + 0.08901179))
  return altitude + refraction
}

/** Maanopkomst/-ondergang tussen twee epochs; 0,133° is de gebruikelijke schijnbare horizon. */
export function moonEvents(start: number, end: number, longitude: number, latitude: number): MoonEvent[] {
  const step = 10 * 60_000
  const above = (epoch: number) => apparentMoonAltitude(epoch, longitude, latitude) > 0.133 * RADIANS
  const events: MoonEvent[] = []
  let previous = start
  let previousAbove = above(start)
  for (let epoch = Math.min(end, start + step); epoch <= end; epoch = epoch === end ? end + 1 : Math.min(end, epoch + step)) {
    const currentAbove = above(epoch)
    if (currentAbove !== previousAbove) {
      let low = previous
      let high = epoch
      while (high - low > 1_000) {
        const middle = (low + high) / 2
        if (above(middle) === previousAbove) low = middle
        else high = middle
      }
      events.push({ epoch: Math.round(high), kind: currentAbove ? 'rise' : 'set' })
    }
    previous = epoch
    previousAbove = currentAbove
  }
  return events
}
