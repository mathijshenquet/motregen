import { spawn } from 'node:child_process'
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
const [directoryArgument, highArgument] = process.argv.slice(2)
if (!directoryArgument || (highArgument && highArgument !== '--high')) throw new Error('Usage: node tools/measure-video-quality.mjs QUALITY_DIR [--high]')
const directory = resolve(directoryArgument)
const high = highArgument === '--high'
for (const name of ['variants', 'receipts']) await mkdir(join(directory, name), { recursive: true })
const generation = JSON.parse(await readFile(join(directory, 'before/media.json'), 'utf8'))
const ffmpeg = process.env.MOTREGEN_QUALITY_FFMPEG
if (!ffmpeg?.startsWith('/')) throw new Error('Set MOTREGEN_QUALITY_FFMPEG to the absolute ffmpeg executable')
async function run(command, args) {
  const start = performance.now()
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = '', stderr = ''
  child.stdout.on('data', data => stdout += data)
  child.stderr.on('data', data => stderr += data)
  await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(new Error(`${command} exit ${code}: ${stderr}`))) })
  return { ms: performance.now() - start, stdout, stderr }
}
const rows = []
for (const mode of ['wind', 'feels', 'weather']) {
  const media = generation.modes[mode]
  const fps = mode === 'weather' ? '9/2' : '10/1'
  const raw = join(directory, `reference/${mode}-loop.rgb`)
  if ((await stat(raw)).size !== 960 * 1272 * 3 * media.frames) throw new Error('Incorrect reference frame count')
  for (const preset of (high ? ['ultrafast'] : ['ultrafast', 'veryfast', 'medium'])) for (const crf of (high ? [18] : [16, 18, 20])) {
    const name = `${mode}-${preset}-${crf}${high ? '-high' : ''}`
    const path = join(directory, `variants/${name}.mp4`)
    const args = ['-hide_banner', '-loglevel', 'error', '-y', '-filter_threads', '1', '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', '960x1272', '-framerate', fps, '-i', raw, '-vf', `tpad=stop_mode=clone:stop=${media.hold_frames},setsar=1`, '-frames:v', String(media.frames + media.hold_frames), '-c:v', 'libx264', '-threads', '1', '-preset', preset, '-crf', String(crf), '-profile:v', 'high', ...(high ? ['-x264-params', '8x8dct=1'] : []), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', '-f', 'mp4', path]
    const encoded = await run('systemd-run', ['--user', '--wait', '--pipe', `--unit=u80-${name}`, '-p', 'CPUQuota=200%', `--setenv=PATH=${process.env.PATH}`, 'taskset', '-c', '0,1', ffmpeg, ...args])
    await writeFile(join(directory, `receipts/${name}-encode.txt`), JSON.stringify({ command: ['systemd-run', '--user', '--wait', '--pipe', `--unit=u80-${name}`, '-p', 'CPUQuota=200%', 'taskset', '-c', '0,1', ffmpeg, ...args], wall_ms: encoded.ms, exit: 0 }) + '\n' + encoded.stderr)
    const measured = await run(ffmpeg, ['-hide_banner', '-nostats', '-threads', '1', '-i', path, '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', '960x1272', '-framerate', fps, '-i', raw, '-filter_complex_threads', '1', '-lavfi', `[0:v]trim=end_frame=${media.frames},setpts=PTS-STARTPTS,format=yuv444p[dist];[1:v]setpts=PTS-STARTPTS,format=yuv444p[ref];[dist][ref]ssim=stats_file=${join(directory, `receipts/${name}-ssim.frames`)}:shortest=1`, '-frames:v', String(media.frames), '-an', '-f', 'null', '-'])
    await writeFile(join(directory, `receipts/${name}-ssim.txt`), measured.stderr)
    const ssim = Number(measured.stderr.match(/All:([\d.]+)/)?.[1])
    if (!Number.isFinite(ssim) || ssim <= 0) throw new Error('SSIM unavailable')
    const probe = JSON.parse((await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path])).stdout)
    const row = { mode, preset, crf, bytes: (await stat(path)).size, encode_ms: Math.round(encoded.ms), ssim, profile: probe.streams[0].profile, pix_fmt: probe.streams[0].pix_fmt, frames: Number(probe.streams[0].nb_frames), bitrate: Number(probe.format.bit_rate), duration: Number(probe.format.duration), file: `variants/${name}.mp4` }
    rows.push(row)
    await writeFile(join(directory, high ? 'measurements-high.json' : 'measurements.json'), JSON.stringify({ source: generation.generated, now: generation.now, cpu: 'systemd-run CPUQuota=200%, taskset -c0,1; x264 threads=1', ssim: 'YUV444p converted from uncompressed RGB vs decoded YUV420p upsampled to YUV444p; moving frames only', rows }, null, 2))
    console.log(JSON.stringify(row))
  }
}
