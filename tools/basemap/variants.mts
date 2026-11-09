// U108-proef (`?dev&kaart=<naam>`, vervalt 2026-11-23): lichtere stijlvarianten van de basiskaart en de rivierfix.
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
  rivers: boolean
  palettes: Record<Theme, ThemePalette>
  riverScale?: number
}

const labels = (text: string, halo: string, haloWidth = 1): Record<string, Paint> => Object.fromEntries(
  ['label_village', 'label_town', 'label_city'].map((id) => [id, { 'text-color': text, 'text-halo-color': halo, 'text-halo-width': haloWidth, 'text-halo-blur': 1 }]),
)

const LIGHT_CALM: ThemePalette = {
  paint: {
    background: { 'background-color': '#f7f5f1' },
    park: { 'fill-color': '#e4ecda', 'fill-opacity': 0.6 },
    landuse_residential: { 'fill-color': ['interpolate', ['linear'], ['zoom'], 9, '#ebe7e1', 12, '#efe7dc'] },
    landcover_wood: { 'fill-color': '#d9e6cc', 'fill-opacity': 0.55 },
    landcover_grass: { 'fill-color': '#dfe9d3', 'fill-opacity': 0.45 },
    landcover_wetland: { 'fill-color': '#e0ebdd' },
    water: { 'fill-color': '#bfd5e8' },
    landcover_sand: { 'fill-color': '#f2eddb' },
    boundary_2: { 'line-color': '#8d8c91', 'line-opacity': 0.7, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.7, 11, 1.3] },
    'motregen-province-boundaries': { 'line-color': '#9eabaf', 'line-opacity': 0.6 },
    ...labels('#2a2a2a', '#ffffff'),
  },
  river: '#a3c0da',
  stateLabel: { 'text-color': '#848f91', 'text-halo-color': '#f7f5f1' },
}

const DARK_CALM: ThemePalette = {
  paint: {
    background: { 'background-color': '#121f24' },
    park: { 'fill-color': '#1b2c25', 'fill-opacity': 0.6 },
    landuse_residential: { 'fill-color': '#1a272a' },
    landcover_wood: { 'fill-color': '#1b3127', 'fill-opacity': 0.4 },
    landcover_grass: { 'fill-color': '#1f3229', 'fill-opacity': 0.3 },
    landcover_wetland: { 'fill-color': '#1d2f29' },
    water: { 'fill-color': '#1b3643', 'fill-outline-color': '#1b3643' },
    landcover_sand: { 'fill-color': '#36332a' },
    boundary_2: { 'line-color': '#5f747a', 'line-opacity': 0.75, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.7, 11, 1.3] },
    'motregen-province-boundaries': { 'line-color': '#6e8287', 'line-opacity': 0.6 },
    ...labels('#bcc8cb', '#121f24'),
  },
  river: '#2f5567',
  stateLabel: { 'text-color': '#8c9da0', 'text-halo-color': '#121f24' },
}

// Eigen voorstel: een getekende atlas. Papier, rivieren in een inktblauw dat dieper is dan het water, en een zacht lint
// langs de landsgrens zoals in een schoolatlas. Een inktrand langs watervlakken viel af: vlakken zijn per tegel
// afgeknipt, dus de rand tekent elke tegelgrens op zee.
const LIGHT_ATLAS: ThemePalette = {
  paint: {
    background: { 'background-color': '#f4f0e6' },
    park: { 'fill-color': '#dfe6cf', 'fill-opacity': 0.55 },
    landuse_residential: { 'fill-color': ['interpolate', ['linear'], ['zoom'], 9, '#ece6da', 12, '#ece2d3'] },
    landcover_wood: { 'fill-color': '#d6dfc2', 'fill-opacity': 0.6 },
    landcover_grass: { 'fill-color': '#dee5cc', 'fill-opacity': 0.45 },
    landcover_wetland: { 'fill-color': '#dde6d6' },
    water: { 'fill-color': '#bed3df' },
    landcover_sand: { 'fill-color': '#efe5c7' },
    boundary_2: { 'line-color': '#8e7f8a', 'line-opacity': 0.8, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 11, 1.2] },
    'motregen-province-boundaries': { 'line-color': '#a99f95', 'line-opacity': 0.65 },
    ...labels('#40382f', '#f4f0e6', 1.2),
  },
  river: '#89abc1',
  borderRibbon: '#e2cfd9',
  stateLabel: { 'text-color': '#a09386', 'text-halo-color': '#f4f0e6' },
}

// Nachtkaart: water duidelijk donkerder dan land (ΔL* ≈ 9), zodat de kust ook onder regen en temperatuur leesbaar blijft.
const DARK_ATLAS: ThemePalette = {
  paint: {
    background: { 'background-color': '#1c2a31' },
    park: { 'fill-color': '#1f3029', 'fill-opacity': 0.55 },
    landuse_residential: { 'fill-color': '#202f36' },
    landcover_wood: { 'fill-color': '#1d322a', 'fill-opacity': 0.5 },
    landcover_grass: { 'fill-color': '#213429', 'fill-opacity': 0.35 },
    landcover_wetland: { 'fill-color': '#1f3229' },
    water: { 'fill-color': '#0d1820', 'fill-outline-color': '#0d1820' },
    landcover_sand: { 'fill-color': '#38352c' },
    boundary_2: { 'line-color': '#71697b', 'line-opacity': 0.8, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 11, 1.2] },
    'motregen-province-boundaries': { 'line-color': '#6f7f86', 'line-opacity': 0.6 },
    ...labels('#d2cbc0', '#1c2a31', 1.2),
  },
  river: '#3d5f72',
  borderRibbon: '#3a3045',
  stateLabel: { 'text-color': '#95a2a5', 'text-halo-color': '#1c2a31' },
}

export const BASEMAP_VARIANTS: BasemapVariant[] = [
  { name: 'licht', rivers: false, palettes: { light: LIGHT_CALM, dark: DARK_CALM } },
  { name: 'licht-rivieren', rivers: true, palettes: { light: LIGHT_CALM, dark: DARK_CALM } },
  { name: 'atlas', rivers: true, palettes: { light: LIGHT_ATLAS, dark: DARK_ATLAS }, riverScale: 0.85 },
]

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
  const layers = style.layers.map((layer) => {
    const paint = palette.paint[layer.id]
    const state = layer.id === 'label_state' ? palette.stateLabel : undefined
    return paint || state ? { ...layer, paint: { ...layer.paint, ...paint, ...state } } : layer
  })
  const waterIndex = layers.findIndex((layer) => layer.id === 'water')
  const waterColour = palette.paint.water?.['fill-color'] as string
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
