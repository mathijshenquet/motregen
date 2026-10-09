import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const label = process.argv[2]
const track = '.dev/tracks/u71c-renderer-geheugen'
const group = (await readFile('/proc/self/cgroup', 'utf8')).trim().split('::')[1]
const directory = join('/sys/fs/cgroup', group)
const started = performance.now()
const samples = ['seconds,cgroup_bytes,pid,process,rss_bytes']
const processes = new Map()
const readNumber = async (name) => Number((await readFile(join(directory, name), 'utf8')).trim())
async function sample() {
  const elapsed = ((performance.now() - started) / 1000).toFixed(3)
  const memory = await readNumber('memory.current')
  const pids = (await readFile(join(directory, 'cgroup.procs'), 'utf8')).trim().split('\n')
  for (const pid of pids) {
    try {
      const status = await readFile(`/proc/${pid}/status`, 'utf8')
      const name = status.match(/^Name:\s*(.+)$/m)?.[1]
      const rss = Number(status.match(/^VmRSS:\s*(\d+) kB$/m)?.[1] ?? 0) * 1024
      const prior = processes.get(pid)
      if (!prior || prior.maxRssBytes < rss) processes.set(pid, { pid: Number(pid), name, maxRssBytes: rss })
      samples.push(`${elapsed},${memory},${pid},${name},${rss}`)
    } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error }
  }
}
const child = spawn(process.env.MOTREGEN_TIME_PATH, [
  '-v', '-o', `${track}/${label}-resource.txt`, 'taskset', '-c', '0,1',
  'pnpm', '-C', 'bot', 'render', '--matrix',
  '--manifest=../.dev/tracks/u71b-native-temperatuur-wind/manifest.json',
  `--dry-run-prime=../${track}/${label}-register.json`,
], { stdio: 'inherit' })
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
  ...result, elapsedSeconds: (performance.now() - started) / 1000,
  memoryPeakBytes: await readNumber('memory.peak'),
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
