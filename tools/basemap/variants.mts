// U108 (MIP-42): stijlvarianten van de basiskaart. `diagram` is de standaard; `strak` en `diagram-wegen` zijn
// dev-opties (`?dev&kaart=<naam>`, vervalt 2026-11-23).
// Varianten veranderen alleen paint en voegen lagen toe; laag-id's zijn in licht en donker gelijk, zodat de
// dag/nachtmenging (basemap-blend.ts) blijft werken.
type Theme = 'light' | 'dark'
type Paint = Record<string, unknown>
// Opzettelijk los getypeerd: de stijl komt als JSON uit style.mts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Style = { name: string; layers: any[] }

interface ThemePalette {
  paint: Record<string, Paint>
  /** Kleur van de rivierlijnen; zonder waarde de vulkleur van water. */
  river?: string
  /** Breed, zacht lint onder de landsgrens. */
  borderRibbon?: string
  stateLabel?: Paint
}

export interface BasemapVariant {
  name: string
  /** Welk archief (tools/basemap/tiles/manifest-<archief>.json). */
  archive: 'strak' | 'diagram' | 'diagram-wegen'
  rivers: boolean
  /** Eigen weerkaart: alleen bos (binair), kernen, water, rivieren, grenzen, plaatsen; optioneel snelwegen. */
  diagram?: { roads: boolean }
  palettes: Record<Theme, ThemePalette>
  riverScale?: number
}

// PO 2026-11-09: bos op z7–8 zichtbaar houden nu gras en park weg zijn (licht effectief 28 → 56 %); 's nachts een
// lichtere groentint, het oude #203a2d viel op het donkere land weg. Dezelfde dekking in beide thema's: de
// dag/nachtmenging (basemap-blend.ts) mengt alleen kleuren.
const DIAGRAM_LIGHT: ThemePalette = { paint: { landcover_wood: { 'fill-opacity': 0.8 } } }
const DIAGRAM_DARK: ThemePalette = { paint: { landcover_wood: { 'fill-opacity': 0.8, 'fill-color': '#2b5140' } } }

export const BASEMAP_VARIANTS: BasemapVariant[] = [
  // PO 2026-11-09: het oorspronkelijke palet was prima; alleen grove rivieren en stadsvlekken, en de tekenkosten.
  { name: 'strak', archive: 'strak', rivers: true, palettes: { light: { paint: {} }, dark: { paint: {} } } },
  // Herijking PO 2026-11-09 (MIP-42): eigen weerkaart, herkenbaarheid eerst, bos binair, geen zand/heide/gras/moeras.
  // Standaard sinds de uitrol van 2026-11-09; diagram-wegen blijft dev-optie.
  { name: 'diagram', archive: 'diagram', rivers: true, diagram: { roads: false }, palettes: { light: DIAGRAM_LIGHT, dark: DIAGRAM_DARK } },
  { name: 'diagram-wegen', archive: 'diagram-wegen', rivers: true, diagram: { roads: true }, palettes: { light: DIAGRAM_LIGHT, dark: DIAGRAM_DARK } },
]

const DIAGRAM_DROPPED = new Set(['park', 'landcover_grass', 'landcover_wetland', 'landcover_sand'])
const DIAGRAM_CLASS: Record<string, string> = { landcover_wood: 'wood', landuse_residential: 'urban' }

/** Diagramarchief: landbedekking heeft alleen `class` wood/urban, zonder detail_minzoom (de generalisatie selecteert al). */
function diagramLayers(layers: Style['layers'], roads: boolean, theme: Theme): Style['layers'] {
  const kept = layers.filter((layer) => !DIAGRAM_DROPPED.has(layer.id)).map((layer) => {
    const kind = DIAGRAM_CLASS[layer.id]
    return kind ? { ...layer, filter: ['==', ['get', 'class'], kind] } : layer
  })
  if (!roads) return kept
  const index = kept.findIndex((layer) => layer.id === 'boundary_2')
  kept.splice(index, 0, {
    id: 'road_motorway', type: 'line', source: 'basemap', 'source-layer': 'road', minzoom: 6,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': theme === 'dark' ? '#4a5a60' : '#d9c9a8',
      'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 8, 0.9, 10, 1.4, 12, 2.2],
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 7, 0.9],
    },
  })
  return kept
}

/** Breedte per zoom (px) voor rang 1–3; rang 2 en 3 vloeien in vanaf hun minimumzoom. */
const RIVER_WIDTHS: Record<1 | 2 | 3, Array<[number, number]>> = {
  1: [[5, 0.8], [6, 1.1], [7, 1.5], [8, 1.9], [10, 2.6], [12, 3.4]],
  2: [[7, 0.5], [8, 0.8], [10, 1.4], [12, 2]],
  3: [[9, 0.4], [10, 0.8], [12, 1.3]],
}
const RIVER_MINZOOM = { 1: 5, 2: 7, 3: 9 } as const

function riverLayer(rank: 1 | 2 | 3, colour: string, scale: number) {
  const minzoom = RIVER_MINZOOM[rank]
  return {
    id: `river_${rank}`, type: 'line', source: 'basemap', 'source-layer': 'waterway', minzoom,
    filter: ['==', ['get', 'rank'], rank],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': colour,
      'line-width': ['interpolate', ['linear'], ['zoom'], ...RIVER_WIDTHS[rank].flatMap(([zoom, width]) => [zoom, +(width * scale).toFixed(2)])],
      ...rank === 1 ? {} : { 'line-opacity': ['interpolate', ['linear'], ['zoom'], minzoom, 0.5, minzoom + 1, 1] },
    },
  }
}

export function applyVariant(style: Style, variant: BasemapVariant, theme: Theme): Style {
  const palette = variant.palettes[theme]
  const source = variant.diagram ? diagramLayers(style.layers, variant.diagram.roads, theme) : style.layers
  const layers = source.map((layer) => {
    const paint = palette.paint[layer.id]
    const state = layer.id === 'label_state' ? palette.stateLabel : undefined
    return paint || state ? { ...layer, paint: { ...layer.paint, ...paint, ...state } } : layer
  })
  const waterIndex = layers.findIndex((layer) => layer.id === 'water')
  const waterColour = (palette.paint.water ?? layers[waterIndex]?.paint)?.['fill-color'] as string
  // Rivierlijnen onder het watervlak: waar de rivier breder is dan de lijn, tekent het vlak.
  if (variant.rivers) layers.splice(waterIndex, 0, ...([1, 2, 3] as const).map((rank) => riverLayer(rank, palette.river ?? waterColour, variant.riverScale ?? 1)))
  if (palette.borderRibbon) {
    const index = layers.findIndex((layer) => layer.id === 'boundary_2')
    layers.splice(index, 0, {
      id: 'boundary_2_ribbon', type: 'line', source: 'basemap', 'source-layer': 'boundary', filter: ['==', ['get', 'admin_level'], 2],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': palette.borderRibbon, 'line-opacity': 0.7, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 2.5, 8, 5, 12, 8] },
    })
  }
  return { ...style, name: `${style.name} — ${variant.name}`, layers }
}
