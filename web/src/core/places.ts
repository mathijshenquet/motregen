export interface Place {
  name: string
  lng: number
  lat: number
}

export const places: readonly Place[] = [
  { name: 'Alkmaar', lng: 4.75, lat: 52.63 },
  { name: 'Almere', lng: 5.22, lat: 52.37 },
  { name: 'Amersfoort', lng: 5.39, lat: 52.16 },
  { name: 'Amsterdam', lng: 4.9, lat: 52.37 },
  { name: 'Apeldoorn', lng: 5.97, lat: 52.21 },
  { name: 'Arnhem', lng: 5.91, lat: 51.98 },
  { name: 'Assen', lng: 6.56, lat: 52.99 },
  { name: 'Bergen op Zoom', lng: 4.29, lat: 51.5 },
  { name: 'Breda', lng: 4.78, lat: 51.59 },
  { name: 'Delft', lng: 4.36, lat: 52.01 },
  { name: 'Den Bosch', lng: 5.3, lat: 51.69 },
  { name: 'Den Haag', lng: 4.3, lat: 52.08 },
  { name: 'Den Helder', lng: 4.76, lat: 52.96 },
  { name: 'Deventer', lng: 6.16, lat: 52.25 },
  { name: 'Doetinchem', lng: 6.29, lat: 51.97 },
  { name: 'Dordrecht', lng: 4.67, lat: 51.81 },
  { name: 'Ede', lng: 5.66, lat: 52.04 },
  { name: 'Eindhoven', lng: 5.48, lat: 51.44 },
  { name: 'Emmen', lng: 6.9, lat: 52.79 },
  { name: 'Enschede', lng: 6.9, lat: 52.22 },
  { name: 'Goes', lng: 3.89, lat: 51.5 },
  { name: 'Gouda', lng: 4.71, lat: 52.01 },
  { name: 'Groningen', lng: 6.57, lat: 53.22 },
  { name: 'Haarlem', lng: 4.64, lat: 52.38 },
  { name: 'Harderwijk', lng: 5.62, lat: 52.35 },
  { name: 'Heerenveen', lng: 5.92, lat: 52.96 },
  { name: 'Heerlen', lng: 5.98, lat: 50.89 },
  { name: 'Helmond', lng: 5.66, lat: 51.48 },
  { name: 'Hilversum', lng: 5.18, lat: 52.23 },
  { name: 'Hoorn', lng: 5.06, lat: 52.64 },
  { name: 'Leeuwarden', lng: 5.8, lat: 53.2 },
  { name: 'Leiden', lng: 4.49, lat: 52.16 },
  { name: 'Lelystad', lng: 5.47, lat: 52.52 },
  { name: 'Maastricht', lng: 5.69, lat: 50.85 },
  { name: 'Meppel', lng: 6.2, lat: 52.7 },
  { name: 'Middelburg', lng: 3.61, lat: 51.5 },
  { name: 'Nijmegen', lng: 5.86, lat: 51.84 },
  { name: 'Roermond', lng: 5.99, lat: 51.19 },
  { name: 'Roosendaal', lng: 4.46, lat: 51.53 },
  { name: 'Rotterdam', lng: 4.48, lat: 51.92 },
  { name: 'Sneek', lng: 5.66, lat: 53.03 },
  { name: 'Terneuzen', lng: 3.83, lat: 51.34 },
  { name: 'Tilburg', lng: 5.09, lat: 51.56 },
  { name: 'Utrecht', lng: 5.12, lat: 52.09 },
  { name: 'Venlo', lng: 6.17, lat: 51.37 },
  { name: 'Vlissingen', lng: 3.57, lat: 51.45 },
  { name: 'Wageningen', lng: 5.66, lat: 51.97 },
  { name: 'Weert', lng: 5.71, lat: 51.25 },
  { name: 'Zaandam', lng: 4.83, lat: 52.44 },
  { name: 'Zeist', lng: 5.24, lat: 52.09 },
  { name: 'Zoetermeer', lng: 4.49, lat: 52.06 },
  { name: 'Zutphen', lng: 6.2, lat: 52.14 },
  { name: 'Zwolle', lng: 6.09, lat: 52.52 },
]

export function nearestPlace(lng: number, lat: number, candidates: readonly Place[] = places): Place {
  if (!candidates.length) throw new Error('Plaatsenlijst is leeg')
  const latitude = lat * Math.PI / 180
  let nearest = candidates[0]!
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    const dx = (candidate.lng - lng) * Math.cos((candidate.lat * Math.PI / 180 + latitude) / 2)
    const dy = candidate.lat - lat
    const distance = dx * dx + dy * dy
    if (distance < nearestDistance) {
      nearest = candidate
      nearestDistance = distance
    }
  }
  return nearest
}
