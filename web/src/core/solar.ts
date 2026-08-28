const radians = Math.PI / 180
const dayMilliseconds = 86_400_000

export interface SolarPosition {
  declination: number
  subsolarLongitude: number
  vector: [number, number, number]
}

export function solarPosition(epoch: number): SolarPosition {
  const daysSinceJ2000 = epoch / dayMilliseconds + 2_440_587.5 - 2_451_545
  const meanLongitude = normalize((280.460 + 0.9856474 * daysSinceJ2000) * radians)
  const meanAnomaly = normalize((357.528 + 0.9856003 * daysSinceJ2000) * radians)
  const eclipticLongitude = meanLongitude + 1.915 * radians * Math.sin(meanAnomaly) + 0.020 * radians * Math.sin(2 * meanAnomaly)
  const obliquity = (23.439 - 0.0000004 * daysSinceJ2000) * radians
  const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLongitude), Math.cos(eclipticLongitude))
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude))
  const siderealTime = normalize((280.46061837 + 360.98564736629 * daysSinceJ2000) * radians)
  const subsolarLongitude = signed(rightAscension - siderealTime)
  const cosDeclination = Math.cos(declination)
  return {
    declination,
    subsolarLongitude,
    vector: [
      cosDeclination * Math.cos(subsolarLongitude),
      cosDeclination * Math.sin(subsolarLongitude),
      Math.sin(declination),
    ],
  }
}

export function solarElevationSin(epoch: number, longitude: number, latitude: number): number {
  const { declination, subsolarLongitude } = solarPosition(epoch)
  const lat = latitude * radians
  const hourAngle = longitude * radians - subsolarLongitude
  return Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle)
}

function normalize(value: number): number {
  const fullTurn = Math.PI * 2
  return (value % fullTurn + fullTurn) % fullTurn
}

function signed(value: number): number {
  const normalized = normalize(value)
  return normalized > Math.PI ? normalized - Math.PI * 2 : normalized
}
