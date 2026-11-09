// U108 diagram: effenen van een 8-bit maskerraster (GeoTIFF) naar PNG met wereldbestand, voor gdal_contour.
// MODUS `glad` (standaard): alleen Gauss-vervagen met σ. `open:R`: morfologisch openen (eroderen, dan dilateren) met
// straal-σ R, daarna vervagen met σ: vormen smaller dan ~2,6R verdwijnen, de rest krimpt niet (eilanden in water
// blijven). `sluit:R`: omgekeerd (dilateren, dan eroderen): nabije vlekken groeien samen, gaten < ~2,6R dicht.
// Eroderen = vervagen en drempel op 80 %, dilateren = drempel op 20 % (Φ(±0,84) = 0,8/0,2: beide ≈ 0,84R ver).
// Gebruik (vanuit web/): node --import tsx ../tools/basemap/blur.mts IN.tif UIT.png SIGMA_PX MINX MAXY RESOLUTIE [MODUS]
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const require = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), '../../web/package.json'))
const sharp = require('sharp')
sharp.cache(false)

const [input, output, sigmaText, minXText, maxYText, resolutionText, mode = 'glad'] = process.argv.slice(2)
if (!input || !output || !sigmaText || !minXText || !maxYText || !resolutionText) throw new Error('Gebruik: blur.mts IN.tif UIT.png SIGMA_PX MINX MAXY RESOLUTIE [MODUS]')
const sigma = Number(sigmaText), resolution = Number(resolutionText)
const ERODE = 204, DILATE = 51
// sharp weigert sigma < 0,3; daaronder is vervagen op dit raster toch een no-op.
const blur = (image: ReturnType<typeof sharp>, amount: number) => amount >= 0.3 ? image.blur(amount) : image
// Twee aparte sharp-stappen: binnen één pijplijn past sharp de drempel vóór het vervagen toe, wat de code ook zegt.
const step = async (data: Buffer, amount: number, level: number) => {
  const blurred = await blur(sharp(data, { limitInputPixels: false }), amount).toColourspace('b-w').png({ compressionLevel: 1 }).toBuffer()
  return sharp(blurred, { limitInputPixels: false }).threshold(level).toColourspace('b-w').png({ compressionLevel: 1 }).toBuffer()
}

let mask: Buffer = await sharp(input, { limitInputPixels: false }).extractChannel(0).toColourspace('b-w').png({ compressionLevel: 1 }).toBuffer()
const [kind, radiusText] = mode.split(':')
const radius = Number(radiusText)
if (kind === 'open') mask = await step(await step(mask, radius, ERODE), radius, DILATE)
else if (kind === 'sluit') mask = await step(await step(mask, radius, DILATE), radius, ERODE)
else if (kind !== 'glad') throw new Error(`Onbekende modus ${mode}`)
await blur(sharp(mask, { limitInputPixels: false }), sigma).toColourspace('b-w').png({ compressionLevel: 1 }).toFile(output)
// Wereldbestand: pixelgrootte, rotaties, midden van de linkerbovenpixel.
writeFileSync(output.replace(/\.png$/, '.pgw'), [resolution, 0, 0, -resolution, Number(minXText) + resolution / 2, Number(maxYText) - resolution / 2].join('\n') + '\n')
