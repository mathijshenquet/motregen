import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import sharp from 'sharp'

test.skip(process.env.MOTREGEN_BASEMAP_COMPARISON !== '1', 'Alleen voor de vaste offline A/B')
const dataOrigin = `http://127.0.0.1:${process.env.MOTREGEN_E2E_DATA_PORT ?? 8397}`
const output = resolve('../.dev/tracks/u60-basiskaart-afwerking')
interface Camera { lng: number; lat: number; zoom: number }
interface Viewport { width: number; height: number }
interface Capture { places: string[]; camera: Camera; viewport: Viewport; paints: Record<string, Record<string, unknown>> }

function luminance(rgb: number[]): number {
  const linear = rgb.map(channel => channel / 255 <= 0.04045 ? channel / 255 / 12.92 : ((channel / 255 + 0.055) / 1.055) ** 2.4)
  const value = 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
  return value > 216 / 24389 ? 116 * Math.cbrt(value) - 16 : 24389 / 27 * value
}

function color(value: unknown): number[] {
  if (typeof value !== 'string') throw new Error(`Geen vlakke kleur: ${JSON.stringify(value)}`)
  if (value.startsWith('#')) {
    const hex = value.length === 4 ? [...value.slice(1)].map(character => character.repeat(2)).join('') : value.slice(1)
    return [0, 2, 4].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16))
  }
  const rgb = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (rgb) return rgb.slice(1, 4).map(Number)
  if (value === 'hsl(248,1%,41%)') return [104, 104, 106]
  throw new Error(`Onbekende kleur: ${value}`)
}

function opacityAtZoom(value: unknown, zoom: number): number {
  if (value === undefined) return 1
  if (typeof value === 'number') return value
  if (!Array.isArray(value) || value[0] !== 'interpolate') throw new Error('Onbekende dekking')
  let previousZoom = value[3] as number
  let previousValue = value[4] as number
  for (let index = 5; index < value.length; index += 2) {
    const nextZoom = value[index] as number
    const nextValue = value[index + 1] as number
    if (zoom <= nextZoom) {
      const fraction = Math.max(0, (zoom - previousZoom) / (nextZoom - previousZoom))
      return previousValue + (nextValue - previousValue) * fraction
    }
    previousZoom = nextZoom
    previousValue = nextValue
  }
  return previousValue
}

async function contrasts(png: Buffer, capture: Capture) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const background = color(capture.paints.background!['background-color'])
  const water = color(capture.paints.water!['fill-color'])
  const landHistogram = new Map<string, number>()
  for (let index = 0; index < data.length; index += info.channels) {
    const pixel = [...data.subarray(index, index + 3)]
    if (pixel.every((channel, axis) => Math.abs(channel - background[axis]!) < 12)) {
      const key = pixel.join(',')
      landHistogram.set(key, (landHistogram.get(key) ?? 0) + 1)
    }
  }
  const land = [...landHistogram].sort((left, right) => right[1] - left[1])[0]?.[0].split(',').map(Number) ?? background
  const landL = luminance(land)
  const boundary = color(capture.paints.boundary_2!['line-color'])
  const province = color(capture.paints['motregen-province-boundaries']!['line-color'])
  const blend = (foreground: number[], opacity: number) => foreground.map((channel, index) => channel * opacity + land[index]! * (1 - opacity))
  return {
    landColor: land,
    waterLand: Math.abs(luminance(water) - landL),
    labelLand: Math.abs(luminance(color(capture.paints.label_city!['text-color'])) - landL),
    boundaryLand: Math.abs(luminance(blend(boundary, opacityAtZoom(capture.paints.boundary_2!['line-opacity'], capture.camera.zoom))) - landL),
    provinceLand: Math.abs(luminance(blend(province, opacityAtZoom(capture.paints['motregen-province-boundaries']!['line-opacity'], capture.camera.zoom))) - landL),
  }
}

async function pair(left: Buffer, right: Buffer, path: string, caption: string) {
  const metadata = await sharp(left).metadata()
  const width = metadata.width!
  const height = metadata.height!
  const header = Buffer.from(`<svg width="${width * 2}" height="44"><rect width="100%" height="100%" fill="#ffffff"/><g font-family="sans-serif" font-size="13" fill="#202a30"><text x="12" y="18">Oud · OpenFreeMap / Liberty</text><text x="${width + 12}" y="18">Nieuw · eigen kaart</text><text x="12" y="36">${caption}</text></g></svg>`)
  await sharp({ create: { width: width * 2, height: height + 44, channels: 3, background: '#ffffff' } })
    .composite([{ input: header, top: 0, left: 0 }, { input: left, top: 44, left: 0 }, { input: right, top: 44, left: width }]).png().toFile(path)
}

