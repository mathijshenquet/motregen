import { chromium } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { FRAME, FRAME_PIXELS } from './config.js'
import { openRenderPage } from './render-open.js'
import { NativeOverlay } from './native-overlay.js'
import { drawTemperatureLabels } from './native-labels.js'
import { NativeMaps } from './native-map.js'
import { NativeRainData, RainCompositor, rainTheme } from './native-rain.js'
import { validateManifest } from './stills.js'
import { sequencePlan } from './sequences.js'
import { colorDifference } from './color-difference.js'

const manifestPath = process.argv[2]
const outputDirectory = process.argv[3]
if (!manifestPath || !outputDirectory) throw new Error('Gebruik: pnpm parity <manifest.json> <beeldmap>')
const manifest = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')))
const origin = process.env.MOTREGEN_ORIGIN ?? 'https://motregen.nl'
const referenceOrigin = process.env.MOTREGEN_PARITY_ORIGIN ?? origin
const now = Date.parse(manifest.now)
const limits = { mean: 0.5, maximum: 50, mapMean: 0.35, mapMaximum: 8 }
const browser = await chromium.launch({ executablePath: process.env.MOTREGEN_CHROMIUM_PATH, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
try {
  await mkdir(outputDirectory, { recursive: true })
  const context = await browser.newContext({ viewport: FRAME, deviceScaleFactor: FRAME.scale, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', reducedMotion: 'reduce', serviceWorkers: 'block' })
  const page = await context.newPage()
  const cache = process.env.MOTREGEN_RENDER_CACHE ?? '../tmp/u71a-parity'
  const data = new NativeRainData(origin, manifest)
  const temperatures = new NativeRainData(origin, manifest, 'feels_like_c')
  const maps = new NativeMaps(origin, cache, async () => context)
  const overlay = new NativeOverlay(origin, cache, async () => context)
  await overlay.prepare(manifest)
  const samples = [{ name: 'historie', minutes: -55 }, { name: 'voor-loop', minutes: -120 }, { name: 'nu', minutes: 0 }, { name: 'verwachting', minutes: 95 }, { name: 'nacht', minutes: 720 }]
  const results = []
  await openRenderPage(page, referenceOrigin, 'weather', manifest, now + samples[0]!.minutes * 60_000)
  for (const sample of samples) {
    const epoch = now + sample.minutes * 60_000
    await page.evaluate(async (epoch) => {
      await (window as unknown as { __motregenRenderFrame: (epoch: number) => Promise<void> }).__motregenRenderFrame(epoch)
    }, epoch)
    const reference = await page.screenshot()
    const referenceRgb = await sharp(reference).removeAlpha().raw().toBuffer()
    const rain = await data.frame(epoch)
    const theme = rainTheme(epoch)
    const plate = await maps.get(theme, rain.grid)
    const temperatureEpoch = Math.max(temperatures.timeline[0]!.epoch, Math.min(temperatures.timeline.at(-1)!.epoch, Math.round(epoch / 600_000) * 600_000))
    const base = drawTemperatureLabels(plate.rgb, plate.labels, await temperatures.frame(temperatureEpoch))
    const compositor = new RainCompositor(rain.grid)
    const rgb = await overlay.draw(await compositor.composeFast(base, rain, theme === 'dark'), epoch, now)
    await compositor.close()
    const native = await sharp(rgb, { raw: { ...FRAME_PIXELS, channels: 3 } }).png().toBuffer()
    const total = colorDifference(referenceRgb, rgb)
    const map = colorDifference(referenceRgb.subarray(130 * FRAME_PIXELS.width * 3, 1197 * FRAME_PIXELS.width * 3), rgb.subarray(130 * FRAME_PIXELS.width * 3, 1197 * FRAME_PIXELS.width * 3))
    const passed = total.mean <= limits.mean && total.maximum <= limits.maximum && map.mean <= limits.mapMean && map.maximum <= limits.mapMaximum
    const result = { mode: 'weather', sample: sample.name, epoch: new Date(epoch).toISOString(), theme, total, map, passed }
    results.push(result)
    console.info(JSON.stringify({ event: 'native-parity', ...result }))
    await writeFile(join(outputDirectory, `${sample.name}-browser.png`), reference)
    await writeFile(join(outputDirectory, `${sample.name}-native.png`), native)
    await sharp({ create: { width: FRAME_PIXELS.width * 2, height: FRAME_PIXELS.height, channels: 3, background: '#ffffff' } }).composite([{ input: reference, left: 0, top: 0 }, { input: native, left: FRAME_PIXELS.width, top: 0 }]).png().toFile(join(outputDirectory, `${sample.name}-naast-elkaar.png`))
  }
  await writeFile(join(outputDirectory, 'parity.json'), JSON.stringify({ generated: manifest.generated, loopFrames: sequencePlan('weather', manifest).loopFrames, metric: 'CIELAB D65 ΔE76', referenceOrigin, limits, results }, null, 2) + '\n')
  if (results.some((result) => !result.passed)) process.exitCode = 1
} finally { await browser.close() }
