import sharp from 'sharp'

// Vergelijkingsblad (U107): afbeeldingen in een raster met een kop per kolom en een label per rij.
// usage: pnpm exec tsx scripts/kaartstijl-sheet.ts UIT.jpg BREEDTE "kolom1|kolom2" "rij1=pad1|pad2" "rij2=pad3|pad4" …
//   BREEDTE is de breedte per tegel in px; ontbrekende paden (-) blijven leeg.
const [output, widthText, header, ...rows] = process.argv.slice(2)
if (!output || !widthText || !header || !rows.length) throw new Error('usage: kaartstijl-sheet.ts UIT BREEDTE KOPPEN RIJ…')
const tileWidth = Number(widthText)
const columns = header.split('|')
const parsed = rows.map((row) => {
  const [label, paths] = row.split('=')
  return { label: label!, paths: paths!.split('|') }
})
const metadata = await Promise.all(parsed.flatMap((row) => row.paths.filter((path) => path !== '-').map((path) => sharp(path).metadata())))
const tileHeight = Math.round(Math.max(...metadata.map((meta) => tileWidth * meta.height! / meta.width!)))
const gutter = 12, headerHeight = 40, labelWidth = 150
const width = labelWidth + columns.length * (tileWidth + gutter) + gutter
const height = headerHeight + parsed.length * (tileHeight + gutter) + gutter
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const text = (value: string, x: number, y: number, size: number, anchor = 'start') => `<text x="${x}" y="${y}" font-family="Noto Sans, sans-serif" font-size="${size}" fill="#102630" text-anchor="${anchor}">${escape(value)}</text>`
const labels = [
  ...columns.map((column, index) => text(column, labelWidth + gutter + index * (tileWidth + gutter) + tileWidth / 2, 28, 22, 'middle')),
  ...parsed.flatMap((row, index) => row.label.split('\\n').map((line, lineIndex) => text(line, 12, headerHeight + index * (tileHeight + gutter) + 34 + lineIndex * 24, 18))),
]
const tiles = await Promise.all(parsed.flatMap((row, rowIndex) => row.paths.map(async (path, columnIndex) => {
  if (path === '-') return undefined
  const input = await sharp(path).resize({ width: tileWidth }).toBuffer()
  return { input, left: labelWidth + gutter + columnIndex * (tileWidth + gutter), top: headerHeight + rowIndex * (tileHeight + gutter) }
})))
await sharp({ create: { width, height, channels: 3, background: '#eef3f5' } })
  .composite([...tiles.filter((tile) => tile !== undefined), { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${labels.join('')}</svg>`), left: 0, top: 0 }])
  .jpeg({ quality: 84 })
  .toFile(output)
console.log('blad', output, `${width}×${height}`)
