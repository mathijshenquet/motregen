import type { Page } from 'playwright'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import sharp from 'sharp'
import { selectTemperaturePlaces, temperatureLabelSpacingPx, temperatureLayer, temperatureLabels } from '../web/src/core/temperature.js'
import type { NativeTheme } from './native-map.js'
import { NATIVE_VIEW } from './native-view.js'
import { FRAME, FRAME_PIXELS } from './config.js'
import type { RainFrame } from './native-rain.js'

export interface LabelPatch { pixels: number[]; colors: string }
export type LabelAtlas = Record<string, Record<string, LabelPatch>>
const places = selectTemperaturePlaces(NATIVE_VIEW.zoom, temperatureLabelSpacingPx(FRAME.width, FRAME.height))

export async function captureLabelAtlas(page: Page, theme: NativeTheme, base: Buffer): Promise<LabelAtlas> {
  const layer = temperatureLayer(theme)
  const points = await page.evaluate(async ({ layerJson, places }) => {
    const map = (window as unknown as { nativeMap: MapLibreMap }).nativeMap
    map.addSource('motregen-temperature', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    const before = map.getStyle().layers.find((layer) => ['label_town', 'label_city', 'label_state'].includes(layer.id))?.id
    map.addLayer(JSON.parse(layerJson), before)
    return places.map((place) => ({ name: place.name, ...map.project([place.lng, place.lat]) }))
  }, { layerJson: JSON.stringify(layer), places })
  const atlas: LabelAtlas = {}
  // Covers the ingest feels_like_c quantisation (−31.2…45 °C), with room at both ends.
  for (let value = -50; value <= 60; value++) {
    await page.evaluate(async ({ value, places }) => {
      const map = (window as unknown as { nativeMap: MapLibreMap }).nativeMap
      const source = map.getSource('motregen-temperature') as GeoJSONSource
      source.setData({ type: 'FeatureCollection', features: places.map((place, rank) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [place.lng, place.lat] }, properties: { name: place.name, rank, label: `${value}°` } })) })
      await new Promise<void>((resolve) => map.once('idle', () => resolve()))
    }, { value, places })
    const screenshot = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer()
    const patches = points.map((point) => ({ point, pixels: [] as number[], colors: [] as number[] }))
    for (let offset = 0; offset < base.length; offset += 3) {
      if (screenshot[offset] === base[offset] && screenshot[offset + 1] === base[offset + 1] && screenshot[offset + 2] === base[offset + 2]) continue
      const pixel = offset / 3
      const column = pixel % FRAME_PIXELS.width, row = Math.floor(pixel / FRAME_PIXELS.width)
      let nearest: typeof patches[number] | undefined, distance = Infinity
      for (const patch of patches) {
        const separation = (column - patch.point.x * FRAME.scale) ** 2 + (row - patch.point.y * FRAME.scale) ** 2
        if (separation < distance) { nearest = patch; distance = separation }
      }
      if (!nearest || distance > (60 * FRAME.scale) ** 2) continue
      nearest.pixels.push(pixel)
      nearest.colors.push(screenshot[offset]!, screenshot[offset + 1]!, screenshot[offset + 2]!)
    }
    for (const patch of patches) if (patch.pixels.length) {
      const labels = atlas[patch.point.name] ??= {}
      labels[`${value}°`] = { pixels: patch.pixels, colors: Buffer.from(patch.colors).toString('base64') }
    }
  }
  return atlas
}

export function drawTemperatureLabels(base: Buffer, atlas: LabelAtlas, frame: RainFrame): Buffer {
  const result = Buffer.from(base)
  const labels = temperatureLabels(frame.left, frame.right, frame.leftHeader, frame.rightHeader, frame.mix, places)
  for (const feature of labels.features) {
    const { name, label } = feature.properties
    const patch = atlas[name]?.[label]
    if (!patch) continue
    const colors = Buffer.from(patch.colors, 'base64')
    for (let index = 0; index < patch.pixels.length; index++) {
      const offset = patch.pixels[index]! * 3
      result[offset] = colors[index * 3]!
      result[offset + 1] = colors[index * 3 + 1]!
      result[offset + 2] = colors[index * 3 + 2]!
    }
  }
  return result
}
