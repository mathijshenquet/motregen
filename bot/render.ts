import { NativeMaps } from './native-map.js'
import { FRAME } from './config.js'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { access, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { STILL_CACHE_TTL } from './file-ids.js'
import { encodeLoop, encodeStill, framePath } from './encode.js'
import { nativeRenderer } from './native-settings.js'
import { NativeModesRenderer } from './native-modes-render.js'
import { NativeWeatherRenderer, nativeFramePath } from './native-render.js'
import { sequencePlan } from './sequences.js'
import { openRenderPage } from './render-open.js'
import { StillRenderError } from './render-error.js'
export { StillRenderError } from './render-error.js'
import { cacheKey, caption, stillEpoch, STILL_HOURS, validateManifest, type LoopMode, type LoopSelection, type MediaSelection, type StillManifest, type StillSelection } from './stills.js'

interface RenderedBase {
  key: string
  path: string
  url: string
  epoch: number
  generated: string
  caption: string
  milliseconds: number
  cached: boolean
}

export interface RenderedStill extends RenderedBase { kind: 'photo' }
export interface RenderedLoop extends RenderedBase {
  kind: 'animation'
  frames: number
  fps: number
  bytes: number
  renderMs: number
  encodeMs: number
  openMs?: number
  backend?: 'native' | 'playwright'
  loopMs?: number
  loopRenderMs?: number
  preparationMs?: number
}
export type RenderedMedia = RenderedStill | RenderedLoop
interface RenderedSequence { loop: RenderedLoop; stills: RenderedStill[] }
interface SequenceMetrics { key: string; frames: number; fps: number; bytes: number; renderMs: number; encodeMs: number; openMs?: number; backend?: 'native' | 'playwright'; loopMs?: number; loopRenderMs?: number; preparationMs?: number }

export class StillRenderer {
  private readonly nativeLoops = new Map<string, { ready: Promise<void>; finish: () => void }>()
  private readonly native: NativeWeatherRenderer
  private readonly nativeModes: NativeModesRenderer
  private browser?: Browser
  private context?: BrowserContext
  private queues: Promise<unknown>[] = Array.from({ length: 4 }, () => Promise.resolve())
  private nativeQueue: Promise<unknown> = Promise.resolve()
  private nextQueue = 0
  private opening?: Promise<BrowserContext>
  private pending = new Map<string, Promise<RenderedSequence>>()
  private pendingStills = new Map<string, Promise<RenderedStill>>()

  constructor(private readonly origin: string, private readonly cacheDirectory: string) {
    const maps = new NativeMaps(origin, cacheDirectory, () => this.browserContext())
    this.native = new NativeWeatherRenderer(origin, cacheDirectory, () => this.browserContext(), maps)
    this.nativeModes = new NativeModesRenderer(origin, cacheDirectory, () => this.browserContext(), maps)
  }

  async manifest(): Promise<StillManifest> {
    const response = await fetch(new URL('/data/manifest.json', this.origin), { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error(`Manifest laden mislukt (${response.status})`)
    return validateManifest(await response.json())
  }

  render(selection: StillSelection, manifest: StillManifest): Promise<RenderedStill>
  render(selection: LoopSelection, manifest: StillManifest): Promise<RenderedLoop>
  render(selection: MediaSelection, manifest: StillManifest): Promise<RenderedMedia>
  async render(selection: MediaSelection, manifest: StillManifest): Promise<RenderedMedia> {
    const sequence = await this.sequence(selection.mode, manifest)
    if (selection.hour === 'loop') return sequence.loop
    const key = cacheKey(selection, manifest)
    const still = sequence.stills.find((candidate) => candidate.key === key)
    if (!still) throw new Error('Still ontbreekt in de framereeks')
    const frame = sequencePlan(selection.mode, manifest).stillFrames.find((candidate) => candidate.hour === selection.hour)
    if (!frame) throw new Error('Stillframe ontbreekt in de framereeks')
    const loopKey = cacheKey({ mode: selection.mode, hour: 'loop' }, manifest)
    const path = sequence.loop.backend === 'native' ? nativeFramePath(this.frameDirectory(loopKey), frame.index) : framePath(this.frameDirectory(loopKey), frame.index)
    return this.convertStill(still, path)
  }

  private sequence(mode: LoopMode, manifest: StillManifest): Promise<RenderedSequence> {
    const key = cacheKey({ mode, hour: 'loop' }, manifest)
    const existing = this.pending.get(key)
    if (existing) return existing
    const nativeLoopKey = cacheKey({ mode: 'weather', hour: 'loop' }, manifest)
    if (mode === 'weather' && nativeRenderer(mode) === 'native') {
      let finish!: () => void
      const ready = new Promise<void>((resolve) => { finish = resolve })
      this.nativeLoops.set(nativeLoopKey, { ready, finish })
    }
    // Cache-hits hoeven niet achter een nieuwe Chromium-render te wachten.
    const task = this.readCachedSequence(mode, manifest, key).then((cached) => {
      if (cached) return cached
      if (nativeRenderer(mode) === 'native') {
        const render = this.nativeQueue.then(() => this.renderSequence(mode, manifest, key))
        this.nativeQueue = render.catch(() => undefined)
        return render
      }
      const index = this.nextQueue++ % this.queues.length
      const render = this.queues[index]!.then(() => this.renderSequence(mode, manifest, key))
      this.queues[index] = render.catch(() => undefined)
      return render
    })
    this.pending.set(key, task)
    void task.finally(() => {
      this.pending.delete(key)
      if (mode === 'weather') { this.nativeLoops.get(nativeLoopKey)?.finish(); this.nativeLoops.delete(nativeLoopKey) }
    }).catch(() => undefined)
    return task
  }

  async close(): Promise<void> {
    await Promise.allSettled(this.pending.values())
    await Promise.allSettled(this.pendingStills.values())
    await Promise.all(this.queues)
    await this.nativeQueue
    await this.browser?.close()
    this.browser = undefined
    this.context = undefined
  }

  async prune(now = Date.now()): Promise<void> {
    await mkdir(this.cacheDirectory, { recursive: true })
    for (const name of await readdir(this.cacheDirectory)) {
      const temporaryFrames = /^\.frames-(weather|air|feels|wind)-loop-[a-f0-9]{24}-[a-zA-Z0-9]+$/.test(name)
      const storedFrames = /^(weather|air|feels|wind)-loop-[a-f0-9]{24}\.frames$/.test(name)
      const fieldText = /^isoline-text-[a-f0-9]{24}\.png$/.test(name)
      if (!temporaryFrames && !storedFrames && !fieldText && !/^(weather|air|feels|wind)-(?:\d+|loop)-[a-f0-9]{24}\.(?:jpg|mp4|sequence\.json)(?:\.file-id\.json)?(?:\.tmp)?$/.test(name)) continue
      const path = join(this.cacheDirectory, name)
      try {
        const metadata = await stat(path)
        if (now - metadata.mtimeMs > STILL_CACHE_TTL) {
          if (temporaryFrames || storedFrames) await rm(path, { recursive: true, force: true })
          else await unlink(path)
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
  }

  private frameDirectory(key: string): string {
    return join(this.cacheDirectory, `${key}.frames`)
  }

  private convertStill(still: RenderedStill, frame: string): Promise<RenderedStill> {
    const existing = this.pendingStills.get(still.key)
    if (existing) return existing
    const conversion = (async () => {
      try {
        await access(still.path)
        return { ...still, cached: true, milliseconds: 0 }
      } catch {
        const started = performance.now()
        await encodeStill(frame, `${still.path}.tmp`)
        await rename(`${still.path}.tmp`, still.path)
        const milliseconds = Math.round(performance.now() - started)
        console.info(JSON.stringify({ event: 'still-encoded', key: still.key, milliseconds }))
        return { ...still, cached: false, milliseconds: still.milliseconds + milliseconds }
      }
    })()
    this.pendingStills.set(still.key, conversion)
    void conversion.finally(() => this.pendingStills.delete(still.key)).catch(() => undefined)
    return conversion
  }

  private async browserContext(): Promise<BrowserContext> {
    if (this.opening) return this.opening
    if (this.browser?.isConnected() && this.context) return this.context
    const opening = (async () => {
      this.browser = await chromium.launch({
        executablePath: process.env.MOTREGEN_CHROMIUM_PATH,
        args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
      })
      this.context = await this.browser.newContext({
        viewport: { width: FRAME.width, height: FRAME.height }, deviceScaleFactor: FRAME.scale,
        locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', reducedMotion: 'reduce', serviceWorkers: 'block',
      })
      return this.context
    })()
    this.opening = opening
    try { return await opening } finally { this.opening = undefined }
  }

  private media(selection: MediaSelection, manifest: StillManifest): RenderedBase {
    const key = cacheKey(selection, manifest)
    const filename = `${key}.${selection.hour === 'loop' ? 'mp4' : 'jpg'}`
    const epoch = selection.hour === 'loop' ? Date.parse(manifest.now) : stillEpoch(manifest, selection.hour)
    const description = caption(selection.mode, epoch)
    return { key, path: join(this.cacheDirectory, filename), url: new URL(`/telegram/stills/${filename}`, this.origin).href, epoch, generated: manifest.generated, caption: description, milliseconds: 0, cached: true }
  }

  private results(mode: LoopMode, manifest: StillManifest, metrics: SequenceMetrics, cached: boolean): RenderedSequence {
    const milliseconds = cached ? 0 : metrics.renderMs + metrics.encodeMs
    const loop: RenderedLoop = { ...this.media({ mode, hour: 'loop' }, manifest), kind: 'animation', ...metrics, milliseconds, cached }
    const stills: RenderedStill[] = mode === 'wind' ? [] : STILL_HOURS.map((hour) => ({ ...this.media({ mode, hour }, manifest), kind: 'photo', milliseconds, cached }))
    return { loop, stills }
  }

  private async readCachedSequence(mode: LoopMode, manifest: StillManifest, key: string): Promise<RenderedSequence | undefined> {
    try {
      const path = join(this.cacheDirectory, `${key}.sequence.json`)
      const metadata = await stat(path)
      if (Date.now() - metadata.mtimeMs >= STILL_CACHE_TTL) return undefined
      const metrics = JSON.parse(await readFile(path, 'utf8')) as SequenceMetrics
      const plan = sequencePlan(mode, manifest)
      if (metrics.key !== key || metrics.frames !== plan.loopFrames || metrics.fps !== plan.fps || !Number.isFinite(metrics.bytes)) return undefined
      const sequence = this.results(mode, manifest, metrics, true)
      await access(sequence.loop.path)
      const directory = this.frameDirectory(key)
      const indexes = metrics.backend === 'native' ? plan.stillFrames.map((frame) => frame.index) : plan.epochs.map((_epoch, index) => index)
      await Promise.all(indexes.map((index) => access(metrics.backend === 'native' ? nativeFramePath(directory, index) : framePath(directory, index))))
      return sequence
    } catch {
      return undefined
    }
  }

  private async renderNativeSequence(mode: LoopMode, manifest: StillManifest, key: string): Promise<RenderedSequence> {
    await mkdir(this.cacheDirectory, { recursive: true })
    const directory = await mkdtemp(join(this.cacheDirectory, `.frames-${key}-`))
    const loop = this.media({ mode: mode, hour: 'loop' }, manifest)
    try {
      const plan = sequencePlan(mode, manifest)
      const rendered = mode === 'weather' ? await this.native.render(manifest, plan, directory, `${loop.path}.tmp`, () => this.nativeLoops.get(key)?.finish()) : await this.nativeModes.render(mode, manifest, plan, directory, `${loop.path}.tmp`)
      await rename(`${loop.path}.tmp`, loop.path)
      const publishedFrames = this.frameDirectory(key)
      await rm(publishedFrames, { recursive: true, force: true })
      await rename(directory, publishedFrames)
      const metrics: SequenceMetrics = { key, frames: plan.loopFrames, fps: plan.fps, ...rendered, backend: 'native' }
      const receipt = join(this.cacheDirectory, `${key}.sequence.json`)
      await writeFile(`${receipt}.tmp`, JSON.stringify(metrics))
      await rename(`${receipt}.tmp`, receipt)
      console.info(JSON.stringify({ event: 'sequence-render', mode: mode, generated: manifest.generated, renderedFrames: plan.epochs.length, ...metrics }))
      return this.results(mode, manifest, metrics, false)
    } catch (error) {
      throw new StillRenderError(mode, 'native', undefined, error)
    } finally { await rm(directory, { recursive: true, force: true }) }
  }

  private async renderSequence(mode: LoopMode, manifest: StillManifest, key: string): Promise<RenderedSequence> {
    if (nativeRenderer(mode) === 'native') return this.renderNativeSequence(mode, manifest, key)
    // SwiftShader deelt de twee VM-kernen; laat de korte native loop eerst afmaken.
    await this.nativeLoops.get(cacheKey({ mode: 'weather', hour: 'loop' }, manifest))?.ready
    const started = performance.now()
    await mkdir(this.cacheDirectory, { recursive: true })
    const directory = await mkdtemp(join(this.cacheDirectory, `.frames-${key}-`))
    let page: Page | undefined
    let phase = 'open'
    let frameIndex: number | undefined
    const plan = sequencePlan(mode, manifest)
    try {
      const context = await this.browserContext()
      page = await context.newPage()
      const capture = await context.newCDPSession(page)
      const openMs = await openRenderPage(page, this.origin, mode, manifest, plan.epochs[0]!)
      for (const [index, epoch] of plan.epochs.entries()) {
        phase = 'frame'
        frameIndex = index
        await page.evaluate(async ({ epoch, simulationMs, regime }) => {
          const render = (window as unknown as { __motregenRenderFrame: (epoch: number, simulationMs: number) => Promise<void> }).__motregenRenderFrame
          await render(epoch, simulationMs)
          const clock = document.querySelector<HTMLElement>('.still-clock')!
          if (regime) clock.dataset.regime = regime
        }, { epoch, simulationMs: mode === 'wind' ? 1_000 + index * 1_000 / plan.fps : 0, regime: mode === 'weather' ? epoch <= Date.parse(manifest.now) ? 'history' : 'forecast' : '' })
        const state = await page.locator('.map').evaluate((element) => ({
          error: (element as HTMLElement).dataset.stillError,
          generated: document.querySelector<HTMLElement>('.app-shell')?.dataset.generated,
          epoch: Number(document.querySelector<HTMLElement>('.app-shell')?.dataset.epoch),
        }))
        if (state.error) throw new Error(state.error)
        if (state.generated !== manifest.generated || Math.abs(state.epoch - epoch) >= 60_000) throw new Error('Frame wijkt af van de gevraagde manifestversie of tijd')
        phase = 'capture'
        const screenshot = await capture.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false, optimizeForSpeed: true, clip: { x: 0, y: 0, width: FRAME.width, height: FRAME.height, scale: FRAME.scale } })
        await writeFile(framePath(directory, index), Buffer.from(screenshot.data, 'base64'))
      }
      const renderMs = Math.round(performance.now() - started)
      phase = 'encode'
      const loop = this.media({ mode, hour: 'loop' }, manifest)
      const encoded = await encodeLoop(directory, `${loop.path}.tmp`, plan)
      phase = 'publish'
      await rename(`${loop.path}.tmp`, loop.path)
      const publishedFrames = this.frameDirectory(key)
      await rm(publishedFrames, { recursive: true, force: true })
      await rename(directory, publishedFrames)
      const metrics = { key, frames: plan.loopFrames, fps: plan.fps, bytes: encoded.bytes, renderMs, encodeMs: encoded.milliseconds, openMs }
      const receipt = join(this.cacheDirectory, `${key}.sequence.json`)
      // Alleen complete, atomair gepubliceerde reeksen tellen als cache-hit.
      await writeFile(`${receipt}.tmp`, JSON.stringify(metrics))
      await rename(`${receipt}.tmp`, receipt)
      console.info(JSON.stringify({ event: 'sequence-render', mode, generated: manifest.generated, renderedFrames: plan.epochs.length, ...metrics }))
      return this.results(mode, manifest, metrics, false)
    } catch (error) {
      throw new StillRenderError(mode, phase, frameIndex, error)
    } finally {
      try {
        await page?.close()
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }
  }
}
