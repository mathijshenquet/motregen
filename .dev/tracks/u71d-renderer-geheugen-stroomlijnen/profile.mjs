import { spawn } from 'node:child_process'
import { readFile, readlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const label = process.argv[2]
const runtime = process.argv[3] ?? 'source'
const track = '.dev/tracks/u71d-renderer-geheugen-stroomlijnen'
const group = (await readFile('/proc/self/cgroup', 'utf8')).trim().split('::')[1]
const directory = join('/sys/fs/cgroup', group)
const started = performance.now()
const samples = ['seconds,cgroup_bytes,pid,process,rss_bytes,anon_bytes,file_bytes']
let maxAnonBytes = 0
let maxFileBytes = 0
const processes = new Map()
const readNumber = async (name) => Number((await readFile(join(directory, name), 'utf8')).trim())
async function sample() {
  const elapsed = ((performance.now() - started) / 1000).toFixed(3)
  const memory = await readNumber('memory.current')
  const stats = Object.fromEntries((await readFile(join(directory, 'memory.stat'), 'utf8')).trim().split('\n').map(line => line.split(' ')))
  maxAnonBytes = Math.max(maxAnonBytes, Number(stats.anon))
  maxFileBytes = Math.max(maxFileBytes, Number(stats.file))
  const pids = (await readFile(join(directory, 'cgroup.procs'), 'utf8')).trim().split('\n')
  for (const pid of pids) {
    try {
      const status = await readFile(`/proc/${pid}/status`, 'utf8')
      const name = status.match(/^Name:\s*(.+)$/m)?.[1]
      const rss = Number(status.match(/^VmRSS:\s*(\d+) kB$/m)?.[1] ?? 0) * 1024
      const prior = processes.get(pid)
      if (!prior || prior.maxRssBytes < rss) processes.set(pid, { pid: Number(pid), name, executable: await readlink(`/proc/${pid}/exe`), maxRssBytes: rss })
      samples.push(`${elapsed},${memory},${pid},${name},${rss},${stats.anon},${stats.file}`)
    } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error }
  }
}
const command = runtime === 'built' ? ['node', '--expose-gc', ...(process.env.MOTREGEN_NODE_HEAP ? [`--max-old-space-size=${process.env.MOTREGEN_NODE_HEAP}`, "--max-semi-space-size=4"] : []), 'dist/bot/smoke.js', '--render-only'] : ['pnpm', 'render']
const child = spawn(process.env.MOTREGEN_TIME_PATH, [
  '-v', '-o', `../${track}/${label}-resource.txt`, 'taskset', '-c', '0,1',
  ...command, '--matrix',
  '--manifest=../.dev/tracks/u71b-native-temperatuur-wind/manifest.json',
  `--dry-run-prime=../${track}/${label}-register.json`,
], { stdio: 'inherit', cwd: 'bot' })
let finished = false
const completed = new Promise((resolve, reject) => {
  child.once('error', reject)
  child.once('close', (code, signal) => { finished = true; resolve({ code, signal }) })
})
while (!finished) {
  await sample()
  await Promise.race([completed, new Promise((resolve) => setTimeout(resolve, 200))])
}
const result = await completed
const summary = {
  ...result, runtime, nodeHeapMiB: process.env.MOTREGEN_NODE_HEAP ?? null, nodeSemiSpaceMiB: process.env.MOTREGEN_NODE_HEAP ? 4 : null, maxAnonBytes, maxFileBytes, elapsedSeconds: (performance.now() - started) / 1000,
  memoryPeakBytes: await readNumber('memory.peak'),
  memorySwapPeakBytes: await readNumber('memory.swap.peak'),
  memorySwapMax: (await readFile(join(directory, 'memory.swap.max'), 'utf8')).trim(),
  mallocArenaMax: process.env.MALLOC_ARENA_MAX ?? null,
  mallocMmapThreshold: process.env.MALLOC_MMAP_THRESHOLD_ ?? null,
  memoryHigh: (await readFile(join(directory, 'memory.high'), 'utf8')).trim(),
  memoryMax: (await readFile(join(directory, 'memory.max'), 'utf8')).trim(),
  cpuMax: (await readFile(join(directory, 'cpu.max'), 'utf8')).trim(),
  memoryEvents: (await readFile(join(directory, 'memory.events'), 'utf8')).trim(),
  processes: [...processes.values()],
}
await writeFile(`${track}/${label}-samples.csv`, `${samples.join('\n')}\n`)
await writeFile(`${track}/${label}.json`, `${JSON.stringify(summary, null, 2)}\n`)
console.log(JSON.stringify({ event: 'cgroup-measurement', ...summary }))
process.exitCode = result.code ?? 1
