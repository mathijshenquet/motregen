import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'

const run = promisify(execFile)
if (!process.argv[2] || !process.argv[3] || !process.argv[4]) {
  throw new Error('Gebruik: tsx tools/measure-wind-layer-variants.mts /pad/proeven /nix/store/standaard /pad/snapshot')
}
const root = resolve(process.argv[2]), baseline = resolve(process.argv[3]), data = resolve(process.argv[4])
const packages = JSON.parse(await readFile(resolve(root, 'packages.json'), 'utf8')) as { id: string, store: string }[]
const jobs = [
  ...packages.map(p => ({ id: p.id, mode: 'wind', store: p.store })),
  ...['weather', 'feels', 'wind', 'all'].map(mode => ({ id: `baseline-${mode}`, mode, store: baseline })),
]
await mkdir(resolve(root, 'receipts'), { recursive: true })
const results = []
for (const job of jobs) {
  const mediaDirectory = resolve(root, job.id, 'media')
  await mkdir(mediaDirectory, { recursive: true })
  if ((await readdir(mediaDirectory)).length) throw new Error(`Gebruik een lege uitvoermap: ${mediaDirectory}`)
  const args = ['--user', '--wait', '--pipe', `--unit=u80-layers-${job.id}-${process.pid}`,
    '-p', 'CPUQuota=200%', '-p', 'MemoryMax=1600M', '-p', 'MemorySwapMax=0', '-p', 'MemoryAccounting=yes',
    '--setenv=MALLOC_ARENA_MAX=2', '--setenv=MALLOC_MMAP_THRESHOLD_=131072',
    'taskset', '-c', '0,1', `${job.store}/bin/motregen-render`, '--mode', job.mode,
    '--data-dir', data, '--basemap-dir', `${job.store}/share/motregen-render/basemaps`, '--out-dir', mediaDirectory]
  const command = ['systemd-run', ...args].map(s => `'${s.replaceAll("'", "'\\''")}'`).join(' ')
  const receipt = await run('systemd-run', args, { maxBuffer: 4 * 1024 * 1024 })
  const receiptText = receipt.stdout + '\n' + receipt.stderr
  await writeFile(resolve(root, 'receipts', `${job.id}.txt`), command + '\n\n' + receiptText)
  const media = JSON.parse(await readFile(resolve(mediaDirectory, 'media.json'), 'utf8'))
  const wall = receiptText.match(/Service runtime:\s+([\d.]+)s/)?.[1]
  const cpu = receiptText.match(/CPU time consumed:\s+([\d.]+)s/)?.[1]
  const peak = receiptText.match(/Memory peak:\s+([\d.]+)([KMG])/)?.slice(1)
  if (!wall || !cpu || !peak) throw new Error(`Onvolledige cgroup-meting: ${job.id}`)
  const peakMiB = Number(peak[0]) * ({ K: 1 / 1024, M: 1, G: 1024 }[peak[1]] ?? NaN)
  const files = media.mode === 'all' ? Object.values(media.modes).flatMap((m: any) => m.files) : media.files
  const result = { ...job, data, generated: media.generated, now: media.now, wallSeconds: Number(wall),
    cpuSeconds: Number(cpu), peakMiB, files: files.filter((f: any) => f.kind === 'animation'),
    stills: files.filter((f: any) => f.kind === 'photo').length, profile: media.profile,
    media: `${job.id}/media/media.json`, receipt: `receipts/${job.id}.txt`, command, exit: 0 }
  results.push(result)
  await writeFile(resolve(root, 'measurements.json'), JSON.stringify(results, null, 2) + '\n')
  console.log(JSON.stringify({ id: job.id, wallSeconds: result.wallSeconds, cpuSeconds: result.cpuSeconds,
    peakMiB, bytes: result.files.map((f: any) => f.bytes), stills: result.stills, exit: 0 }))
}
