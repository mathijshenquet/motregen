import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { access, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { STILL_CACHE_TTL } from './file-ids.js'
import { encodeLoop, encodeStill, framePath } from './encode.js'
import { sequencePlan } from './sequences.js'
import { cacheKey, caption, presetUrl, stillEpoch, stillTime, STILL_HOURS, validateManifest, type LoopMode, type LoopSelection, type MediaSelection, type StillManifest, type StillSelection } from './stills.js'

interface RenderedBase {
  key: string
  path: string
  url: string
  epoch: number
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
}
export type RenderedMedia = RenderedStill | RenderedLoop
interface RenderedSequence { loop: RenderedLoop; stills: RenderedStill[] }
interface SequenceMetrics { key: string; frames: number; fps: number; bytes: number; renderMs: number; encodeMs: number }

export class StillRenderer {
  private browser?: Browser
  private context?: BrowserContext
  private queue: Promise<unknown> = Promise.resolve()
  private pending = new Map<string, Promise<RenderedSequence>>()

  constructor(private readonly origin: string, private readonly cacheDirectory: string) {}

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
    return still
  }

  private sequence(mode: LoopMode, manifest: StillManifest): Promise<RenderedSequence> {
    const key = cacheKey({ mode, hour: 'loop' }, manifest)
    const existing = this.pending.get(key)
    if (existing) return existing
    // Cache-hits hoeven niet achter een nieuwe Chromium-render te wachten.
    const task = this.readCachedSequence(mode, manifest, key).then((cached) => {
      if (cached) return cached
      const render = this.queue.then(() => this.renderSequence(mode, manifest, key))
      this.queue = render.catch(() => undefined)
      return render
    })
    this.pending.set(key, task)
    void task.finally(() => this.pending.delete(key)).catch(() => undefined)
    return task
  }

  async close(): Promise<void> {
    await Promise.allSettled(this.pending.values())
    await this.queue
    await this.browser?.close()
    this.browser = undefined
    this.context = undefined
  }

  async prune(now = Date.now()): Promise<void> {
    await mkdir(this.cacheDirectory, { recursive: true })
    for (const name of await readdir(this.cacheDirectory)) {
      const temporaryFrames = /^\.frames-(weather|air|feels|wind)-loop-[a-f0-9]{24}-[a-zA-Z0-9]+$/.test(name)
      if (!temporaryFrames && !/^(weather|air|feels|wind)-(?:\d+|loop)-[a-f0-9]{24}\.(?:jpg|mp4|sequence\.json)(?:\.file-id\.json)?(?:\.tmp)?$/.test(name)) continue
      const path = join(this.cacheDirectory, name)
      try {
        const metadata = await stat(path)
        if (now - metadata.mtimeMs > STILL_CACHE_TTL) {
          if (temporaryFrames) await rm(path, { recursive: true, force: true })
          else await unlink(path)
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
  }

  private async browserContext(): Promise<BrowserContext> {
    if (!this.browser?.isConnected()) {
      this.browser = await chromium.launch({
        executablePath: process.env.MOTREGEN_CHROMIUM_PATH,
        args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
      })
      this.context = await this.browser.newContext({
        viewport: { width: 640, height: 848 }, deviceScaleFactor: 1.5,
        locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', reducedMotion: 'reduce', serviceWorkers: 'block',
      })
    }
    return this.context!
  }

  private media(selection: MediaSelection, manifest: StillManifest): RenderedBase {
    const key = cacheKey(selection, manifest)
    const filename = `${key}.${selection.hour === 'loop' ? 'mp4' : 'jpg'}`
    const epoch = selection.hour === 'loop' ? Date.parse(manifest.now) : stillEpoch(manifest, selection.hour)
    let description = caption(selection.mode, epoch)
    if (selection.hour === 'loop') {
      const plan = sequencePlan(selection.mode, manifest)
      const lastEpoch = plan.epochs[plan.loopFrames - 1]!
      description = `${stillTime(plan.epochs[0]!)} – ${stillTime(lastEpoch)} · Loop\n${description}`
    }
    return { key, path: join(this.cacheDirectory, filename), url: new URL(`/telegram/stills/${filename}`, this.origin).href, epoch, caption: description, milliseconds: 0, cached: true }
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
      if (metrics.key !== key || !Number.isFinite(metrics.frames) || !Number.isFinite(metrics.bytes)) return undefined
      const sequence = this.results(mode, manifest, metrics, true)
      await Promise.all([sequence.loop, ...sequence.stills].map((media) => access(media.path)))
      return sequence
    } catch {
      return undefined
    }
  }

  private async openSequence(page: Page, mode: LoopMode, manifest: StillManifest, epoch: number): Promise<void> {
    // Playwright-routing schakelt de HTTP-cache uit; alleen fetch vervangen houdt tiles/chunks warm.
    await page.addInitScript((pinnedManifest) => {
      const originalFetch = window.fetch.bind(window)
      window.fetch = (input, options) => {
        const address = input instanceof Request ? input.url : String(input)
        const url = new URL(address, window.location.href)
        if (url.origin === window.location.origin && url.pathname === '/data/manifest.json') {
          return Promise.resolve(new Response(JSON.stringify(pinnedManifest), { headers: { 'Content-Type': 'application/json' } }))
        }
        return originalFetch(input, options)
      }
    }, manifest)
    await page.goto(presetUrl(this.origin, mode, epoch, true), { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForFunction(() => {
      const map = document.querySelector<HTMLElement>('.map')
      return map?.dataset.stillReady === 'true' || Boolean(map?.dataset.stillError)
    }, undefined, { timeout: 60_000 })
    await page.waitForFunction(() => (window as unknown as { __motregenStillMapLoaded?: () => boolean }).__motregenStillMapLoaded?.())
  }

  private async renderSequence(mode: LoopMode, manifest: StillManifest, key: string): Promise<RenderedSequence> {
    const started = performance.now()
    await mkdir(this.cacheDirectory, { recursive: true })
    const directory = await mkdtemp(join(this.cacheDirectory, `.frames-${key}-`))
    let page: Page | undefined
    const plan = sequencePlan(mode, manifest)
    try {
      const context = await this.browserContext()
      page = await context.newPage()
      await this.openSequence(page, mode, manifest, plan.epochs[0]!)
      for (const [index, epoch] of plan.epochs.entries()) {
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
        await page.screenshot({ path: framePath(directory, index), type: 'png', timeout: 60_000 })
      }
      const renderMs = Math.round(performance.now() - started)
      const loop = this.media({ mode, hour: 'loop' }, manifest)
      const encoded = await encodeLoop(directory, `${loop.path}.tmp`, plan)
      const conversionsStarted = performance.now()
      for (const frame of plan.stillFrames) {
        if (mode === 'wind') throw new Error('Wind heeft geen stills')
        const still = this.media({ mode, hour: frame.hour }, manifest)
        await encodeStill(framePath(directory, frame.index), `${still.path}.tmp`)
        await rename(`${still.path}.tmp`, still.path)
      }
      await rename(`${loop.path}.tmp`, loop.path)
      const metrics = { key, frames: plan.loopFrames, fps: plan.fps, bytes: encoded.bytes, renderMs, encodeMs: encoded.milliseconds + Math.round(performance.now() - conversionsStarted) }
      const receipt = join(this.cacheDirectory, `${key}.sequence.json`)
      // Alleen complete, atomair gepubliceerde reeksen tellen als cache-hit.
      await writeFile(`${receipt}.tmp`, JSON.stringify(metrics))
      await rename(`${receipt}.tmp`, receipt)
      console.info(JSON.stringify({ event: 'sequence-render', mode, generated: manifest.generated, renderedFrames: plan.epochs.length, ...metrics }))
      return this.results(mode, manifest, metrics, false)
    } finally {
      try {
        await page?.close()
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }
  }
}
