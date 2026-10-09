import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { access, mkdir, readFile, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { RainFrame } from './native-rain.js'
import { WARP_CAP_CELLS, WARP_FADE_END_CELLS, FLOW_BLEND_CURVE } from '../web/src/core/rain-motion.js'

const run = promisify(execFile)
const executables = new Map<string, Promise<string>>()

async function executable(): Promise<string> {
  const directory = dirname(fileURLToPath(import.meta.url))
  const packaged = join(directory, 'native-raster')
  try { await access(packaged); return packaged } catch {}
  const source = join(directory, 'native-raster.rs')
  const key = createHash('sha256').update(await readFile(source)).digest('hex').slice(0, 24)
  let pending = executables.get(key)
  if (!pending) {
    pending = (async () => {
      const directory = join(tmpdir(), 'motregen-native-raster')
      await mkdir(directory, { recursive: true })
      const path = join(directory, key)
      try { await access(path) } catch {
        const temporary = `${path}.${randomUUID()}`
        await run('rustc', [source, '-O', '-o', temporary])
        await rename(temporary, path)
      }
      return path
    })()
    executables.set(key, pending)
  }
  return pending
}

export class NativeRaster {
  private worker?: ChildProcessWithoutNullStreams
  private completed?: Promise<void>
  private readonly frames = new Map<Uint8Array, number>()
  private resident = new Set<number>()
  private output?: { bytes: Buffer; offset: number; finish: () => void; fail: (error: Error) => void }
  constructor(private readonly size: { width: number; height: number }, private readonly grid: { width: number; height: number }, private readonly columns: Float64Array, private readonly rows: Float64Array, private readonly colors: Float32Array) {}

  private async write(bytes: Uint8Array): Promise<void> {
    if (!this.worker!.stdin.write(bytes)) await Promise.race([once(this.worker!.stdin, 'drain'), this.completed!.then(() => { throw new Error('Native raster vroegtijdig gesloten') })])
  }

  async prepare(): Promise<void> {
    if (!this.worker) {
      const worker = spawn(await executable(), [], { stdio: ['pipe', 'pipe', 'pipe'] })
      this.worker = worker
      let diagnostic = ''
      worker.stderr.on('data', (bytes: Buffer) => { diagnostic = (diagnostic + bytes.toString()).slice(-2000) })
      worker.stdin.on('error', () => undefined)
      worker.stdout.on('data', (bytes: Buffer) => {
        const output = this.output
        if (!output || output.offset + bytes.length > output.bytes.length) {
          output?.fail(new Error('Native raster heeft te veel uitvoer'))
          worker.kill('SIGKILL')
          return
        }
        bytes.copy(output.bytes, output.offset)
        output.offset += bytes.length
        if (output.offset === output.bytes.length) { this.output = undefined; output.finish() }
      })
      this.completed = new Promise<void>((resolve, reject) => {
        worker.once('error', reject)
        worker.once('close', (code) => code === 0 ? resolve() : reject(new Error(`Native raster mislukt (${code}): ${diagnostic}`)))
      })
      void this.completed.catch(() => undefined)
      const header = Buffer.alloc(32)
      for (const [index, value] of [this.size.width, this.size.height, this.grid.width, this.grid.height].entries()) header.writeUInt32LE(value, index * 4)
      header.writeDoubleLE(WARP_CAP_CELLS, 16); header.writeDoubleLE(WARP_FADE_END_CELLS, 24)
      await this.write(header)
      await this.write(Buffer.from(this.columns.buffer)); await this.write(Buffer.from(this.rows.buffer)); await this.write(Buffer.from(this.colors.buffer))
    }
  }

  async compose(base: Uint8Array, frame: RainFrame): Promise<Buffer> {
    const rasterLength = this.grid.width * this.grid.height
    if (base.length !== this.size.width * this.size.height * 3 || frame.left.length !== rasterLength || frame.right.length !== rasterLength || (frame.motion && frame.motion.vectors.length !== frame.motion.width * frame.motion.height * 2)) throw new Error('Ongeldige native framemaat')
    await this.prepare()
    if (this.output) throw new Error('Native frames moeten op volgorde worden verwerkt')
    const leftWeight = (1 - frame.mix) ** FLOW_BLEND_CURVE, rightWeight = frame.mix ** FLOW_BLEND_CURVE
    const rgb = Buffer.allocUnsafe(this.size.width * this.size.height * 3)
    const received = new Promise<void>((finish, fail) => { this.output = { bytes: rgb, offset: 0, finish, fail } })
    void received.catch(() => undefined)
    const left = frame.mix === 1 ? frame.right : frame.left
    const right = frame.mix === 0 ? frame.left : frame.right
    const identify = (raster: Uint8Array) => {
      let id = this.frames.get(raster)
      if (id === undefined) { id = this.frames.size + 1; this.frames.set(raster, id) }
      return id
    }
    const leftId = identify(left), rightId = identify(right)
    const sendLeft = !this.resident.has(leftId), sendRight = rightId !== leftId && !this.resident.has(rightId)
    const header = Buffer.alloc(36)
    header.writeDoubleLE(rightWeight / Math.max(0.0001, leftWeight + rightWeight), 0)
    header.writeDoubleLE(frame.intervalMinutes, 8)
    header.writeUInt32LE(frame.motion?.width ?? 0, 16); header.writeUInt32LE(frame.motion?.height ?? 0, 20)
    header.writeUInt32LE(leftId, 24); header.writeUInt32LE(rightId, 28)
    header.writeUInt32LE(Number(sendLeft) | (Number(sendRight) << 1), 32)
    await this.write(header); await this.write(base)
    if (sendLeft) await this.write(left)
    if (sendRight) await this.write(right)
    this.resident = new Set([leftId, rightId])
    if (frame.motion) await this.write(new Uint8Array(frame.motion.vectors.buffer, frame.motion.vectors.byteOffset, frame.motion.vectors.byteLength))
    await Promise.race([received, this.completed!.then(() => { throw new Error('Native raster mist uitvoer') })])
    return rgb
  }

  async close(): Promise<void> {
    if (!this.worker) return
    this.worker.stdin.end()
    await this.completed
  }
}
