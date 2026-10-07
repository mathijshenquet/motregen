import { chunkField, type Field, type Manifest, type ManifestChunk, type MrfHeader } from '../../web/src/core/contract'
import { decodeFrame, parseMrfHeader } from '../../web/src/core/mrf'

const fields = ['cloud_low', 'cloud_mid', 'cloud_high', 'cloud_frac', 'radiation'] as const satisfies readonly Field[]
type SampleField = typeof fields[number]

interface Candidate {
  chunk: ManifestChunk
  frameIndex: number
  epoch: number
}

interface Options {
  manifest: string
  at: number
  latitude: number
  longitude: number
}

function argumentsFrom(commandLine: string[]): Options {
  const values = new Map<string, string>()
  for (let index = 0; index < commandLine.length; index += 2) {
    const key = commandLine[index]
    const value = commandLine[index + 1]
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Ongeldig argument bij ${key ?? 'einde'}`)
    values.set(key.slice(2), value)
  }
  const manifest = values.get('manifest')
  const at = Date.parse(values.get('at') ?? '')
  const latitude = Number(values.get('latitude'))
  const longitude = Number(values.get('longitude'))
  if (!manifest || !Number.isFinite(at) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('Gebruik --manifest --at --latitude --longitude')
  return { manifest, at, latitude, longitude }
}

async function fetchBytes(url: string, start: number, end: number): Promise<Uint8Array> {
  const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (response.status === 200) {
    if (bytes.length <= end) throw new Error(`${url}: volledig antwoord te kort`)
    return bytes.slice(start, end + 1)
  }
  if (bytes.length !== end - start + 1) throw new Error(`${url}: Range heeft ${bytes.length} bytes; verwacht ${end - start + 1}`)
  return bytes
}

function timelines(manifest: Manifest): Map<SampleField, Map<number, Candidate>> {
  const result = new Map<SampleField, Map<number, Candidate>>(fields.map((field) => [field, new Map()]))
  for (const chunk of manifest.chunks) {
    const field = chunkField(chunk)
    if (chunk.source !== 'harmonie' || !fields.includes(field as SampleField)) continue
    const entries = result.get(field as SampleField)!
    chunk.times.forEach((time, frameIndex) => {
      const epoch = Date.parse(time)
      const existing = entries.get(epoch)
      if (!existing || Date.parse(chunk.run) > Date.parse(existing.chunk.run)) entries.set(epoch, { chunk, frameIndex, epoch })
    })
  }
  return result
}

function sharedCandidates(byField: Map<SampleField, Map<number, Candidate>>): Candidate[] {
  return [...byField.get('cloud_low')!.values()]
    .filter(({ epoch }) => fields.every((field) => byField.get(field)!.has(epoch)))
    .sort((left, right) => left.epoch - right.epoch)
}

async function sample(candidate: Candidate, field: SampleField, manifestUrl: string, longitude: number, latitude: number): Promise<number | null> {
  const chunk = candidate.chunk.field === field ? candidate.chunk : undefined
  if (!chunk) throw new Error(`Interne veldmismatch voor ${field}`)
  const url = new URL(chunk.url, manifestUrl).href
  const headerBytes = await fetchBytes(url, 0, chunk.header_len - 1)
  const header = parseMrfHeader(headerBytes)
  validateHeader(header, chunk, field)
  const index = header.frames[candidate.frameIndex]
  if (!index) throw new Error(`Frame ${candidate.frameIndex} ontbreekt voor ${field}`)
  const compressed = await fetchBytes(url, chunk.header_len + index.offset, chunk.header_len + index.offset + index.len - 1)
  const decoded = decodeFrame(compressed, header.grid.width * header.grid.height, header.pred ? { width: header.grid.width, height: header.grid.height } : undefined)
  const [x, y] = project(longitude, latitude)
  const column = Math.floor((x - header.grid.x0) / header.grid.dx)
  const row = Math.floor((y - header.grid.y0) / header.grid.dy)
  if (column < 0 || row < 0 || column >= header.grid.width || row >= header.grid.height) throw new Error(`De Bilt valt buiten ${field}`)
  return header.quant[decoded[row * header.grid.width + column]!] ?? null
}

function validateHeader(header: MrfHeader, chunk: ManifestChunk, field: SampleField): void {
  if (chunkField(header) !== field || header.run !== chunk.run) throw new Error(`MRF-header wijkt af voor ${field}`)
}

function project(longitude: number, latitude: number): [number, number] {
  const radius = 6_378_137
  return [longitude * Math.PI / 180 * radius, Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)) * radius]
}

async function main(): Promise<void> {
  const options = argumentsFrom(process.argv.slice(2))
  const response = await fetch(options.manifest, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Manifest: HTTP ${response.status}`)
  const manifest = await response.json() as Manifest
  const byField = timelines(manifest)
  const common = sharedCandidates(byField)
  const output = await Promise.all(Array.from({ length: 7 }, async (_, horizonHours) => {
    const target = options.at + horizonHours * 3_600_000
    const reference = common.reduce<Candidate | undefined>((nearest, candidate) =>
      nearest === undefined || Math.abs(candidate.epoch - target) < Math.abs(nearest.epoch - target) ? candidate : nearest, undefined)
    if (!reference || Math.abs(reference.epoch - target) > 3_600_000) throw new Error(`Geen modeluur binnen 1 uur voor horizon +${horizonHours}`)
    const values = Object.fromEntries(await Promise.all(fields.map(async (field) => {
      const candidate = byField.get(field)!.get(reference.epoch)!
      return [field, await sample(candidate, field, options.manifest, options.longitude, options.latitude)]
    })))
    return {
      horizonHours,
      targetAt: new Date(target).toISOString(),
      validAt: new Date(reference.epoch).toISOString(),
      runAt: reference.chunk.run,
      forecastLeadHours: (reference.epoch - Date.parse(reference.chunk.run)) / 3_600_000,
      validOffsetMinutes: (reference.epoch - target) / 60_000,
      ...values,
    }
  }))
  process.stdout.write(`${JSON.stringify(output)}\n`)
}

void main().catch((error: unknown) => {
  process.stderr.write(`Modelsampler mislukt: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
