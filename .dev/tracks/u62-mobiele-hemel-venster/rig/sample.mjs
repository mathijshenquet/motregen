// U62: kleur van de hemel op dezelfde uurstops in de voor/na-schermbeelden van repro.ts.
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
const label = process.argv[2]
const data = JSON.parse(readFileSync(new URL(`./out/${label}.json`, import.meta.url)))
for (const [name, reading] of [['voor', data.before], ['na', data.after]]) {
  const image = sharp(new URL(`./out/${label}-${name}.png`, import.meta.url).pathname)
  const { width } = await image.metadata()
  const { data: pixels, info } = await image.raw().toBuffer({ resolveWithObject: true })
  const scale = width / 390
  console.log(name)
  for (const stop of reading.stops) {
    const screenX = stop.x + reading.trackOffsetPx
    if (screenX < 5 || screenX > 385) continue
    const colours = [1400, 1600, 1850].map((y) => {
      const index = (y * info.width + Math.round(screenX * scale)) * info.channels
      return `${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`
    })
    console.log(`  x=${stop.x.toFixed(1)} donker=${stop.dark} dag=${stop.day} kleur ${colours.join(' | ')}`)
  }
}