for (const width of [390, 1280]) {
  for (const theme of ['light', 'dark']) {
    test(`contrastieve A/B ${width}px ${theme}`, async ({ page }) => {
      test.setTimeout(180_000)
      mkdirSync(output, { recursive: true })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      page.on('request', request => {
        const url = new URL(request.url())
        if (['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)) errors.push(`Extern verzoek: ${request.url()}`)
      })
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 })
      await page.addInitScript(theme => localStorage.setItem('motregen-theme', theme), theme)
      await page.goto('/?t=%2B0u&modus=weer')
      await expect(page.locator('.map-splash.ready')).toBeAttached()
      await page.waitForTimeout(1_000)
      const camera = await page.evaluate(() => (window as unknown as { __motregenCamera: () => Camera }).__motregenCamera())
      const viewport = await page.locator('.map').evaluate((element: HTMLElement) => ({ width: element.clientWidth, height: element.clientHeight }))
      const views = [
        { name: 'start', camera },
        { name: 'utrecht', camera: { lng: 5.1214, lat: 52.0907, zoom: 9 } },
        { name: 'kust', camera: { lng: 4.05, lat: 52.14, zoom: 9 } },
        { name: 'ijsselmeer', camera: { lng: 5.4, lat: 52.75, zoom: 9 } },
        ...[7, 10, 12].map(zoom => ({ name: `utrecht-z${zoom}`, camera: { lng: 5.1214, lat: 52.0907, zoom } })),
      ]
      for (const view of views.slice(0, 2)) {
        const appImages: Buffer[] = []
        for (const basemap of ['openfreemap', 'own']) {
          await page.unroute('**/style-*.json')
          if (basemap === 'openfreemap') await page.route('**/style-*.json', async route => route.fulfill({ response: await route.fetch({ url: `${dataOrigin}/reference-style-${theme}.json` }) }))
          await page.evaluate(camera => localStorage.setItem('motregen-map-view', JSON.stringify(camera)), view.camera)
          await page.goto('/?t=%2B0u&modus=weer')
          await expect(page.locator('.map-splash.ready')).toBeAttached()
          await page.waitForTimeout(1_000)
          appImages.push(await page.screenshot())
        }
        await pair(appImages[0]!, appImages[1]!, resolve(output, `app-${width}-${theme}-${view.name}.png`), `${width}px · ${theme} · ${view.name}`)
      }
      await page.unroute('**/style-*.json')
      await page.goto(`${dataOrigin}/compare/index.html`)
      const results = []
      for (const view of views) {
        const captures = []
        const images: Buffer[] = []
        for (const basemap of ['openfreemap', 'own']) {
          const styleUrl = `${dataOrigin}/${basemap === 'own' ? 'style' : 'reference-style'}-${theme}.json`
          const capture = await page.evaluate(async ({ styleUrl, camera, viewport }) => (window as unknown as { renderComparison: (url: string, camera: Camera, viewport: Viewport) => Promise<Capture> }).renderComparison(styleUrl, camera, viewport), { styleUrl, camera: view.camera, viewport })
          for (const axis of ['lng', 'lat', 'zoom'] as const) expect(capture.camera[axis]).toBeCloseTo(view.camera[axis], 6)
          const image = await page.locator('#map').screenshot()
          images.push(image)
          const contrast = await contrasts(image, capture)
          const coverPercent: Record<string, number> = {}
          for (const kind of ['green', 'gray', 'wood', 'grass', 'park']) {
            await page.evaluate(kind => (window as unknown as { renderCoverMask: (kind: string) => Promise<void> }).renderCoverMask(kind), kind)
            const mask = await page.locator('#map').screenshot()
            const { data, info } = await sharp(mask).removeAlpha().raw().toBuffer({ resolveWithObject: true })
            let area = 0
            for (let index = 0; index < data.length; index += info.channels) area += data[index]! / 255
            coverPercent[kind] = area / (info.width * info.height) * 100
          }
          captures.push({ basemap, places: capture.places, labelCount: capture.places.length, greenPercent: coverPercent.green!, grayPercent: coverPercent.gray!, coverPercent, contrast })
        }
        const path = resolve(output, `ab-${width}-${theme}-${view.name}.png`)
        await pair(images[0]!, images[1]!, path, `${width}px · ${theme} · ${view.name} · z${view.camera.zoom.toFixed(2)}`)
        results.push({ view: view.name, camera: view.camera, viewport, captures })
        writeFileSync(resolve(output, `ab-${width}-${theme}.json`), `${JSON.stringify(results, null, 2)}\n`)
      }
      expect(errors).toEqual([])
      for (const view of results) {
        for (const kind of ['greenPercent', 'grayPercent'] as const) {
          const old = view.captures[0]![kind]
          const current = view.captures[1]![kind]
          expect.soft(current, `${view.view} ${kind}`).toBeGreaterThanOrEqual(old * 0.85)
          expect.soft(current, `${view.view} ${kind}`).toBeLessThanOrEqual(old * 1.15)
        }
      }
      const start = results[0]!.captures
      expect(start[1]!.labelCount).toBeGreaterThanOrEqual(start[0]!.labelCount * 0.8)
      expect(start[1]!.labelCount).toBeLessThanOrEqual(start[0]!.labelCount * 1.2)
      if (theme === 'dark') expect(start[1]!.contrast.waterLand).toBeGreaterThanOrEqual(start[0]!.contrast.waterLand - 2)
    })
  }
}
