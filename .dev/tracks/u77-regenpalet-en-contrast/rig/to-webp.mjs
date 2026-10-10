// U77: de PNG's uit out/ als WebP (kwaliteit 92) naar beelden/; verliesvrij is tientallen MB.
// Gebruik (vanuit web/): node tmp/u77/to-webp.mjs <doelmap> <bestand.png>...
import { basename } from 'node:path'
import sharp from 'sharp'
const [targetDir, ...files] = process.argv.slice(2)
for (const file of files) {
  const target = `${targetDir}/${basename(file, '.png')}.webp`
  await sharp(file).webp({ quality: 92 }).toFile(target)
  console.log(target)
}
