import { chromium, type Browser, type BrowserContext } from 'playwright'
import { access, mkdir, readdir, rename, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { STILL_CACHE_TTL } from './file-ids.js'
import { cacheKey, caption, presetUrl, stillEpoch, validateManifest, type StillManifest, type StillSelection } from './stills.js'

export interface RenderedStill {
  key: string
  path: string
  url: string
  epoch: number
  caption: string
  milliseconds: number
  cached: boolean
}

export class StillRenderer {
  private browser?: Browser
  private context?: BrowserContext
  private queue: Promise<unknown> = Promise.resolve()
  private pending = new Map<string, Promise<RenderedStill>>()

  constructor(private readonly origin: string, private readonly cacheDirectory: string) {}

  async manifest(): Promise<StillManifest> {
    const response = await fetch(new URL('/data/manifest.json', this.origin), { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error(`Manifest laden mislukt (${response.status})`)
    return validateManifest(await response.json())
  }

  render(selection: StillSelection, manifest: StillManifest): Promise<RenderedStill> {
    const key = cacheKey(selection, manifest)
    const existing = this.pending.get(key)
    if (existing) return existing
    const task = this.queue.then(() => this.renderOne(selection, manifest, key))
    this.queue = task.catch(() => undefined)
    this.pending.set(key, task)
    void task.finally(() => this.pending.delete(key)).catch(() => undefined)
    return task
  }

  async close(): Promise<void> {
    await this.queue
    await this.browser?.close()
    this.browser = undefined
    this.context = undefined
  }

  async prune(now = Date.now()): Promise<void> {
    await mkdir(this.cacheDirectory, { recursive: true })
    for (const name of await readdir(this.cacheDirectory)) {
      if (!/^(weather|air|feels|wind)-\d+-[a-f0-9]{24}\.jpg(?:\.file-id\.json)?(?:\.tmp)?$/.test(name)) continue
      const path = join(this.cacheDirectory, name)
      const metadata = await stat(path)
      if (now - metadata.mtimeMs > STILL_CACHE_TTL) await unlink(path)
    }
  }

  private async browserContext(): Promise<BrowserContext> {
    if (!this.browser?.isConnected()) {
      this.browser = await chromium.launch({
        executablePath: process.env.MOTREGEN_CHROMIUM_PATH,
        args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
      })
      this.context = await this.browser.newContext({
        viewport: { width: 640, height: 848 },
        deviceScaleFactor: 1.5,
        locale: 'nl-NL',
        timezoneId: 'Europe/Amsterdam',
        reducedMotion: 'reduce',
        serviceWorkers: 'block',
      })
    }
    return this.context!
  }

  private async renderOne(selection: StillSelection, manifest: StillManifest, key: string): Promise<RenderedStill> {
    const epoch = stillEpoch(manifest, selection.hour)
    const filename = `${key}.jpg`
    const path = join(this.cacheDirectory, filename)
    const description = caption(selection.mode, epoch)
    const result = { key, path, url: new URL(`/telegram/stills/${filename}`, this.origin).href, epoch, caption: description }
    try {
      await access(path)
      return { ...result, milliseconds: 0, cached: true }
    } catch {
      // Alleen complete, atomair hernoemde bestanden tellen als cache-hit.
    }
    const started = performance.now()
    const context = await this.browserContext()
    const page = await context.newPage()
    try {
      await mkdir(this.cacheDirectory, { recursive: true })
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
      await page.goto(presetUrl(this.origin, selection.mode, epoch, true), { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.waitForFunction(() => {
        const map = document.querySelector<HTMLElement>('.map')
        return map?.dataset.stillReady === 'true' || Boolean(map?.dataset.stillError)
      }, undefined, { timeout: 60_000 })
      const state = await page.locator('.map').evaluate((element) => ({
        error: (element as HTMLElement).dataset.stillError,
        generated: document.querySelector<HTMLElement>('.app-shell')?.dataset.generated,
        epoch: Number(document.querySelector<HTMLElement>('.app-shell')?.dataset.epoch),
      }))
      if (state.error) throw new Error(state.error)
      if (state.generated !== manifest.generated || Math.abs(state.epoch - epoch) >= 60_000) {
        throw new Error('Still wijkt af van de gevraagde manifestversie of tijd')
      }
      await page.waitForFunction(() => (window as unknown as { __motregenStillMapLoaded?: () => boolean }).__motregenStillMapLoaded?.())
      await page.evaluate(async () => { await document.fonts.ready })
      await page.screenshot({ path: `${path}.tmp`, type: 'jpeg', quality: 85 })
      await rename(`${path}.tmp`, path)
      const milliseconds = Math.round(performance.now() - started)
      console.info(JSON.stringify({ event: 'still-render', mode: selection.mode, hour: selection.hour, generated: manifest.generated, milliseconds }))
      return { ...result, milliseconds, cached: false }
    } finally {
      await page.close()
    }
  }
}
