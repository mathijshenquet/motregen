import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const [source, target, destination] = process.argv.slice(2)
if (!source || !target || !destination) throw new Error('Gebruik: node compare.mjs <baselinecache> <nieuwecache> <receipt.json>')
async function mediaFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isFile() && /\.(jpg|mp4)$/.test(entry.name)) files.push(entry.name)
    if (entry.isDirectory() && entry.name.endsWith('.frames')) {
      for (const name of await readdir(join(directory, entry.name))) files.push(join(entry.name, name))
    }
  }
  return files.sort()
}
const [before, after] = await Promise.all([mediaFiles(source), mediaFiles(target)])
const missingFiles = before.filter((name) => !after.includes(name))
const extraFiles = after.filter((name) => !before.includes(name))
const differences = []
for (const name of before.filter((name) => after.includes(name))) {
  const [original, current] = await Promise.all([readFile(join(source, name)), readFile(join(target, name))])
  if (!original.equals(current)) differences.push(name)
}
const receipt = { source, target, compared: before.length - missingFiles.length, missingFiles, extraFiles, differences }
await writeFile(destination, `${JSON.stringify(receipt, null, 2)}\n`)
console.log(JSON.stringify(receipt))
if (missingFiles.length || extraFiles.length || differences.length) process.exitCode = 1
