import { chromium } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { FRAME, FRAME_PIXELS } from './config.js'
import { openRenderPage } from './render-open.js'
import { validateManifest } from './stills.js'
import { colorDifference } from './color-difference.js'

// U92: de Rust-Luchtfilm tegenover de app in Lucht, per thema één kaarttijd. De app wordt op `now` geopend en
// daarna naar het frame gezet: zo zaait de app het bulkpad van de wolken op hetzelfde uur als de film.
// Gebruik: tsx air-parity.ts <manifest.json> <Rust-uitvoermap> <beeldmap>; MOTREGEN_PARITY_ORIGIN wijst naar een app
// met dezelfde data. De Rust-stills zijn JPEG (q95, 4:4:4); de JPEG-vloer staat per beeld in het resultaat.
const [manifestPath, nativeDirectory, outputDirectory] = process.argv.slice(2)
if (!manifestPath || !nativeDirectory || !outputDirectory) throw new Error('Gebruik: tsx air-parity.ts <manifest.json> <Rust-uitvoermap> <beeldmap>')
const manifest = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')))
const origin = process.env.MOTREGEN_PARITY_ORIGIN ?? 'http://127.0.0.1:4392'
const now = Date.parse(manifest.now)
// Kaartgebied zonder klokpaneel (linksboven) en voettekst (linksonder): die tekst tekent Rust zelf (MIP-29).
const mapRows = { first: 270, last: 1140 }
// De Rust-stills zijn JPEG; het gemiddelde mag de eigen JPEG-vloer van het appbeeld met hooguit 0,5 overschrijden.
const limits = { mapMeanAboveJpeg: 0.5, mapP99: 8 }
const samples = [{ name: 'dag', minutes: 240 }, { name: 'nacht', minutes: 720 }]

function mapRegion(rgb: Uint8Array): Uint8Array {
  return rgb.subarray(mapRows.first * FRAME_PIXELS.width * 3, mapRows.last * FRAME_PIXELS.width * 3)
}

/** Percentiel van ΔE per pixel; het gemiddelde alleen verbergt een verschoven patroon niet. */
function percentile(first: Uint8Array, second: Uint8Array, fraction: number): number {
  const deltas = new Float64Array(first.length / 3)
  for (let pixel = 0; pixel < deltas.length; pixel++) {
    deltas[pixel] = colorDifference(first.subarray(pixel * 3, pixel * 3 + 3), second.subarray(pixel * 3, pixel * 3 + 3)).mean
  }
  deltas.sort()
  return deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * fraction))]!
}

async function differenceImage(first: Uint8Array, second: Uint8Array, path: string): Promise<void> {
  const image = Buffer.alloc(first.length / 3)
  for (let pixel = 0; pixel < image.length; pixel++) {
    const delta = colorDifference(first.subarray(pixel * 3, pixel * 3 + 3), second.subarray(pixel * 3, pixel * 3 + 3)).mean
    image[pixel] = Math.min(255, Math.round(delta * 16))
  }
  await sharp(image, { raw: { ...FRAME_PIXELS, channels: 1 } }).png().toFile(path)
}

const browser = await chromium.launch({ executablePath: process.env.MOTREGEN_CHROMIUM_PATH, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
try {
  await mkdir(outputDirectory, { recursive: true })
  const context = await browser.newContext({ viewport: FRAME, deviceScaleFactor: FRAME.scale, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', reducedMotion: 'reduce', serviceWorkers: 'block' })
  const page = await context.newPage()
  await openRenderPage(page, origin, 'air', manifest, now)
  // De stillweergave van de app past nog het oude kader; zet hem op de projectie van de Rust-platen.
  const { view } = JSON.parse(await readFile(new URL('../crates/render-core/assets/constants.json', import.meta.url), 'utf8')) as { view: { lng: number; lat: number; zoom: number } }
  await page.evaluate((view) => (window as unknown as { __motregenJumpTo: (lng: number, lat: number, zoom: number, free?: boolean) => void }).__motregenJumpTo(view.lng, view.lat, view.zoom, true), view)
  const results = []
  for (const sample of samples) {
    const epoch = now + sample.minutes * 60_000
    // Een grote tijdsprong in still-mode meldt soms dat de wolkenlaag nog laadt (bekend, MIP-34); dan opnieuw.
    for (let attempt = 1; ; attempt++) {
      try {
        await page.evaluate(async (epoch) => {
          await (window as unknown as { __motregenRenderFrame: (epoch: number) => Promise<void> }).__motregenRenderFrame(epoch)
        }, epoch)
        break
      } catch (error) {
        if (attempt === 3) throw error
        console.info(JSON.stringify({ event: 'air-parity-retry', sample: sample.name, attempt, reason: String(error).slice(0, 120) }))
        await new Promise((resolve) => setTimeout(resolve, 1_000))
      }
    }
    const reference = await page.screenshot()
    const referenceRgb = await sharp(reference).removeAlpha().raw().toBuffer()
    const nativeJpeg = await readFile(join(nativeDirectory, `air-${epoch}.jpg`))
    const nativeRgb = await sharp(nativeJpeg).removeAlpha().raw().toBuffer()
    const referenceJpeg = await sharp(referenceRgb, { raw: { ...FRAME_PIXELS, channels: 3 } }).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer()
    const jpegFloor = colorDifference(mapRegion(referenceRgb), mapRegion(await sharp(referenceJpeg).raw().toBuffer()))
    const total = colorDifference(referenceRgb, nativeRgb)
    const map = colorDifference(mapRegion(referenceRgb), mapRegion(nativeRgb))
    const mapP99 = percentile(mapRegion(referenceRgb), mapRegion(nativeRgb), 0.99)
    const passed = map.mean - jpegFloor.mean <= limits.mapMeanAboveJpeg && mapP99 <= limits.mapP99
    const result = { sample: sample.name, epoch: new Date(epoch).toISOString(), total, map, mapP99, jpegFloor, passed }
    results.push(result)
    console.info(JSON.stringify({ event: 'air-parity', ...result }))
    await writeFile(join(outputDirectory, `${sample.name}-browser.png`), reference)
    await writeFile(join(outputDirectory, `${sample.name}-native.jpg`), nativeJpeg)
    await differenceImage(referenceRgb, nativeRgb, join(outputDirectory, `${sample.name}-verschil.png`))
    await sharp({ create: { width: FRAME_PIXELS.width * 2, height: FRAME_PIXELS.height, channels: 3, background: '#ffffff' } })
      .composite([{ input: reference, left: 0, top: 0 }, { input: nativeJpeg, left: FRAME_PIXELS.width, top: 0 }])
      .png().toFile(join(outputDirectory, `${sample.name}-naast-elkaar.png`))
  }
  await writeFile(join(outputDirectory, 'parity.json'), JSON.stringify({ generated: manifest.generated, metric: 'CIELAB D65 ΔE76', origin, mapRows, limits, results }, null, 2) + '\n')
  if (results.some((result) => !result.passed)) process.exitCode = 1
} finally { await browser.close() }
