import type { LayerSpecification, StyleSpecification, SymbolLayerSpecification } from 'maplibre-gl'
import { placeSide, type OrderedPlace } from './map-places'
import { sockNameOffset } from './place-footprint'

/**
 * U114 (`?dev&plekken=orde`, MIP-43): plaatsnamen uit de plekkenorde in een eigen symboollaag, in de kleur van de
 * stadsnamen van de basiskaart, vast aan de kant van hun plek (place-footprint). De orde houdt de plekken uit elkaar,
 * dus MapLibre botst niets.
 */
export const PLACE_NAMES_LAYER = 'label_orde'
/**
 * Botsmarge rond een naam. De basiskaart gebruikt 24/18/14/4 px om zelf te dunnen; de orde is al dun, en met die
 * marge vielen de Weer-getallen naast hun naam weg.
 */
export const PLACE_NAMES_PADDING_PX = 2

/** De `place`-lagen van de basiskaart (stad, dorp, provincie) uit: namen komen dan alleen uit de orde. */
export function withoutBasemapPlaceNames(style: StyleSpecification): StyleSpecification {
  return { ...style, layers: style.layers.map((layer) => isPlaceLabel(layer) ? { ...layer, layout: { ...layer.layout, visibility: 'none' } } as LayerSpecification : layer) }
}

function isPlaceLabel(layer: LayerSpecification): boolean {
  return layer.type === 'symbol' && 'source-layer' in layer && layer['source-layer'] === 'place'
}

export function placeNamesLayer(style: StyleSpecification, size: number): SymbolLayerSpecification {
  const city = style.layers.find((layer): layer is SymbolLayerSpecification => layer.id === 'label_city' && layer.type === 'symbol')
  const {
    'text-field': _field, 'symbol-sort-key': _sort, visibility: _visibility, 'text-variable-anchor': _anchors, 'text-radial-offset': _radial,
    'text-anchor': _anchor, 'text-offset': _offset, 'text-justify': _justify, 'text-size': _size, ...layout
  } = city?.layout ?? {}
  return {
    id: PLACE_NAMES_LAYER,
    type: 'symbol',
    source: PLACE_NAMES_LAYER,
    layout: {
      ...layout, 'text-field': ['get', 'name'], 'symbol-sort-key': ['get', 'order'], 'text-padding': PLACE_NAMES_PADDING_PX,
      'text-size': Math.round(size * 0.85), 'text-anchor': 'center', 'text-offset': ['get', 'offset'],
      'text-allow-overlap': true, 'text-ignore-placement': true,
    },
    paint: city?.paint ?? {},
  }
}

/** `offset` in em van de naamgrootte: hetzelfde middelpunt als de naam onder (of naast) een zak. */
export function placeNamesData(places: readonly OrderedPlace[], size: number): GeoJSON.FeatureCollection<GeoJSON.Point, { name: string; order: number; offset: [number, number] }> {
  const em = Math.round(size * 0.85)
  return {
    type: 'FeatureCollection',
    features: places.filter((place) => !place.sea).map((place, order) => {
      const [dx, dy] = sockNameOffset(placeSide(place), place.name, size)
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [place.lng, place.lat] }, properties: { name: place.name, order, offset: [dx / em, dy / em] } }
    }),
  }
}
