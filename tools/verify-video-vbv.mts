import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { videoArguments, videoSettings } from '../bot/video-settings.js'

const [qualityDirectory] = process.argv.slice(2)
if (!qualityDirectory) throw new Error('Usage: pnpm -C bot exec tsx ../tools/verify-video-vbv.mts QUALITY_DIR')
const directory = resolve(qualityDirectory), output = join(directory, 'v2')
const ffmpeg = process.env.MOTREGEN_QUALITY_FFMPEG
if (!ffmpeg?.startsWith('/')) throw new Error('Set MOTREGEN_QUALITY_FFMPEG to the absolute ffmpeg executable')
await mkdir(join(output, 'receipts'), { recursive: true })
const generation = JSON.parse(await readFile(join(directory, 'before/media.json'), 'utf8'))
async function run(command: string, args: string[]) {
  const started = performance.now(), child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  const chunks: Buffer[] = []; let stderr = ''
  child.stdout.on('data', data => chunks.push(data)); child.stderr.on('data', data => stderr += data)
  await new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(new Error(`${command}: exit ${code}: ${stderr}`))) })
  return { ms: Math.round(performance.now() - started), stdout: Buffer.concat(chunks), stderr }
}
const rows = []
for (const mode of ['wind', 'feels', 'weather']) {
  const media = generation.modes[mode], frames = media.frames + media.hold_frames
  const fps = mode === 'weather' ? '9/2' : '10/1', raw = join(directory, `reference/${mode}-loop.rgb`)
  assert.equal((await stat(raw)).size, 960 * 1272 * 3 * media.frames)
  let minimumFullnessBits = 0
  let referenceHash = '', referencePayload = '', referenceSsim = 0, referenceBytes = 0
  for (const [id, maxBytes] of [['no-vbv', 20_000_000], ['20mb', 20_000_000], ['2mb', 2_000_000]] as const) {
    const settings = videoSettings({ MOTREGEN_VIDEO_MAX_BYTES: String(maxBytes) })
    const qualityArgs = videoArguments(settings, frames, media.fps)
    if (id === 'no-vbv') for (const flag of ['-maxrate', '-bufsize']) qualityArgs.splice(qualityArgs.indexOf(flag), 2)
    const name = `${mode}-${id}`, path = join(output, `${name}.mp4`)
    const args = ['-hide_banner', '-loglevel', 'error', '-y', '-filter_threads', '1', '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', '960x1272', '-framerate', fps, '-i', raw, '-vf', `tpad=stop_mode=clone:stop=${media.hold_frames},setsar=1`, '-frames:v', String(frames), '-c:v', 'libx264', '-threads', '1', ...qualityArgs, '-an', '-f', 'mp4', path]
    const command = ['--user', '--wait', '--pipe', `--unit=u80-vbv-${name}`, '-p', 'CPUQuota=200%', `--setenv=PATH=${process.env.PATH}`, 'taskset', '-c', '0,1', ffmpeg, ...args]
    const encoded = await run('systemd-run', command)
    await writeFile(join(output, `receipts/${name}-encode.txt`), JSON.stringify({ command: ['systemd-run', ...command], wall_ms: encoded.ms, exit: 0 }) + '\n' + encoded.stderr)
    const measured = await run(ffmpeg, ['-hide_banner', '-nostats', '-threads', '1', '-i', path, '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', '960x1272', '-framerate', fps, '-i', raw, '-filter_complex_threads', '1', '-lavfi', `[0:v]trim=end_frame=${media.frames},setpts=PTS-STARTPTS,format=yuv444p[dist];[1:v]setpts=PTS-STARTPTS,format=yuv444p[ref];[dist][ref]ssim=shortest=1`, '-frames:v', String(media.frames), '-an', '-f', 'null', '-'])
    await writeFile(join(output, `receipts/${name}-ssim.txt`), measured.stderr)
    const ssim = Number(measured.stderr.match(/All:([\d.]+)/)?.[1]); assert.ok(ssim > 0 && ssim <= 1)
    const decoded = await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-threads', '1', '-i', path, '-f', 'framemd5', '-'])
    const hashes = decoded.stdout.toString().split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split(',').at(-1)!.trim())
    assert.equal(hashes.length, frames)
    const decodedHash = createHash('sha256').update(hashes.join('\n')).digest('hex')
    const payload = await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', path, '-c:v', 'copy', '-bsf:v', 'filter_units=remove_types=6', '-f', 'h264', '-'])
    const payloadHash = createHash('sha256').update(payload.stdout).digest('hex')
    const bytes = (await stat(path)).size
    if (id === 'no-vbv') {
      referenceHash = decodedHash; referencePayload = payloadHash; referenceSsim = ssim; referenceBytes = bytes
      const probe = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_packets', '-show_entries', 'packet=dts_time,size', '-of', 'json', path])
      const packets: { dts_time: string; size: string }[] = JSON.parse(probe.stdout.toString()).packets
      const limited = videoArguments(settings, frames, media.fps), maxrate = Number(limited[limited.indexOf('-maxrate') + 1]), buffer = Number(limited[limited.indexOf('-bufsize') + 1])
      let fill = 0.9 * buffer, last = Number(packets[0]!.dts_time)
      minimumFullnessBits = fill
      for (const packet of packets) {
        const time = Number(packet.dts_time)
        fill = Math.min(buffer, fill + maxrate * (time - last)) - Number(packet.size) * 8
        minimumFullnessBits = Math.min(minimumFullnessBits, fill); last = time
      }
      assert.ok(minimumFullnessBits > 0, `${mode}: unbounded film does not fit default VBV envelope`)
    }
    if (id === '20mb') { assert.equal(ssim, referenceSsim, `${mode}: default VBV changed SSIM at six decimals`); assert.ok(Math.abs(bytes - referenceBytes) / referenceBytes <= 0.0001, `${mode}: default VBV changed size substantially`) }
    if (id !== 'no-vbv') assert.ok(bytes <= maxBytes, `${mode}: ${bytes} > ${maxBytes}`)
    const row = { mode, id, maxBytes, bytes, encode_ms: encoded.ms, ssim, decodedHash, payloadHash, payloadBytes: payload.stdout.length, minimumFullnessBits, bytesDelta: bytes - referenceBytes, ssimDelta: ssim - referenceSsim, pixelsIdentical: decodedHash === referenceHash, payloadIdentical: payloadHash === referencePayload, file: `${name}.mp4` }
    rows.push(row)
    await writeFile(join(output, 'vbv.json'), JSON.stringify({ generated: generation.generated, now: generation.now, rows }, null, 2))
    console.log(JSON.stringify(row))
  }
}
