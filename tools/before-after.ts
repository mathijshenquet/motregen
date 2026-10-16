import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { captureComparison } from '../web/scripts/before-after-capture'
import { maxMediaBytes } from './changelog'
import { statSync } from 'node:fs'

export function comparisonFilter(): string {
  return "[0:v]scale=640:400,setsar=1,drawbox=x=0:y=0:w=iw:h=38:color=black@0.7:t=fill,drawtext=text=voor:fontcolor=white:fontsize=24:x=16:y=6[before];[1:v]scale=640:400,setsar=1,drawbox=x=0:y=0:w=iw:h=38:color=black@0.7:t=fill,drawtext=text=na:fontcolor=white:fontsize=24:x=16:y=6[after];[before][after]hstack=inputs=2[out]"
}

export async function beforeAfter(arguments_: string[]): Promise<void> {
  const { positionals, values } = parseArgs({ args: arguments_, allowPositionals: true, options: { time: { type: 'string' }, now: { type: 'string' }, duration: { type: 'string', default: '0' }, longitude: { type: 'string', default: '5.3' }, latitude: { type: 'string', default: '52.2' }, zoom: { type: 'string', default: '6.5' } } })
  const [before, after, path, outputName] = positionals
  if (positionals.length !== 4 || !before || !after || !path?.startsWith('/') || path.startsWith('//') || !outputName || !values.time) throw new Error('Gebruik: pnpm changelog:compare <voor-origin> <na-origin> </pad> <uit.webp|uit.mp4> --time <ISO> [--now <ISO>] [--duration <1–12>] [--longitude 5.3 --latitude 52.2 --zoom 6.5]')
  for (const origin of [before, after]) if (!['http:', 'https:'].includes(new URL(origin).protocol)) throw new Error('Gebruik HTTP(S)-origins')
  const duration = Number(values.duration)
  const camera = { longitude: Number(values.longitude), latitude: Number(values.latitude), zoom: Number(values.zoom) }
  if (!Number.isFinite(duration) || duration < 0 || duration > 12 || Object.values(camera).some((value) => !Number.isFinite(value)) || Math.abs(camera.longitude) > 180 || Math.abs(camera.latitude) > 85 || camera.zoom < 0 || camera.zoom > 20) throw new Error('Ongeldige duur of camera')
  if (!Number.isFinite(Date.parse(values.time))) throw new Error('Ongeldige --time')
  const output = resolve(outputName)
  if (extname(output) !== (duration ? '.mp4' : '.webp')) throw new Error('Gebruik .webp voor een still, .mp4 met --duration')
  let now = values.now
  if (!now) {
    const response = await fetch(new URL('/data/manifest.json', before))
    if (!response.ok) throw new Error('Manifest van voor-origin ontbreekt; geef --now op')
    const manifest = await response.json() as { generated: string }
    now = new Date(Date.parse(manifest.generated) + 60_000).toISOString()
  }
  if (!Number.isFinite(Date.parse(now))) throw new Error('Ongeldige --now')
  const scratch = mkdtempSync(resolve(tmpdir(), 'motregen-before-after-'))
  mkdirSync(dirname(output), { recursive: true })
  try {
    const starts: number[] = []
    for (const [index, origin] of [before, after].entries()) {
      const directory = resolve(scratch, String(index))
      mkdirSync(directory)
      const captured = await captureComparison({ origin, path, output: directory, time: values.time, now, camera, duration })
      starts.push(captured.start)
    }
    const inputs = duration ? ['-ss', String(starts[0]), '-i', `${scratch}/0/capture.webm`, '-ss', String(starts[1]), '-i', `${scratch}/1/capture.webm`] : ['-i', `${scratch}/0/capture.png`, '-i', `${scratch}/1/capture.png`]
    const encoding = duration ? ['-t', String(duration), '-r', '12', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-maxrate', '1000k', '-bufsize', '1000k', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an'] : ['-frames:v', '1', '-c:v', 'libwebp', '-quality', '80']
    execFileSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', comparisonFilter(), '-map', '[out]', ...encoding, output], { stdio: 'pipe' })
    if (statSync(output).size > maxMediaBytes) throw new Error('Uitvoer is groter dan 2 MB; kies een kortere clip')
    console.log(`Voor/na opgeslagen: ${output}`)
  } finally { rmSync(scratch, { recursive: true, force: true }) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await beforeAfter(process.argv.slice(2)) }
  catch (error) { console.error(error instanceof Error ? error.message : 'Voor/na-opname mislukt'); process.exitCode = 1 }
}
