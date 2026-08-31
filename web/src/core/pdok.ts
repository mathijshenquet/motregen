const baseUrl = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/'

export interface PdokSuggestion {
  id: string
  label: string
  detail?: string
  type: string
}

interface PdokResponse {
  response?: {
    docs?: Array<{
      id?: string
      weergavenaam?: string
      type?: string
      centroide_ll?: string
    }>
  }
}

export async function suggestLocations(query: string, signal?: AbortSignal): Promise<PdokSuggestion[]> {
  const url = new URL('suggest', baseUrl)
  url.searchParams.set('q', query)
  url.searchParams.set('fq', 'type:(woonplaats OR wijk)')
  url.searchParams.set('rows', '5')
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Zoeken mislukt (${response.status})`)
  const data = await response.json() as PdokResponse
  return (data.response?.docs ?? []).slice(0, 5).flatMap((document) => {
    if (!document.id || !document.weergavenaam) return []
    const { label, detail } = conciseLocationLabel(document.weergavenaam)
    return [{ id: document.id, label, detail, type: document.type ?? 'locatie' }]
  })
}

export function conciseLocationLabel(value: string): { label: string; detail?: string } {
  const [label, ...context] = value.split(',').map((part) => part.trim()).filter(Boolean)
  return { label: label ?? value, detail: context.length ? context.join(' · ') : undefined }
}

export async function lookupLocation(id: string, signal?: AbortSignal): Promise<{ lng: number; lat: number }> {
  const url = new URL('lookup', baseUrl)
  url.searchParams.set('id', id)
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Locatie ophalen mislukt (${response.status})`)
  const data = await response.json() as PdokResponse
  const centroid = data.response?.docs?.[0]?.centroide_ll
  const point = centroid ? parseCentroid(centroid) : undefined
  if (!point) throw new Error('Deze locatie heeft geen bruikbaar middelpunt')
  return point
}

export function parseCentroid(value: string): { lng: number; lat: number } | undefined {
  const match = /^POINT\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/.exec(value)
  if (!match) return undefined
  const lng = Number(match[1]), lat = Number(match[2])
  return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : undefined
}
