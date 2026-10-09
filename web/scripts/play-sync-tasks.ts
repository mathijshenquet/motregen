import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSourceMapResolver } from './prof-source-map'

interface Script {
  duration: number
  sourceURL: string
  sourceFunctionName: string
  sourceCharPosition: number
  invoker: string
}

interface Capture {
  profile: string
  screenshotOverhead: boolean
  cpuProfile: boolean
  snapshot: { firstCursorMs: number }
  rawLongFrames: Array<{ startTime: number; duration: number; renderStart: number; scripts: Script[] }>
}

const [directory, referenceDist, candidateDist, output] = process.argv.slice(2)
if (!directory || !referenceDist || !candidateDist || !output) throw new Error('Gebruik: play-sync-tasks.ts CAPTUREMAP REFERENTIEDIST KANDIDAATDIST UITVOER.json')
const resolvers = { reference: createSourceMapResolver(referenceDist), candidate: createSourceMapResolver(candidateDist) }
const rounded = (value: number) => Math.round(value * 10) / 10
const runs = readdirSync(directory).filter(name => name.endsWith('.json')).flatMap(name => {
  const capture = JSON.parse(readFileSync(join(directory, name), 'utf8')) as Capture
  if (capture.cpuProfile || capture.screenshotOverhead) return []
  const side = name.includes('-reference-') ? 'reference' : 'candidate'
  const dist = side === 'reference' ? referenceDist : candidateDist
  const clock = capture.snapshot.firstCursorMs
  return [{ name, profile: capture.profile, side, frames: capture.rawLongFrames
    .filter(frame => frame.duration > 100 && frame.startTime + frame.duration > clock && frame.startTime < clock + 5_000)
    .map(frame => ({
      startAfterClockMs: rounded(frame.startTime - clock), durationMs: rounded(frame.duration),
      beforeRenderMs: rounded(frame.renderStart - frame.startTime),
      renderingMs: rounded(frame.startTime + frame.duration - frame.renderStart),
      scripts: frame.scripts.map(script => {
        const frame = { functionName: script.sourceFunctionName || script.invoker, url: script.sourceURL, lineNumber: -1, columnNumber: -1 }
        if (script.sourceURL.endsWith('.js') && script.sourceCharPosition >= 0) {
          const before = readFileSync(join(dist, new URL(script.sourceURL).pathname), 'utf8').slice(0, script.sourceCharPosition).split('\n')
          frame.lineNumber = before.length - 1
          frame.columnNumber = before.at(-1)!.length
        }
        const source = resolvers[side](frame)
        return { durationMs: rounded(script.duration), invoker: script.invoker, functionName: source.functionName, source: source.url, line: source.lineNumber < 0 ? null : source.lineNumber + 1 }
      }),
    })) }]
})
writeFileSync(output, JSON.stringify({ window: 'Frames >100 ms die de eerste 5 s vanaf klokstart overlappen; scriptduur is geen duur van de volledige frame.', runs }, null, 2))
for (const run of runs.filter(run => run.side === 'candidate')) {
  console.log(run.name)
  for (const frame of run.frames) {
    console.log(`  +${frame.startAfterClockMs} ms: LoAF ${frame.durationMs} ms; vóór render ${frame.beforeRenderMs} ms`)
    for (const script of frame.scripts) console.log(`    ${script.functionName}: ${script.durationMs} ms · ${script.source}:${script.line ?? '?'} (${script.invoker})`)
  }
}
