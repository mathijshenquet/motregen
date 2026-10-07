import { createHash } from 'node:crypto'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export interface ReferenceTrace {
  traceEvents: Array<{ cat: string; name: string; ts: number; dur?: number }>
}

export function distribution(durations: number[]) {
  const sorted = [...durations].sort((left, right) => left - right)
  const percentile = (fraction: number) => sorted[Math.ceil(sorted.length * fraction) - 1] ?? null
  return {
    count: sorted.length,
    totalMs: Math.round(sorted.reduce((total, duration) => total + duration, 0) * 100) / 100,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
  }
}

export function summarizeReference(trace: ReferenceTrace) {
  const observed = trace.traceEvents.filter((event) => event.ts > 0)
  if (!observed.length) throw new Error('Opname bevat geen tijdvakken')
  const anchorUs = Math.min(...observed.map((event) => event.ts))
  const phases: Record<string, ReturnType<typeof distribution>> = {}
  const grouped = new Map<string, number[]>()
  const decodesPerSecond = Array<number>(30).fill(0)
  for (const event of observed) {
    if (event.cat !== 'motregen.phase') continue
    const durations = grouped.get(event.name) ?? []
    durations.push((event.dur ?? 0) / 1_000)
    grouped.set(event.name, durations)
    if (event.name === 'frame-decode') {
      const second = Math.floor((event.ts - anchorUs) / 1_000_000)
      if (second < decodesPerSecond.length) decodesPerSecond[second]!++
    }
  }
  for (const [phase, durations] of grouped) phases[phase] = distribution(durations)
  return { anchor: 'first-observed-event', phases, decodesPerSecond, encodedBodyBytes: null }
}

export function relativeDelta(actual: number | null, reference: number | null): number | null {
  if (actual === null || reference === null || reference === 0) return null
  return 100 * (actual - reference) / reference
}

export function fidelityComparison(actual: ReturnType<typeof summarizeReference>, reference: ReturnType<typeof summarizeReference>) {
  return Object.fromEntries(Object.entries(reference.phases).map(([phase, expected]) => {
    const measured = actual.phases[phase]
    return [phase, {
      countDeltaPercent: relativeDelta(measured?.count ?? null, expected.count),
      p50DeltaPercent: relativeDelta(measured?.p50Ms ?? null, expected.p50Ms),
      p95DeltaPercent: relativeDelta(measured?.p95Ms ?? null, expected.p95Ms),
    }]
  }))
}

function main() {
  const [chromePath, firefoxPath, pixelPath, outputPath] = process.argv.slice(2)
  if (!chromePath || !firefoxPath || !pixelPath || !outputPath) {
    throw new Error('Gebruik: tsx scripts/mobile-fidelity.ts <chrome.json> <firefox.json> <pixel.json> <uitvoer.json>')
  }
  const read = (file: string) => {
    const contents = readFileSync(file)
    return { source: basename(file), sha256: createHash('sha256').update(contents).digest('hex'), ...summarizeReference(JSON.parse(contents.toString())) }
  }
  const chrome = read(chromePath)
  const firefox = read(firefoxPath)
  const pixel = read(pixelPath)
  const report = { chrome, firefox, pixel, pixelVersusChrome: fidelityComparison(pixel, chrome) }
  mkdirSync(dirname(resolve(outputPath)), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`Getrouwheidsvergelijking: ${outputPath}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
