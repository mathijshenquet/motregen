import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import sharp, { type OverlayOptions } from 'sharp'
import type { PerfMeasure, PerfSnapshot } from '../src/core/perf'

interface Filmstrip {
  profile: string
  snapshot: PerfSnapshot
  shots: Array<{ targetMs: number; frameMs: number | null; sample?: { ms: number; cursorIndex?: string; rainCursor?: string; mapStart?: string; tilesLoaded?: string }; rainDraw?: PerfMeasure }>
}

const [referencePath, candidatePath, output] = process.argv.slice(2)
if (!referencePath || !candidatePath || !output) throw new Error('Gebruik: play-sync-filmstrip.ts REFERENTIEPREFIX KANDIDAATPREFIX UITVOER.jpg')
const captures = [referencePath, candidatePath].map((prefix) => ({ prefix, capture: JSON.parse(readFileSync(`${prefix}.json`, 'utf8')) as Filmstrip }))
const thumbnailWidth = captures[0]!.capture.profile === 'desktop' ? 240 : 180
const thumbnailHeight = captures[0]!.capture.profile === 'desktop' ? 150 : 390
const labelHeight = 64
const columns = 6
const rows = Math.ceil(captures[0]!.capture.shots.length / columns) * 2
const composites: OverlayOptions[] = []
const number = (value: number | undefined | null) => value == null ? '—' : String(Math.round(value))
for (const [variant, { prefix, capture }] of captures.entries()) {
  for (const [index, shot] of capture.shots.entries()) {
    const imagePath = `${prefix}/${String(index).padStart(2, '0')}.jpg`
    const left = index % columns * thumbnailWidth
    const top = (Math.floor(index / columns) * 2 + variant) * (thumbnailHeight + labelHeight)
    if (existsSync(imagePath)) composites.push({ input: await sharp(imagePath).resize(thumbnailWidth, thumbnailHeight, { fit: 'contain', background: '#f4f4f4' }).toBuffer(), left, top })
    const label = [
      `${variant === 0 ? 'A' : 'B'} doel ${shot.targetMs} / beeld ${number(shot.frameMs)} ms`,
      `sample ${number(shot.sample?.ms)} ms · klok ${shot.sample?.cursorIndex ?? '—'}`,
      `regen ${Number(shot.sample?.rainCursor ?? NaN).toFixed(2)} · ${shot.sample?.mapStart ?? '—'}`,
      `tegels ${shot.sample?.tilesLoaded ?? '—'}`,
    ]
    const text = label.map((line, row) => `<text x="5" y="${14 + row * 14}" font-size="11">${line}</text>`).join('')
    composites.push({ input: Buffer.from(`<svg width="${thumbnailWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><g font-family="sans-serif">${text}</g></svg>`), left, top: top + thumbnailHeight })
  }
}
mkdirSync(dirname(output), { recursive: true })
await sharp({ create: { width: thumbnailWidth * columns, height: (thumbnailHeight + labelHeight) * rows, channels: 3, background: 'white' } }).composite(composites).jpeg({ quality: 85 }).toFile(output)
writeFileSync(output.replace(/\.jpg$/, '.json'), JSON.stringify(captures.map(({ capture }) => capture), null, 2))
console.log(output)
