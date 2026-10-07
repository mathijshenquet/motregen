import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createSourceMapResolver, type ProfileCallFrame } from './prof-source-map'

interface ProfileNode {
  id: number
  callFrame: ProfileCallFrame
  children?: number[]
  parent?: number
}

interface ProfileChunk {
  name: string
  pid: number
  tid: number
  id: string | number
  args?: { data?: { cpuProfile?: { nodes?: ProfileNode[]; samples?: number[] }; timeDeltas?: number[] } }
}

export interface FunctionTime {
  functionName: string
  url: string
  lineNumber: number
  columnNumber: number
  selfSamples: number
  selfMs: number
  stackSamples: number
  stackMs: number
}

export function profileTop(trace: { traceEvents: ProfileChunk[] }, resolveFrame = (frame: ProfileCallFrame) => frame) {
  const profiles = new Map<string, ProfileChunk[]>()
  for (const event of trace.traceEvents) {
    if (event.name !== 'ProfileChunk') continue
    const key = `${event.pid}:${event.tid}:${event.id}`
    const chunks = profiles.get(key) ?? []
    chunks.push(event)
    profiles.set(key, chunks)
  }
  const functions = new Map<string, FunctionTime>()
  let samples = 0
  let sampledMs = 0
  for (const chunks of profiles.values()) {
    const nodes = new Map<number, ProfileNode>()
    const parents = new Map<number, number>()
    for (const chunk of chunks) {
      for (const node of chunk.args?.data?.cpuProfile?.nodes ?? []) {
        nodes.set(node.id, { ...node, callFrame: resolveFrame(node.callFrame) })
        if (node.parent !== undefined) parents.set(node.id, node.parent)
        for (const child of node.children ?? []) parents.set(child, node.id)
      }
    }
    for (const chunk of chunks) {
      const cpuSamples = chunk.args?.data?.cpuProfile?.samples ?? []
      const deltas = chunk.args?.data?.timeDeltas ?? []
      if (cpuSamples.length !== deltas.length) throw new Error('samples en timeDeltas verschillen')
      for (const [index, sample] of cpuSamples.entries()) {
        const durationMs = deltas[index]! / 1_000
        if (!Number.isFinite(durationMs) || durationMs < 0) throw new Error('ongeldige timeDelta')
        samples++
        sampledMs += durationMs
        let nodeId: number | undefined = sample
        const visitedNodes = new Set<number>()
        const visitedFunctions = new Set<string>()
        while (nodeId !== undefined) {
          if (visitedNodes.has(nodeId)) throw new Error('cyclus in profielstack')
          visitedNodes.add(nodeId)
          const node = nodes.get(nodeId)
          if (!node) throw new Error(`sample verwijst naar ontbrekende node ${nodeId}`)
          const frame = node.callFrame
          const key = JSON.stringify([frame.functionName, frame.url, frame.lineNumber, frame.columnNumber])
          let entry = functions.get(key)
          if (!entry) {
            entry = { ...frame, selfSamples: 0, selfMs: 0, stackSamples: 0, stackMs: 0 }
            functions.set(key, entry)
          }
          if (nodeId === sample) {
            entry.selfSamples++
            entry.selfMs += durationMs
          }
          if (!visitedFunctions.has(key)) {
            entry.stackSamples++
            entry.stackMs += durationMs
            visitedFunctions.add(key)
          }
          nodeId = parents.get(nodeId)
        }
      }
    }
  }
  return { samples, sampledMs, functions: [...functions.values()].sort((left, right) => right.selfMs - left.selfMs) }
}

export function parseProfileTopArgs(args: string[]) {
  const positional: string[] = []
  let dist: string | undefined
  let json = false
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!
    if (argument === '--json') json = true
    else if (argument === '--dist') {
      dist = args[++index]
      if (!dist || dist.startsWith('--')) throw new Error('--dist vereist een buildmap')
    } else if (argument.startsWith('--')) throw new Error(`onbekende optie: ${argument}`)
    else positional.push(argument)
  }
  const [file, count = '20'] = positional
  if (!file || positional.length > 2) throw new Error('Gebruik: pnpm prof:top <profiel.json> [top-N] [--json] [--dist <buildmap>]')
  if (!Number.isInteger(Number(count)) || Number(count) < 1) throw new Error('top-N moet een positief geheel getal zijn')
  return { file, count: Number(count), json, dist }
}

function main() {
  const { file, count, json, dist } = parseProfileTopArgs(process.argv.slice(2))
  const result = profileTop(JSON.parse(readFileSync(file, 'utf8')), dist ? createSourceMapResolver(dist) : undefined)
  if (!result.samples) throw new Error('geen ProfileChunk-samples; dit profiel bevat alleen tijdvakken')
  if (json) console.log(JSON.stringify(result, null, 2))
  else {
    console.log(`${result.samples} samples, ${result.sampledMs.toFixed(1)} ms over de bemonsterde intervallen`)
    console.table(result.functions.slice(0, count).map((entry) => ({
      functie: entry.functionName,
      'self ms': entry.selfMs.toFixed(1),
      'self %': (100 * entry.selfSamples / result.samples).toFixed(2),
      'stack %': (100 * entry.stackSamples / result.samples).toFixed(2),
      bron: `${entry.url}:${entry.lineNumber + 1}:${entry.columnNumber + 1}`,
    })))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main() }
  catch (error) {
    console.error(`prof:top: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
