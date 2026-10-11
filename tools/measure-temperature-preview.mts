import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'

const run = promisify(execFile)
if (!process.argv[2] || !process.argv[3] || !process.argv[4]) {
  throw new Error('Gebruik: tsx tools/measure-temperature-preview.mts /pad/proeven /pad/snapshot /nix/store/standaard')
}
const root = resolve(process.argv[2]), data = resolve(process.argv[3]), store = resolve(process.argv[4])
const refs = await run('nix-store', ['--query', '--references', store])
const ffmpeg = refs.stdout.trim().split('\n').find(p => p.includes('-ffmpeg-') && p.endsWith('-bin'))
if (!ffmpeg) throw new Error('Geen ffmpeg in standaardclosure')
const results = [], counts = { baseline: 0, fast: 0 }
// AB, BA, AB beperkt volgorde-effecten; beide binaries hebben dezelfde tijdelijke meetpunten.
for (const variant of ['baseline', 'fast', 'fast', 'baseline', 'baseline', 'fast'] as const) {
  const index = ++counts[variant], id = `temperature-${variant}-${index}`
  const binary = resolve(root, variant === 'baseline' ? 'temperature-profile' : 'temperature-fast', 'motregen-render')
  const out = resolve(root, id, 'media')
  await mkdir(out, { recursive: true })
  if ((await readdir(out)).length) throw new Error(`Gebruik een lege uitvoermap: ${out}`)
  const args = ['--user', '--wait', '--pipe', `--unit=u80-${id}-${process.pid}`,
    '-p', 'CPUQuota=200%', '-p', 'MemoryMax=1600M', '-p', 'MemorySwapMax=0', '-p', 'MemoryAccounting=yes',
    '--setenv=MALLOC_ARENA_MAX=2', '--setenv=MALLOC_MMAP_THRESHOLD_=131072',
    `--setenv=PATH=${ffmpeg}/bin:/run/current-system/sw/bin`,
    '/run/current-system/sw/bin/taskset', '-c', '0,1', binary, '--mode', 'feels', '--data-dir', data,
    '--basemap-dir', `${store}/share/motregen-render/basemaps`, '--out-dir', out]
  const command = ['systemd-run', ...args].map(s => `'${s.replaceAll("'", "'\\''")}'`).join(' ')
  const executed = await run('systemd-run', args, { maxBuffer: 4 * 1024 * 1024 })
  const receipt = executed.stdout + '\n' + executed.stderr
  await writeFile(resolve(root, 'receipts', `${id}.txt`), command + '\n\n' + receipt)
  const media = JSON.parse(await readFile(resolve(out, 'media.json'), 'utf8'))
  const phases = receipt.match(/TEMP_PHASE ([^\n]+)/)?.[1]
  const wall = receipt.match(/Service runtime:\s+([\d.]+)s/)?.[1]
  const cpu = receipt.match(/CPU time consumed:\s+([\d.]+)s/)?.[1]
  const peak = receipt.match(/Memory peak:\s+([\d.]+)M/)?.[1]
  if (!phases || !wall || !cpu || !peak) throw new Error(`Onvolledige meting: ${id}`)
  const phaseUs = Object.fromEntries(phases.split(' ').map(part => { const [key, value] = part.split('='); return [key, Number(value)] }))
  const result = { id, variant, index, generated: media.generated, now: media.now, wallSeconds: Number(wall),
    cpuSeconds: Number(cpu), peakMiB: Number(peak), bytes: media.files[0].bytes,
    frames: media.frames + media.hold_frames, stills: media.files.filter((f: any) => f.kind === 'photo').length,
    phaseUs, profile: media.profile, command, exit: 0 }
  results.push(result)
  await writeFile(resolve(root, 'temperature-measurements.json'), JSON.stringify(results, null, 2) + '\n')
  console.log(JSON.stringify(result))
}
