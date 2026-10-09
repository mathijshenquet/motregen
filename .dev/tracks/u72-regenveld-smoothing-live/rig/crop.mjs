import sharp from 'sharp'
const [file, out, left, top, width, height, scale = '3'] = process.argv.slice(2)
await sharp(file).extract({ left: +left, top: +top, width: +width, height: +height }).resize({ width: +width * +scale, kernel: 'nearest' }).png().toFile(out)
