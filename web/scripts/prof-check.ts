import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

interface EventLike {
  name?: unknown
  ph?: unknown
  pid?: unknown
  tid?: unknown
  ts?: unknown
  dur?: unknown
  id?: unknown
  args?: { data?: { cpuProfile?: { nodes?: Array<{ id?: unknown; callFrame?: unknown }>; samples?: unknown[] }; timeDeltas?: unknown[] } }
}

export function validateChromeTrace(value: unknown): { events: number; measures: number; samples: number } {
  if (!isRecord(value) || !Array.isArray(value.traceEvents)) throw new Error('traceEvents ontbreekt of is geen array')
  const events = value.traceEvents as EventLike[]
  let measures = 0, samples = 0
  const profiles = new Set<string>()
  const chunks = new Set<string>()
  for (const [index, event] of events.entries()) {
    if (typeof event !== 'object' || event === null || typeof event.name !== 'string' || !['M', 'P', 'X'].includes(String(event.ph))) throw new Error(`event ${index}: ongeldige naam of fase`)
    for (const field of ['pid', 'tid', 'ts'] as const) if (!finite(event[field])) throw new Error(`event ${index}: ${field} is niet eindig`)
    if (event.ph === 'X') {
      if (!finite(event.dur) || Number(event.dur) < 0) throw new Error(`event ${index}: ongeldige duur`)
      measures++
    }
    if (event.name === 'Profile') profiles.add(profileKey(event))
    if (event.name === 'ProfileChunk') {
      chunks.add(profileKey(event))
      const cpu = event.args?.data?.cpuProfile
      const deltas = event.args?.data?.timeDeltas
      if (!cpu || !Array.isArray(cpu.nodes) || !Array.isArray(cpu.samples) || !Array.isArray(deltas)) throw new Error(`event ${index}: onvolledige ProfileChunk`)
      if (cpu.samples.length !== deltas.length) throw new Error(`event ${index}: samples en timeDeltas verschillen`)
      const nodeIds = new Set(cpu.nodes.map((node) => {
        if (!finite(node.id) || !isRecord(node.callFrame)) throw new Error(`event ${index}: ongeldige profielnode`)
        return Number(node.id)
      }))
      for (const sample of cpu.samples) if (!finite(sample) || !nodeIds.has(Number(sample))) throw new Error(`event ${index}: sample verwijst niet naar een node`)
      for (const delta of deltas) if (!finite(delta) || Number(delta) < 0) throw new Error(`event ${index}: ongeldige timeDelta`)
      samples += cpu.samples.length
    }
  }
  for (const key of chunks) if (!profiles.has(key)) throw new Error(`ProfileChunk ${key} heeft geen Profile-kop`)
  return { events: events.length, measures, samples }
}

function profileKey(event: EventLike): string {
  if (typeof event.id !== 'string' && typeof event.id !== 'number') throw new Error(`${String(event.name)} mist id`)
  return `${String(event.pid)}:${String(event.id)}`
}

function finite(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  const file = process.argv[2]
  if (!file) throw new Error('Gebruik: pnpm prof:check <profiel.json>')
  const result = validateChromeTrace(JSON.parse(readFileSync(file, 'utf8')))
  console.log(`geldig Chrome-traceprofiel: ${result.events} events, ${result.measures} tijdvakken, ${result.samples} samples`)
}
