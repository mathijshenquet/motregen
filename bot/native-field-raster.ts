import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash } from 'node:crypto'
import { writeStream } from './write-stream.js'
import { access, mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { Grid } from '../web/src/core/contract.js'
import { ISOLINE_FILL_OPACITY, ISOLINE_FILL_RESOLUTION, isolineColor } from '../web/src/core/isolines.js'
import { TEMPERATURE_LINE_OPACITY, ISOBAR_LINE_OPACITY, isolineWidthCss, lineProfile } from '../web/src/core/map-presentation.js'
import { NATIVE_VIEW } from './native-view.js'
import { FRAME, FRAME_PIXELS } from './config.js'
import { nativeProjection } from './native-projection.js'
import type { RasterSlice } from './native-temperature.js'

const run = promisify(execFile)
let executablePromise: Promise<string> | undefined
async function executable(): Promise<string> {
  executablePromise ??= (async () => {
    const directory = dirname(fileURLToPath(import.meta.url))
    const built = join(directory, 'native-field-raster')
    try { await access(built); return built } catch { /* Source runs build a content-addressed worker. */ }
    const source = join(directory, 'native-field-raster.rs')
    const hash = createHash('sha256').update(await readFile(source)).digest('hex').slice(0, 24)
    const cache = join(tmpdir(), 'motregen-native-field')
    await mkdir(cache, { recursive: true })
    const path = join(cache, hash)
    try { await access(path) } catch {
      const temporary = await mkdtemp(join(cache, `${hash}-`))
      try {
        await run('rustc', [source, '-O', '-o', join(temporary, 'worker')])
        await rename(join(temporary, 'worker'), path)
      } finally { await rm(temporary, { recursive: true, force: true }) }
    }
    return path
  })()
  return executablePromise
}

export class NativeFieldRaster {
  private worker?: ChildProcessWithoutNullStreams
  private completed?: Promise<void>
  private output?: { bytes: Buffer; offset: number; finish: () => void; fail: (error: Error) => void }
  constructor(private readonly grid: Grid, private readonly size: { width: number; height: number } = FRAME_PIXELS) {}

  private async write(bytes: Uint8Array): Promise<void> {
    await writeStream(this.worker!.stdin, bytes)
  }

  async prepare(): Promise<void> {
    if (this.worker) return
    const worker = spawn(await executable(), [], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.worker = worker
    let diagnostic = ''
    worker.stderr.on('data', (bytes: Buffer) => { diagnostic = (diagnostic + bytes.toString()).slice(-2000) })
    worker.stdin.on('error', () => undefined)
    worker.stdout.on('data', (bytes: Buffer) => {
      const output = this.output
      if (!output || output.offset + bytes.length > output.bytes.length) {
        output?.fail(new Error('Veldworker heeft te veel uitvoer')); worker.kill('SIGKILL'); return
      }
      bytes.copy(output.bytes, output.offset); output.offset += bytes.length
      if (output.offset === output.bytes.length) { this.output = undefined; output.finish() }
    })
    this.completed = new Promise<void>((resolve, reject) => {
      worker.once('error', (error) => { this.output?.fail(error); reject(error) })
      worker.once('close', (code) => {
        const error = new Error(`Veldworker gesloten (${code}): ${diagnostic}`)
        this.output?.fail(error)
        if (code === 0) resolve()
        else reject(error)
      })
    })
    void this.completed.catch(() => undefined)
    const header = Buffer.alloc(16)
    for (const [index, value] of [this.size.width, this.size.height, this.grid.width, this.grid.height].entries()) header.writeUInt32LE(value, index * 4)
    const projection = nativeProjection(this.grid, this.size)
    await this.write(header)
    await this.write(Buffer.from(projection.columns.buffer)); await this.write(Buffer.from(projection.rows.buffer))
  }

  async compose(base: Buffer, slice: RasterSlice, night: boolean): Promise<Buffer> {
    if (base.length !== this.size.width * this.size.height * 3 || (slice.kind === 'temperature' && (slice.field.values.length !== this.grid.width * this.grid.height || slice.field.valid.length !== slice.field.values.length))) throw new Error('Ongeldige veldframemaat')
    await this.prepare()
    if (this.output) throw new Error('Veldworker verwerkt al een frame')
    const rgb = Buffer.alloc(base.length)
    const received = new Promise<void>((finish, fail) => { this.output = { bytes: rgb, offset: 0, finish, fail } })
    void received.catch(() => undefined)
    const header = Buffer.alloc(48)
    header.writeFloatLE(slice.opacity, 0); header.writeUInt32LE(night ? 1 : 0, 4)
    header.writeUInt32LE(slice.segments.length / 6, 8); header.writeUInt32LE(slice.kind === 'temperature' && slice.rings ? 1 : 0, 12)
    header.writeUInt32LE(slice.kind === 'pressure' ? 1 : 0, 16)
    const profile = lineProfile(isolineWidthCss(NATIVE_VIEW.zoom) * FRAME.scale)
    header.writeFloatLE(slice.kind === 'pressure' ? 0 : ISOLINE_FILL_OPACITY, 20)
    header.writeFloatLE((slice.kind === 'pressure' ? ISOBAR_LINE_OPACITY : TEMPERATURE_LINE_OPACITY) * profile.alpha, 24)
    header.writeFloatLE(profile.halfWidth, 28)
    const color = Number.parseInt(isolineColor(night ? 'dark' : 'light', slice.kind).slice(1), 16)
    for (let channel = 0; channel < 3; channel++) header.writeFloatLE((color >> ((2 - channel) * 8)) & 255, 32 + channel * 4)
    header.writeFloatLE(ISOLINE_FILL_RESOLUTION / FRAME.scale, 44)
    await this.write(header); await this.write(base)
    const fields = slice.kind === 'temperature' ? [slice.field.values, slice.field.valid, slice.colors, slice.segments, ...(slice.rings ? [slice.rings] : [])] : [slice.segments]
    for (const field of fields) await this.write(Buffer.from(field.buffer, field.byteOffset, field.byteLength))
    await received
    return rgb
  }

  async close(): Promise<void> {
    if (!this.worker) return
    this.worker.stdin.end()
    await this.completed
  }
}
