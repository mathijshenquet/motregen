import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { Grid } from '../src/core/contract'
import type { WaterMaskView } from '../src/core/wind-water-mask'

interface WaterProbe {
  map: MapLibreMap
  grid: Grid
  waterSourceId: string
  waterBounds: WaterMaskView['bounds']
  waterColumns: number
  waterRows: number
  waterMask: Uint8Array
  waterWorker?: Worker
  waterWorkerFailed: boolean
  waterFactor(x: number, y: number): number
}

const forceFallback = process.argv.includes('--fallback')
const args = process.argv.slice(2).filter((argument) => argument !== '--fallback')
const origin = args[0] ?? 'http://127.0.0.1:4370'
const screenshot = args[1] ?? 'tmp/water-mask.png'

const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.addInitScript('globalThis.__name = (value) => value')
  if (forceFallback) await page.addInitScript('globalThis.OffscreenCanvas = undefined')
  await page.goto(`${origin}/?perf`)
  await page.waitForFunction(() => {
    const wind = (window as unknown as { __motregenWind?: WaterProbe }).__motregenWind
    return wind?.waterMask?.some((value) => value === 255) && wind.map.areTilesLoaded()
  }, undefined, { timeout: 60_000 })
  await page.waitForTimeout(500)
  const result = await page.evaluate(() => {
    const wind = (window as unknown as { __motregenWind: WaterProbe }).__motregenWind
    const map = wind.map
    const grid = wind.grid
    const bounds = wind.waterBounds
    const columns = wind.waterColumns
    const rows = wind.waterRows
    const reference = document.createElement('canvas')
    reference.width = columns
    reference.height = rows
    const context = reference.getContext('2d', { willReadFrequently: true })!
    context.fillStyle = '#fff'
    const project = (lng: number, lat: number) => [
      (lng * Math.PI / 180 * 6378137 - grid.x0) / (grid.dx * grid.width),
      (Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 6378137 - grid.y0) / (grid.dy * grid.height),
    ]
    const draw = (rings: number[][][]) => {
      context.beginPath()
      for (const ring of rings) {
        ring.forEach(([lng, lat], index) => {
          const [gridX, gridY] = project(lng!, lat!)
          const px = (gridX! - bounds.west) * columns / (bounds.east - bounds.west)
          const py = (gridY! - bounds.north) * rows / (bounds.south - bounds.north)
          if (index === 0) context.moveTo(px, py)
          else context.lineTo(px, py)
        })
        context.closePath()
      }
      context.fill('evenodd')
    }
    for (const feature of map.querySourceFeatures(wind.waterSourceId, { sourceLayer: 'water' })) {
      const geometry = feature.geometry
      if (geometry.type === 'Polygon') draw(geometry.coordinates)
      else if (geometry.type === 'MultiPolygon') for (const polygon of geometry.coordinates) draw(polygon)
    }
    const pixels = context.getImageData(0, 0, columns, rows).data
    let different = 0
    let maxDifference = 0
    let totalDifference = 0
    for (let index = 0; index < wind.waterMask.length; index++) {
      const delta = Math.abs(wind.waterMask[index] - pixels[index * 4 + 3]!)
      if (delta) different++
      maxDifference = Math.max(maxDifference, delta)
      totalDifference += delta
    }
    const factors = [[3.5, 53], [5.4, 52.1], [5.35, 52.75]].map(([lng, lat]) => {
      const [gridX, gridY] = project(lng!, lat!)
      return { lng, lat, factor: wind.waterFactor(gridX, gridY) }
    })
    return { cells: wind.waterMask.length, different, maxDifference, meanDifference: totalDifference / wind.waterMask.length, factors, worker: !!wind.waterWorker, workerFailed: wind.waterWorkerFailed }
  })
  console.log(JSON.stringify(result, null, 2))
  if ((forceFallback ? result.worker : !result.worker) || result.workerFailed || result.meanDifference > 0.01
    || Math.abs(result.factors[0]!.factor - 0.67) > 1e-10 || result.factors[1]!.factor !== 1
    || Math.abs(result.factors[2]!.factor - 0.67) > 1e-10) throw new Error('watermasker wijkt af van oorspronkelijke rastering of zee-penalty')
  await mkdir(dirname(resolve(screenshot)), { recursive: true })
  await page.screenshot({ path: screenshot })
} finally {
  await browser.close()
}
