import type { StyleSpecification } from 'maplibre-gl'

export type MapTheme = 'light' | 'dark'

const styleUrls: Record<MapTheme, string> = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
}

const cache = new Map<MapTheme, Promise<StyleSpecification>>()

export function loadBasemapStyle(theme: MapTheme): Promise<StyleSpecification> {
  let pending = cache.get(theme)
  if (!pending) {
    pending = fetch(styleUrls[theme])
      .then((response) => {
        if (!response.ok) throw new Error(`Kaartstijl laden mislukt (${response.status})`)
        return response.json() as Promise<StyleSpecification>
      })
      .then(withoutRoads)
      .catch((error) => {
        cache.delete(theme)
        throw error
      })
    cache.set(theme, pending)
  }
  return pending
}

export function withoutRoads(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers.filter((layer) => {
      const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : undefined
      return sourceLayer !== 'transportation' && sourceLayer !== 'transportation_name'
    }),
  }
}
