import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping'

// U111: waar is een draad van een Gecko-profiel (Firefox about:debugging → Downloaden) zijn CPU kwijt? Top-N
// inclusief en zelf, gewogen met threadCPUDelta, plus per sample de eigenaar: de binnenste JS-frame bepaalt of het
// onze JS is, MapLibre of een andere bundel; samples zonder JS-frame zijn Gecko (stijl, layout, displaylist, verf).
// Native adressen gaan naar Mozilla's symbolicatieserver (alleen bibliotheeknaam, breakpad-id en offset), met een
// cache naast het profiel. Met --dist wijzen de sourcemaps van die build de geminificeerde JS-namen aan.
//
// Het proces: zonder --pid de GeckoMain met de meeste `motregen:`-UserTiming-markers (het tabblad van de app; er
// draaien meer Web Content-processen).
//
// usage: pnpm exec tsx scripts/gecko-hotspots.ts PROFIEL.json.gz [--thread=GeckoMain] [--pid=N] [--top=15]
//          [--dist=tmp/u111-r2] [--offline] [--under=naam]
// --under: alleen samples met een frame waarvan de naam met `naam` begint (bijv. `draw (src/core/wind-socks.ts`), om te
// zien waar die functie zijn tijd kwijt is.

interface Table { schema: Record<string, number>; data: unknown[][] }
interface Lib { start: number; end: number; offset?: number; debugName?: string; breakpadId?: string }
interface Thread { name: string; pid: number | string; processName?: string; stringTable: string[]; samples: Table; stackTable: Table; frameTable: Table; markers: Table }
interface Process { meta: { categories?: Array<{ name: string }> }; threads: Thread[]; libs?: Lib[]; processes?: Process[] }

const args = process.argv.slice(2)
const file = args.find((arg) => !arg.startsWith('--'))
if (!file) throw new Error('usage: pnpm exec tsx scripts/gecko-hotspots.ts PROFIEL.json.gz [--thread=…] [--pid=…] [--top=…] [--dist=…] [--offline]')
const option = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const threadName = option('thread') ?? 'GeckoMain'
const top = Number(option('top') ?? 15)
const dist = option('dist')
const offline = args.includes('--offline')
const under = option('under')

const root = JSON.parse(gunzipSync(readFileSync(file)).toString()) as Process
const rows = (table: Table) => table.data.map((row) => Object.fromEntries(Object.entries(table.schema).map(([key, index]) => [key, row[index]])) as Record<string, any>)

const candidates: Array<{ thread: Thread; libs: Lib[] }> = []
const walk = (process: Process) => {
  for (const thread of process.threads) if (thread.name === threadName) candidates.push({ thread, libs: process.libs ?? [] })
  for (const child of process.processes ?? []) walk(child)
}
walk(root)
const appMarkers = (thread: Thread) => rows(thread.markers).filter((marker) => marker.data?.type === 'UserTiming' && String(marker.data.name).startsWith('motregen')).length
const pid = option('pid')
const chosen = pid ? candidates.find((candidate) => String(candidate.thread.pid) === pid) : candidates.sort((a, b) => appMarkers(b.thread) - appMarkers(a.thread))[0]
if (!chosen) throw new Error(`geen draad ${threadName}${pid ? ` in pid ${pid}` : ''}`)
const { thread, libs } = chosen
const strings = thread.stringTable
const samples = rows(thread.samples), stacks = rows(thread.stackTable), frames = rows(thread.frameTable)

// Symbolen: alle native frames die in een sample voorkomen, in één verzoek (gecachet).
const nativeFrames = new Set<number>()
for (const sample of samples) for (let stack = sample.stack; stack != null; stack = stacks[stack]!.prefix) {
  const frame = stacks[stack]!.frame as number
  if (strings[frames[frame]!.location]!.startsWith('0x')) nativeFrames.add(frame)
}
const cacheFile = `${file}.symbols-${thread.pid}-${threadName}.json`
let symbols: Record<string, string> = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {}
const missing = [...nativeFrames].map((frame) => strings[frames[frame]!.location]!).filter((address) => !(address in symbols))
if (missing.length && !offline) {
  const memoryMap: Array<[string, string]> = [], stack: Array<[number, number]> = [], asked: string[] = []
  for (const address of new Set(missing)) {
    const value = BigInt(address)
    const lib = libs.find((candidate) => value >= BigInt(candidate.start) && value < BigInt(candidate.end))
    // De server weigert het hele verzoek bij een naam als "[anon:…]" of een pad.
    if (!lib?.debugName || !/^[\w.+-]+$/.test(lib.debugName) || !lib.breakpadId) continue
    let index = memoryMap.findIndex(([name, id]) => name === lib.debugName && id === lib.breakpadId)
    if (index < 0) index = memoryMap.push([lib.debugName, lib.breakpadId]) - 1
    stack.push([index, Number(value - BigInt(lib.start) + BigInt(lib.offset ?? 0))])
    asked.push(address)
  }
  for (let from = 0; from < asked.length; from += 5_000) {
    const response = await fetch('https://symbolication.services.mozilla.com/symbolicate/v5', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobs: [{ memoryMap, stacks: [stack.slice(from, from + 5_000)] }] }),
    })
    if (!response.ok) throw new Error(`symbolicatie: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`)
    const result = await response.json() as { results: Array<{ stacks: Array<Array<{ function?: string; module?: string }>> }> }
    result.results[0]!.stacks[0]!.forEach((entry, index) => {
      symbols[asked[from + index]!] = entry.function ?? `${entry.module ?? '?'} ${asked[from + index]}`
    })
  }
  writeFileSync(cacheFile, JSON.stringify(symbols))
}

