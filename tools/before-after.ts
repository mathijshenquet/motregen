import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { captureComparison } from '../web/scripts/before-after-capture'
import { maxMediaBytes, repositoryRoot } from './changelog'

export function comparisonFilter(): string {
  return "[0:v]scale=-2:400,setsar=1,drawbox=x=0:y=0:w=iw:h=38:color=black@0.7:t=fill,drawtext=text=voor:fontcolor=white:fontsize=24:x=16:y=6[before];[1:v]scale=-2:400,setsar=1,drawbox=x=0:y=0:w=iw:h=38:color=black@0.7:t=fill,drawtext=text=na:fontcolor=white:fontsize=24:x=16:y=6[after];[before][after]hstack=inputs=2[out]"
}

interface CaptureRegion { x: number; y: number; width: number; height: number }

export function comparisonVideoFilter(duration: number, regions: Array<CaptureRegion | undefined> = []): string {
  const segments = ['voor', 'na'].map((label, index) => {
    const region = regions[index]
    const crop = region ? `crop=${Math.floor(region.width / 2) * 2}:${Math.floor(region.height / 2) * 2}:${Math.floor(region.x / 2) * 2}:${Math.floor(region.y / 2) * 2},` : ''
    return `[${index}:v]trim=duration=${duration / 2},setpts=PTS-STARTPTS,${crop}scale=960:600:force_original_aspect_ratio=decrease,pad=960:600:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=12,drawbox=x=0:y=0:w=iw:h=44:color=black@0.7:t=fill,drawtext=text=${label}:fontcolor=white:fontsize=28:x=18:y=8[segment${index}]`
  })
  return `${segments.join(';')};[segment0][segment1]concat=n=2:v=1:a=0[out]`
}

export function sameCamera(left: { longitude: number; latitude: number; zoom: number }, right: { longitude: number; latitude: number; zoom: number }): boolean {
  return Math.abs(left.longitude - right.longitude) < 0.0001 && Math.abs(left.latitude - right.latitude) < 0.0001 && Math.abs(left.zoom - right.zoom) < 0.001
}

export async function beforeAfter(arguments_: string[]): Promise<void> {
  const { positionals, values } = parseArgs({ args: arguments_, allowPositionals: true, options: { time: { type: 'string' }, now: { type: 'string' }, duration: { type: 'string', default: '0' }, longitude: { type: 'string', default: '5.3' }, latitude: { type: 'string', default: '52.2' }, zoom: { type: 'string', default: '6.5' }, selector: { type: 'string' }, play: { type: 'boolean', default: false } } })
  const [before, after, path, outputName] = positionals
  if (positionals.length !== 4 || !before || !after || !path?.startsWith('/') || path.startsWith('//') || !outputName || !values.time) throw new Error('Gebruik: pnpm changelog:compare <voor-origin> <na-origin> </pad> <uit.webp|uit.mp4> --time <ISO> [--now <ISO>] [--duration <1–12>] [--selector <CSS>] [--play] [--longitude 5.3 --latitude 52.2 --zoom 6.5]')
  for (const origin of [before, after]) if (!['http:', 'https:'].includes(new URL(origin).protocol)) throw new Error('Gebruik HTTP(S)-origins')
  const duration = Number(values.duration)
  const camera = { longitude: Number(values.longitude), latitude: Number(values.latitude), zoom: Number(values.zoom) }
  if (!Number.isFinite(duration) || duration < 0 || duration > 12 || Object.values(camera).some((value) => !Number.isFinite(value)) || Math.abs(camera.longitude) > 180 || Math.abs(camera.latitude) > 85 || camera.zoom < 0 || camera.zoom > 20) throw new Error('Ongeldige duur of camera')
  if (!Number.isFinite(Date.parse(values.time))) throw new Error('Ongeldige --time')
  const output = resolve(repositoryRoot, outputName)
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
    const regions: Array<CaptureRegion | undefined> = []
    let effectiveCamera = camera
    for (const [index, origin] of [before, after].entries()) {
      const directory = resolve(scratch, String(index))
      mkdirSync(directory)
      const captured = await captureComparison({ origin, path, output: directory, time: values.time, now, camera: effectiveCamera, duration: duration / 2, selector: values.selector, play: values.play })
      if (index === 0) effectiveCamera = captured.camera
      else if (!sameCamera(effectiveCamera, captured.camera)) throw new Error('De twee builds begrenzen de camera verschillend; kies een hogere --zoom')
      starts.push(captured.start)
      regions.push(captured.region)
    }
    const inputs = duration ? ['-ss', String(starts[0]), '-i', `${scratch}/0/capture.webm`, '-ss', String(starts[1]), '-i', `${scratch}/1/capture.webm`] : ['-i', `${scratch}/0/capture.png`, '-i', `${scratch}/1/capture.png`]
    const encoding = duration ? ['-t', String(duration), '-r', '12', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-maxrate', '1000k', '-bufsize', '1000k', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an'] : ['-frames:v', '1', '-c:v', 'libwebp', '-quality', '80']
    execFileSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', duration ? comparisonVideoFilter(duration, regions) : comparisonFilter(), '-map', '[out]', ...encoding, output], { stdio: 'pipe' })
    if (statSync(output).size > maxMediaBytes) throw new Error('Uitvoer is groter dan 2 MB; kies een kortere clip')
    console.log(`Voor/na opgeslagen: ${output}`)
    console.log(`Klok: ${now}; kaarttijd: ${values.time}; camera: ${JSON.stringify(effectiveCamera)}`)
  } finally { rmSync(scratch, { recursive: true, force: true }) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await beforeAfter(process.argv.slice(2)) }
  catch (error) { console.error(error instanceof Error ? error.message : 'Voor/na-opname mislukt'); process.exitCode = 1 }
}
