import sharp, { type OverlayOptions } from 'sharp'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

// U108: vergelijkingsbladen uit de beelden van basemap-variant-shots.ts en de botstills. Per variant één blad
// (rijen zoom 6/7/8/10 + Gevoel/Wind + bot; kolommen telefoon/desktop × licht/donker) en per zoom één strook met
// alle varianten naast elkaar. Met CLOSEUPS_DIR ook blad-closeups.png: per plek en zoom een rij, per variant een kolom.
// Gebruik: pnpm exec tsx scripts/basemap-variant-sheet.ts SHOTS_DIR OUT_DIR [BOT_DIR] [CLOSEUPS_DIR]
const [shots, out, bot, closeups] = process.argv.slice(2)
if (!shots || !out) throw new Error('usage: pnpm exec tsx scripts/basemap-variant-sheet.ts SHOTS_DIR OUT_DIR [BOT_DIR]')
mkdirSync(out, { recursive: true })
const VARIANTS = (process.env.MOTREGEN_KAART_VARIANTEN ?? 'nu strak diagram diagram-wegen').split(' ')
const CELL = 420
const GAP = 6
const LABEL = 30

const label = (text: string, width: number) => Buffer.from(
  `<svg width="${width}" height="${LABEL}"><rect width="100%" height="100%" fill="#1d2529"/><text x="10" y="21" font-family="sans-serif" font-size="17" fill="#fff">${text}</text></svg>`,
)

async function cell(path: string, height: number): Promise<Buffer> {
  if (!existsSync(path)) return sharp({ create: { width: CELL, height, channels: 3, background: '#bbb' } }).png().toBuffer()
  return sharp(path).resize({ width: CELL, height, fit: 'cover', position: 'centre' }).png().toBuffer()
}

async function grid(rows: Array<{ title: string; paths: string[]; height: number }>, columns: string[], file: string) {
  const width = columns.length * (CELL + GAP)
  const height = rows.reduce((sum, row) => sum + LABEL + row.height + GAP, LABEL)
  const layers: OverlayOptions[] = columns.map((title, index) => ({ input: label(title, CELL), left: index * (CELL + GAP), top: 0 }))
  let top = LABEL
  for (const row of rows) {
    layers.push({ input: label(row.title, width), left: 0, top })
    top += LABEL
    const images = await Promise.all(row.paths.map((path) => cell(path, row.height)))
    images.forEach((input, index) => layers.push({ input, left: index * (CELL + GAP), top }))
    top += row.height + GAP
  }
  await sharp({ create: { width, height, channels: 3, background: '#8a8f92' } }).composite(layers).png().toFile(join(out, file))
  console.log(join(out, file))
}

const COLUMNS = ['telefoon licht', 'telefoon donker', 'desktop licht', 'desktop donker']
const HEIGHTS = { telefoon: 640, desktop: 640 }
for (const variant of VARIANTS) {
  const rows = [6, 7, 8, 10].map((zoom) => ({
    title: `${variant} · zoom ${zoom}${zoom === 10 ? ' (telefoon: max ≈ 9,8)' : ''}`,
    height: HEIGHTS.desktop,
    paths: ['telefoon-light', 'telefoon-dark', 'desktop-light', 'desktop-dark'].map((key) => join(shots, `${variant}-${key}-z${zoom}.png`)),
  }))
  for (const zoom of [7, 8]) rows.push({
    title: `${variant} · zoom ${zoom} · Wadden`,
    height: HEIGHTS.desktop,
    paths: ['telefoon-light', 'telefoon-dark', 'desktop-light', 'desktop-dark'].map((key) => join(shots, `${variant}-${key}-z${zoom}-wadden.png`)),
  })
  rows.push({
    title: `${variant} · zoom 7 · Gevoel en Wind (desktop)`,
    height: HEIGHTS.desktop,
    paths: ['light-z7-gevoel', 'dark-z7-gevoel', 'light-z7-wind', 'dark-z7-wind'].map((key) => join(shots, `${variant}-desktop-${key}.png`)),
  })
  if (bot) rows.push({
    title: `${variant} · bot (Rust): weer en wind, licht/donker`,
    height: 535,
    paths: ['weather-light', 'weather-dark', 'wind-light', 'wind-dark'].map((key) => join(bot, `${variant}-${key}.png`)),
  })
  await grid(rows, COLUMNS, `blad-${variant}.png`)
}
for (const key of ['telefoon-light-z6', 'telefoon-light-z7', 'telefoon-dark-z7', 'desktop-light-z7', 'desktop-light-z8', 'desktop-dark-z8', 'desktop-light-z10', 'telefoon-light-z7-wadden', 'desktop-light-z8-wadden', 'desktop-dark-z8-wadden', 'desktop-light-z7-gevoel', 'desktop-dark-z7-wind']) {
  await grid([{ title: key, height: 640, paths: VARIANTS.map((variant) => join(shots, `${variant}-${key}.png`)) }], VARIANTS, `strook-${key}.png`)
}

if (closeups) {
  const { readdirSync } = await import('node:fs')
  const keys = [...new Set(readdirSync(closeups).map((file) => file.match(/-desktop-light-(z\d+-[a-z]+)\.png$/)?.[1]).filter((key): key is string => Boolean(key)))]
  keys.sort((a, b) => a.split('-')[1]!.localeCompare(b.split('-')[1]!) || Number(a.slice(1).split('-')[0]) - Number(b.slice(1).split('-')[0]))
  const columns = VARIANTS.filter((variant) => keys.some((key) => existsSync(join(closeups, `${variant}-desktop-light-${key}.png`))))
  await grid(keys.map((key) => ({ title: key.replace('-', ' · '), height: 400, paths: columns.map((variant) => join(closeups, `${variant}-desktop-light-${key}.png`)) })), columns, 'blad-closeups.png')
}
