import { readFileSync } from 'node:fs'
import sharp from 'sharp'

const droplet = await sharp(readFileSync(new URL('../public/droplet.svg', import.meta.url)))
  .resize(512, 512)
  .png()
  .toBuffer()
const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><defs><radialGradient id="sky" cx="50%" cy="35%" r="75%"><stop stop-color="#142d3b"/><stop offset="1" stop-color="#08151c"/></radialGradient></defs><rect width="640" height="640" fill="url(#sky)"/></svg>`)

await sharp(background)
  .composite([{ input: droplet, left: 64, top: 64 }])
  .png()
  .toFile(new URL('../brand-assets/motregen.nl/telegram-avatar.png', import.meta.url).pathname)
