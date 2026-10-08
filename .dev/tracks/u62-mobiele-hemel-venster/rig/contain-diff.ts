// U62: verandert `contain: paint` op de scrubber iets aan het beeld? Vergelijkt twee schermbeelden pixel voor pixel.
import { chromium, devices } from '@playwright/test'
import sharp from 'sharp'
const [baseURL = 'http://127.0.0.1:4320'] = process.argv.slice(2)
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
for (const [name, options] of [['390', { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } }], ['desktop', { viewport: { width: 1280, height: 800 } }]] as const) {
  const page = await (await browser.newContext(options)).newPage()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${baseURL}/?t=%2B1u`)
  await page.getByTestId('sky').waitFor({ state: 'attached', timeout: 60_000 })
  await page.waitForTimeout(20_000)
  const slider = page.getByRole('slider', { name: 'Tijd' })
  if (await slider.getAttribute('data-playing') !== null) await slider.press(' ')
  await page.waitForTimeout(1_000)
  let shotWidth = 0, shotChannels = 0
  const shot = async () => { const { data, info } = await sharp(await page.locator('.scrubber').screenshot()).raw().toBuffer({ resolveWithObject: true }); shotWidth = info.width; shotChannels = info.channels; return data }
  const first = await shot()
  await page.waitForTimeout(300)
  const again = await shot()
  await page.addStyleTag({ content: '.scrub-surface { contain: paint; }' })
  await page.waitForTimeout(300)
  const contained = await shot()
  const differing = (left: Buffer, right: Buffer) => { let count = 0; for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) count++; return count }
  let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1, largest = 0
  for (let index = 0; index < first.length; index++) {
    const delta = Math.abs(first[index]! - contained[index]!)
    if (!delta) continue
    largest = Math.max(largest, delta)
    const pixel = Math.floor(index / shotChannels)
    minX = Math.min(minX, pixel % shotWidth); maxX = Math.max(maxX, pixel % shotWidth)
    minY = Math.min(minY, Math.floor(pixel / shotWidth)); maxY = Math.max(maxY, Math.floor(pixel / shotWidth))
  }
  console.log(`${name}: verschil in x ${minX}..${maxX}, y ${minY}..${maxY} (beeld ${shotWidth} breed), grootste kanaalverschil ${largest}`)
  console.log(`${name}: ruis tussen twee gelijke beelden ${differing(first, again)} bytes; met contain: paint ${differing(first, contained)} bytes van ${first.length}`)
}
await browser.close()
