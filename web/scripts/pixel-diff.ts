import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

// Pixelvergelijking van de kaart tussen twee builds (track U54): beide serveren dezelfde
// synthdata (vite preview zonder MOTREGEN_DATA_ORIGIN), de stills-modus (?still=1) rendert
// exact het gevraagde tijdstip zonder wind of animatie. Meldt per tijdstip de grootste en
// gemiddelde afwijking per kanaal en schrijft een verschilbeeld.
const [before, after, outDir, mode = 'weer'] = process.argv.slice(2)
if (!before || !after || !outDir) throw new Error('usage: pnpm exec tsx scripts/pixel-diff.ts ORIGIN_VOOR ORIGIN_NA OUT_DIR [modus]')
mkdirSync(outDir, { recursive: true })
// Minuten na "nu" van het manifest: op een frame, tussen twee frames (menging + motion), en verder weg.
const offsetsMinutes = [0, 2.5, 32.5, 61, 180]
const viewports = { desktop: { width: 1100, height: 800 }, mobile: { width: 390, height: 844 } }

const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
async function shots(origin: string, label: string, viewport: { width: number; height: number }, name: string): Promise<Buffer[]> {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 })
  const page = await context.newPage()
  page.setDefaultTimeout(120_000)
  await page.goto(new URL(`/?still=1&modus=${mode}`, origin).href)
  await page.waitForFunction(() => (window as unknown as { __motregenStillMapLoaded?: () => boolean }).__motregenStillMapLoaded?.() === true)
  const now = await page.evaluate(async () => Date.parse((await (await fetch('/data/manifest.json')).json()).now))
  const images: Buffer[] = []
  for (const offset of offsetsMinutes) {
    await page.evaluate((epoch) => (window as unknown as { __motregenRenderFrame: (epoch: number) => Promise<void> }).__motregenRenderFrame(epoch), now + offset * 60_000)
    await page.waitForTimeout(400)
    const image = await page.locator('.map-shell').screenshot()
    writeFileSync(join(outDir, `${name}-${label}-${offset}.png`), image)
    images.push(image)
  }
  await context.close()
  return images
}

console.log('| beeld | tijdstip | pixels | max. afwijking | gemiddeld | pixels > 2 | pixels > 8 |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: |')
let worst = 0
for (const [name, viewport] of Object.entries(viewports)) {
  const [left, right] = [await shots(before, 'voor', viewport, name), await shots(after, 'na', viewport, name)]
  for (let index = 0; index < offsetsMinutes.length; index++) {
    const a = await sharp(left[index]).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    const b = await sharp(right[index]).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    if (a.info.width !== b.info.width || a.info.height !== b.info.height) throw new Error('Beelden verschillen in afmeting')
    const pixels = a.info.width * a.info.height
    const diff = Buffer.alloc(pixels * 3)
    let max = 0, sum = 0, over2 = 0, over8 = 0
    for (let pixel = 0; pixel < pixels; pixel++) {
      let pixelMax = 0
      for (let channel = 0; channel < 3; channel++) {
        const delta = Math.abs(a.data[pixel * 3 + channel]! - b.data[pixel * 3 + channel]!)
        sum += delta
        if (delta > pixelMax) pixelMax = delta
      }
      if (pixelMax > max) max = pixelMax
      if (pixelMax > 2) over2++
      if (pixelMax > 8) over8++
      // Versterkt, zodat ook kleine afwijkingen in het verschilbeeld te zien zijn.
      diff.fill(Math.min(255, pixelMax * 16), pixel * 3, pixel * 3 + 3)
    }
    await sharp(diff, { raw: { width: a.info.width, height: a.info.height, channels: 3 } }).png().toFile(join(outDir, `${name}-verschil-${offsetsMinutes[index]}.png`))
    worst = Math.max(worst, max)
    console.log(`| ${name} | +${offsetsMinutes[index]} min | ${pixels} | ${max} | ${(sum / pixels / 3).toFixed(4)} | ${over2} | ${over8} |`)
  }
}
await browser.close()
console.log(`\nGrootste afwijking: ${worst} van 255. Beelden: ${outDir}`)
