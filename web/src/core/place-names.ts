import type { LayerSpecification, StyleSpecification, SymbolLayerSpecification } from 'maplibre-gl'
import type { OrderedPlace } from './map-places.js'
import { MAP_LABEL_GLYPH_SCALE } from './map-labels.js'

/**
 * U114 (MIP-43): plaatsnamen uit de plekkenorde in een eigen symboollaag, in de kleur van de stadsnamen van de
 * basiskaart, op de plek zelf; alleen waar geen getal de naam draagt (Lucht, Weer met `weergetal=isolijn`). De orde
 * houdt de plekken uit elkaar, dus MapLibre botst niets.
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
      'text-size': size * MAP_LABEL_GLYPH_SCALE, 'text-anchor': 'center',
      'text-allow-overlap': true, 'text-ignore-placement': true,
    },
    paint: city?.paint ?? {},
  }
}

interface PlaceNameFeature { type: 'Feature'; geometry: { type: 'Point'; coordinates: [number, number] }; properties: { name: string; order: number } }

// Structureel getypt: de bot typecheckt dit bestand ook, en daar is de globale GeoJSON-namespace er niet.
export function placeNamesData(places: readonly OrderedPlace[]): { type: 'FeatureCollection'; features: PlaceNameFeature[] } {
  return {
    type: 'FeatureCollection',
    features: places.filter((place) => !place.sea).map((place, order) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [place.lng, place.lat] }, properties: { name: place.name, order },
    })),
  }
}