// JS-frames: "naam (url:regel:kolom)[…]"; met --dist de oorspronkelijke bron en naam uit de sourcemap.
const maps = new Map<string, TraceMap | undefined>()
function sourceMap(script: string): TraceMap | undefined {
  if (!dist) return undefined
  if (!maps.has(script)) {
    const path = join(dist, 'assets', `${script}.map`)
    maps.set(script, existsSync(path) ? new TraceMap(readFileSync(path, 'utf8')) : undefined)
  }
  return maps.get(script)
}

type Owner = 'motregen-JS' | 'MapLibre-JS' | 'andere JS' | 'Gecko'
/** `label`: Gecko's eigen fasenamen in de stapel (Paint, Styles, RefreshDriver tick …). */
interface Named { name: string; kind: 'js' | 'label' | 'native'; owner?: Owner }
const named = new Map<number, Named>()
function frameName(frame: number): Named {
  const cached = named.get(frame)
  if (cached) return cached
  const location = strings[frames[frame]!.location]!
  let result: Named
  const js = /^(.*) \((.+?):(\d+):(\d+)\)(\[\d+\])?$/.exec(location)
  if (location.startsWith('0x')) result = { name: symbols[location] ?? location, kind: 'native' }
  else if (js) {
    const [, minified, url, line, column] = js
    // "self-hosted": Gecko's eigen JS (Array.prototype.map e.d.), gerekend bij de aanroeper.
    const script = URL.canParse(url!) ? basename(new URL(url!).pathname) : url!
    const owner: Owner | undefined = script.startsWith('maplibre-') ? 'MapLibre-JS' : url!.includes('/assets/') ? 'motregen-JS' : url === 'self-hosted' ? undefined : 'andere JS'
    const map = sourceMap(script)
    const original = map ? originalPositionFor(map, { line: Number(line), column: Math.max(0, Number(column) - 1) }) : undefined
    const source = original?.source ? `${original.source.replace(/^(\.\.\/)+/, '').replace(/^node_modules\//, '')}:${original.line}` : `${script}:${line}`
    result = { name: `${original?.name ?? minified} (${source})`, kind: 'js', owner }
  } else result = { name: location, kind: 'label' }
  named.set(frame, result)
  return result
}

const inclusive = new Map<string, number>(), self = new Map<string, number>(), owners = new Map<Owner, number>()
const kinds = new Map<string, Named['kind']>()
let total = 0
for (const sample of samples) {
  const weight = Number(sample.threadCPUDelta ?? 0)
  if (sample.stack == null || !weight) continue
  if (under) {
    let found = false
    for (let stack = sample.stack; stack != null && !found; stack = stacks[stack]!.prefix) found = frameName(stacks[stack]!.frame as number).name.startsWith(under)
    if (!found) continue
  }
  total += weight
  const leafFrame = stacks[sample.stack]!.frame as number
  const leaf = frameName(leafFrame)
  self.set(leaf.name, (self.get(leaf.name) ?? 0) + weight)
  const seen = new Set<string>()
  let owner: Owner | undefined
  for (let stack = sample.stack; stack != null; stack = stacks[stack]!.prefix) {
    const entry = frameName(stacks[stack]!.frame as number)
    owner ??= entry.owner
    if (seen.has(entry.name)) continue
    seen.add(entry.name)
    kinds.set(entry.name, entry.kind)
    inclusive.set(entry.name, (inclusive.get(entry.name) ?? 0) + weight)
  }
  owners.set(owner ?? 'Gecko', (owners.get(owner ?? 'Gecko') ?? 0) + weight)
}

const times = samples.map((sample) => Number(sample.time))
const seconds = (Math.max(...times) - Math.min(...times)) / 1000
const perSecond = (ns: number) => `${(ns / 1e6 / seconds).toFixed(0)} ms/s`
const share = (ns: number) => `${(ns / total * 100).toFixed(1)} %`
const list = (entries: Map<string, number>, count: number) => [...entries].sort((a, b) => b[1] - a[1]).slice(0, count)

console.log(`${threadName} pid ${thread.pid} (${thread.processName ?? '?'}), ${seconds.toFixed(1)} s, ${perSecond(total)} CPU; ${appMarkers(thread)} motregen-markers; ${nativeFrames.size} native frames, ${missing.length && offline ? 'niet ' : ''}gesymboliseerd`)
console.log('\nEigenaar (binnenste JS-frame van het sample):')
for (const [owner, weight] of list(owners as Map<string, number>, 10)) console.log(`  ${owner.padEnd(12)} ${perSecond(weight).padStart(9)}  ${share(weight)}`)
const print = (title: string, entries: Array<[string, number]>) => {
  console.log(`\n${title}:`)
  entries.slice(0, top).forEach(([name, weight], index) => console.log(`  ${String(index + 1).padStart(2)}. ${share(weight).padStart(7)} ${perSecond(weight).padStart(9)}  ${name.slice(0, 150)}`))
}
const ranked = list(inclusive, inclusive.size)
print(`Top ${top} inclusief, alle frames`, ranked.filter(([name]) => name !== '(root)'))
print(`Top ${top} inclusief, JS`, ranked.filter(([name]) => kinds.get(name) === 'js'))
print(`Top ${top} inclusief, Gecko-fasen`, ranked.filter(([name]) => kinds.get(name) === 'label' && name !== '(root)'))
print(`Top ${top} zelf`, list(self, top))
