import type { GeoJSONSource, Map as MapLibreMap, SymbolLayerSpecification } from 'maplibre-gl'
import { chromeBoxes, pinBox, type Box } from './map-label-placement'

export const LABEL_COLLISION_LAYER = 'motregen-label-collision'

/**
 * De uitwijkregel van het kaartregime (U107) voor MapLibre-labels (stadstemperaturen in Weer en Lucht): de pin en de
 * bediening staan als onzichtbare symbolen in de botsingsindex, net boven de temperatuurlaag, zodat MapLibre de
 * temperaturen ervoor laat wijken zoals voor de plaatsnamen. Bijgewerkt na elke beweging en als de pin verplaatst.
 */
export class MapLabelCollision {
  private key = ''

  constructor(private readonly map: MapLibreMap, private readonly pin: () => { lng: number; lat: number } | undefined) {}

  /** Bron en laag (opnieuw) toevoegen, bijv. na een stijlwissel; `beforeId`: de eerste plaatsnamenlaag. */
  attach(beforeId: string | undefined): void {
    if (this.map.getLayer(LABEL_COLLISION_LAYER)) return
    this.key = ''
    this.map.addSource(LABEL_COLLISION_LAYER, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    this.map.addLayer(collisionLayer(), beforeId)
    this.update()
  }

  update(): void {
    if (!this.map.getSource(LABEL_COLLISION_LAYER)) return
    const container = this.map.getContainer()
    const boxes = [pinBox(this.map, this.pin()), ...chromeBoxes(container)].filter((box): box is Box => Boolean(box))
    const features = boxes.map((box) => {
      const width = Math.max(1, Math.round(box.right - box.left)), height = Math.max(1, Math.round(box.bottom - box.top))
      const image = `label-collision-${width}x${height}`
      if (!this.map.hasImage(image)) this.map.addImage(image, { width, height, data: new Uint8Array(width * height * 4) })
      const center = this.map.unproject([(box.left + box.right) / 2, (box.top + box.bottom) / 2])
      return { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [center.lng, center.lat] }, properties: { image } }
    })
    const key = JSON.stringify(features)
    if (key === this.key) return
    this.key = key
    ;(this.map.getSource(LABEL_COLLISION_LAYER) as GeoJSONSource).setData({ type: 'FeatureCollection', features })
  }
}

function collisionLayer(): SymbolLayerSpecification {
  return {
    id: LABEL_COLLISION_LAYER,
    type: 'symbol',
    source: LABEL_COLLISION_LAYER,
    layout: {
      'icon-image': ['get', 'image'],
      'icon-allow-overlap': true,
      'icon-ignore-placement': false,
      'icon-rotation-alignment': 'viewport',
      'icon-pitch-alignment': 'viewport',
    },
    paint: { 'icon-opacity': 0 },
  }
}
