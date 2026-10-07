import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { decompress } from 'fzstd'

interface ManifestChunk {
  url: string
  field: string
}

interface Manifest {
  chunks: ManifestChunk[]
}

interface Frame {
  offset: number
  len: number
}

interface Header {
  frames: Frame[]
}

interface ParsedMrf {
  header: Header
  headerLength: number
}

interface Member {
  bytes: Uint8Array
  url: string
}

const fields = [
  ['regen', 'rain_rate'],
  ['temperatuur', 'temp_c'],
  ['wind', 'wind_u_ms'],
  ['wolken', 'cloud_low'],
] as const

const samples = 50
const warmupSamples = 10
const specifiedDirectories = process.argv.slice(2)
if (specifiedDirectories.length > 2) throw new Error('Gebruik: tsx scripts/bench-zstd-content-size.ts <voor-data> [na-data]')
const dataDirectories = (specifiedDirectories.length === 0 ? ['.'] : specifiedDirectories).map((directory) => resolve(directory))

function parseHeader(chunk: Uint8Array): ParsedMrf {
  if (new TextDecoder().decode(chunk.subarray(0, 4)) !== 'mrf0') throw new Error('Ongeldige mrf-magic')
  const headerLength = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength).getUint32(4, true)
  return {
    header: JSON.parse(new TextDecoder().decode(chunk.subarray(8, 8 + headerLength))) as Header,
    headerLength: 8 + headerLength,
  }
}

function median(values: number[]): number {
  const ordered = [...values].sort((left, right) => left - right)
  return (ordered[samples / 2 - 1]! + ordered[samples / 2]!) / 2
}

async function loadMember(dataDirectory: string, field: string): Promise<Member> {
  const manifest = JSON.parse(await readFile(resolve(dataDirectory, 'manifest.json'), 'utf8')) as Manifest
  const manifestChunk = manifest.chunks.find((chunk) => chunk.field === field)
  if (!manifestChunk) throw new Error(`Geen ${field}-chunk in manifest`)
  const chunk = new Uint8Array(await readFile(resolve(dataDirectory, manifestChunk.url)))
  const { header, headerLength } = parseHeader(chunk)
  const frame = header.frames[0]
  if (!frame) throw new Error(`${manifestChunk.url} heeft geen frames`)
  return {
    bytes: chunk.slice(headerLength + frame.offset, headerLength + frame.offset + frame.len),
    url: manifestChunk.url,
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

console.log(`fzstd: ${warmupSamples} warm-up + ${samples} decodes per eerste frame`)
console.log(dataDirectories.join(' ↔ '))
console.log(dataDirectories.length === 1
  ? 'veld\tmember B\tuit B\tp50 ms'
  : 'veld\tmember B (voor→na)\tuit B\tp50 ms (voor→na)\tversnelling')

for (const [label, field] of fields) {
  const members = await Promise.all(dataDirectories.map((dataDirectory) => loadMember(dataDirectory, field)))
  const warmed = members.map(({ bytes }) => decompress(bytes))
  for (let index = 1; index < warmed.length; index++) {
    if (!sameBytes(warmed[0]!, warmed[index]!)) throw new Error(`${field} decodeert niet byte-identiek (${members[0]!.url} ↔ ${members[index]!.url})`)
  }
  for (let index = 0; index < warmupSamples; index++) for (const { bytes } of members) decompress(bytes)
  const timings = members.map(() => [] as number[])
  let decodedBytes = 0
  for (let sample = 0; sample < samples; sample++) {
    const order = sample % 2 === 0 ? members.keys() : [...members.keys()].reverse().values()
    for (const index of order) {
      const started = performance.now()
      decodedBytes += decompress(members[index]!.bytes).byteLength
      timings[index]!.push(performance.now() - started)
    }
  }
  if (decodedBytes === 0) throw new Error('Geen bytes gedecodeerd')
  const p50 = timings.map(median)
  if (members.length === 1) {
    console.log(`${label}\t${members[0]!.bytes.byteLength}\t${warmed[0]!.byteLength}\t${p50[0]!.toFixed(3)}`)
  } else {
    console.log(`${label}\t${members.map(({ bytes }) => bytes.byteLength).join('→')}\t${warmed[0]!.byteLength}\t${p50.map((value) => value.toFixed(3)).join('→')}\t${(p50[0]! / p50[1]!).toFixed(2)}×`)
  }
}
