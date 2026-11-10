import type { LayerSpecification, StyleSpecification, SymbolLayerSpecification } from 'maplibre-gl'
import type { OrderedPlace } from './map-places'

/**
 * U114 (`?dev&plekken=orde`, MIP-43): plaatsnamen uit de plekkenorde in een eigen symboollaag, in de stijl van de
 * stadsnamen van de basiskaart. De `label_`-prefix laat getallen en zakken ervoor wijken (MapLabelPlacer).
 */
export const PLACE_NAMES_LAYER = 'label_orde'

/** De `place`-lagen van de basiskaart (stad, dorp, provincie) uit: namen komen dan alleen uit de orde. */
export function withoutBasemapPlaceNames(style: StyleSpecification): StyleSpecification {
  return { ...style, layers: style.layers.map((layer) => isPlaceLabel(layer) ? { ...layer, layout: { ...layer.layout, visibility: 'none' } } as LayerSpecification : layer) }
}

function isPlaceLabel(layer: LayerSpecification): boolean {
  return layer.type === 'symbol' && 'source-layer' in layer && layer['source-layer'] === 'place'
}

export function placeNamesLayer(style: StyleSpecification): SymbolLayerSpecification {
  const city = style.layers.find((layer): layer is SymbolLayerSpecification => layer.id === 'label_city' && layer.type === 'symbol')
  const { 'text-field': _field, 'symbol-sort-key': _sort, visibility: _visibility, ...layout } = city?.layout ?? {}
  return {
    id: PLACE_NAMES_LAYER,
    type: 'symbol',
    source: PLACE_NAMES_LAYER,
    layout: { ...layout, 'text-field': ['get', 'name'], 'symbol-sort-key': ['get', 'order'] },
    paint: city?.paint ?? {},
  }
}

export function placeNamesData(places: readonly OrderedPlace[]): GeoJSON.FeatureCollection<GeoJSON.Point, { name: string; order: number }> {
  return {
    type: 'FeatureCollection',
    features: places.filter((place) => !place.sea).map((place, order) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [place.lng, place.lat] },
      properties: { name: place.name, order },
    })),
  }
}
