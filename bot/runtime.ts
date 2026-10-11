import { setTimeout as delay } from 'node:timers/promises'
import { join } from 'node:path'
import { TelegramApi, TelegramApiError, type TelegramUpdate } from './api.js'
import { validateCacheChat, type BotConfig } from './config.js'
import { configureBot, handleUpdate, type BotRuntime } from './handlers.js'
import type { StillRenderer, RenderedMedia } from './render.js'
import { StillRenderError } from './render-error.js'
import { FileIdCache, FRAME_RETENTION } from './file-ids.js'
import { StillPhotos } from './photos.js'
import { MessageSelections } from './selections.js'
import { PREWARM_HOURS, STILL_HOURS, LOOP_MODES, type StillManifest, type MediaSelection } from './stills.js'
import { createPoller } from './poller.js'
import { createPlaceWeather } from './place-weather.js'
import { createRegister, REGISTER_FILENAME, TelegramRegister, writeRegister } from './register.js'

export async function runBot(config: BotConfig, api = new TelegramApi(config.token), signal?: AbortSignal): Promise<void> {
  const identity = await api.call<{ id: number; username: string }>('getMe')
  await validateCacheChat(api, config.cacheChatId, identity.id, config.role === 'renderer')
  if (config.role !== 'renderer') {
    const webhook = await api.call<{ url: string }>('getWebhookInfo')
    if (webhook.url) throw new Error('Webhook staat aan; schakel die uit voordat long polling start')
  }
  const controller = new AbortController()
  const stop = () => controller.abort()
  if (signal?.aborted) stop()
  signal?.addEventListener('abort', stop, { once: true })
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
  let renderer: StillRenderer | undefined
  const tasks: Promise<void>[] = []
  try {
    console.info(JSON.stringify({ event: 'bot-started', role: config.role, username: identity.username }))
    if (config.role === 'poller') {
      const poller = await createPoller(config, api, identity)
      await poller.refresh().catch((error) => reportFailure('register', error))
      await configureBot(poller.runtime)
      tasks.push(pollUpdates(poller.runtime, controller.signal), refreshRegister(poller.refresh, controller.signal))
      await Promise.all(tasks)
      return
    }
    const { StillRenderer } = await import('./render.js')
    renderer = new StillRenderer(config.origin, config.cacheDirectory)
    if (config.role === 'renderer') {
      const photos = new StillPhotos(api, new FileIdCache(`bot:${identity.id}`), config.cacheChatId, config.cacheDirectory)
      const transport = new TelegramRegister(api, config.cacheChatId!, identity.id)
      await refreshRendered(renderer, photos, new Map(), async (current, media) => {
        const register = await createRegister(identity.id, current, media, photos.fileIds)
        const path = join(config.cacheDirectory, REGISTER_FILENAME)
        await writeRegister(path, register)
        await transport.publish(path)
      }, controller.signal, true)
      return
    }
    const runtime = combinedRuntime(config, api, identity, renderer)
    await configureBot(runtime.bot)
    tasks.push(pollUpdates(runtime.bot, controller.signal), refreshRendered(renderer, runtime.photos, runtime.available, runtime.publish, controller.signal))
    await Promise.all(tasks)
  } finally {
    controller.abort()
    await Promise.allSettled(tasks)
    await renderer?.close()
    signal?.removeEventListener('abort', stop)
    process.removeListener('SIGTERM', stop)
    process.removeListener('SIGINT', stop)
  }
}

function combinedRuntime(config: BotConfig, api: TelegramApi, identity: { id: number; username: string }, renderer: StillRenderer) {
  const available = new Map<string, RenderedMedia>()
  const photos = new StillPhotos(api, new FileIdCache(identity.username), config.cacheChatId, config.cacheDirectory)
  let manifest: StillManifest | undefined
  const generations = new Map<number, { manifest: StillManifest; expires: number }>()
  const rememberGeneration = (current: StillManifest) => {
    const now = Date.now()
    for (const [key, entry] of generations) if (entry.expires <= now) generations.delete(key)
    // Niet langer dan de frames bestaan: een oudere generatie zou anders opnieuw gerenderd worden.
    generations.set(Date.parse(current.generated), { manifest: current, expires: Date.parse(current.generated) + FRAME_RETENTION })
  }
  const runtime: BotRuntime = {
    api, config, renderer, username: identity.username,
    weather: createPlaceWeather(config, api, identity.id),
    photos,
    selections: new MessageSelections(),
    currentManifest: async () => {
      const current = manifest ?? await renderer.manifest()
      rememberGeneration(current)
      return current
    },
    manifestForGeneration: (generated) => {
      const entry = generations.get(generated)
      return entry && entry.expires > Date.now() ? entry.manifest : undefined
    },
    availableStill: (selection) => available.get(selectionKey(selection)),
  }
  return {
    bot: runtime, photos, available,
    publish: async (current: StillManifest) => {
      manifest = current
      rememberGeneration(current)
    },
  }
}

async function refreshRegister(refresh: () => Promise<void>, signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    await delay(15_000, undefined, { signal }).catch(() => undefined)
    if (signal.aborted) return
    await refresh().catch((error) => reportFailure('register', error))
  }
}

async function pollUpdates(runtime: BotRuntime, signal: AbortSignal): Promise<void> {
  let offset = 0
  while (!signal.aborted) {
    try {
      const updates = await runtime.api.call<TelegramUpdate[]>('getUpdates', {
        offset, timeout: 25, allowed_updates: ['message', 'inline_query', 'callback_query', 'channel_post', 'my_chat_member'],
      }, signal)
      for (const update of updates) {
        if (signal.aborted) return
        try {
          await handleUpdate(update, runtime)
        } catch (error) {
          reportFailure('update', error)
        }
        offset = update.update_id + 1
      }
    } catch (error) {
      if (signal.aborted) return
      reportFailure('poll', error)
      if (error instanceof TelegramApiError && error.code === 409) throw error
      await delay(retryDelay(error), undefined, { signal }).catch(() => undefined)
    }
  }
}

async function refreshRendered(renderer: StillRenderer, photos: StillPhotos, available: Map<string, RenderedMedia>, publish: (manifest: StillManifest, media: RenderedMedia[]) => Promise<void>, signal: AbortSignal, fullMatrix = false): Promise<void> {
  let renderedGeneration = ''
  while (!signal.aborted) {
    let step = 'prune'
    let mode: string | undefined
    try {
      await renderer.prune()
      step = 'manifest'
      const manifest = await renderer.manifest()
      if (manifest.generated !== renderedGeneration) {
        const started = performance.now()
        const next = new Map<string, RenderedMedia>()
        step = 'render'
        const renders = await Promise.allSettled(LOOP_MODES.map(async (definition) => {
          const loopSelection = { mode: definition.mode, hour: 'loop' } as const
          try {
            next.set(selectionKey(loopSelection), await renderer.render(loopSelection, manifest))
            if (definition.mode === 'wind' || signal.aborted) return
            for (const hour of fullMatrix ? STILL_HOURS : PREWARM_HOURS) {
              if (signal.aborted) return
              const selection = { mode: definition.mode, hour }
              next.set(selectionKey(selection), await renderer.render(selection, manifest))
            }
          } catch (error) {
            mode = definition.mode
            throw error
          }
        }))
        const failedIndex = renders.findIndex((result) => result.status === 'rejected')
        const failed = renders[failedIndex]
        if (failed?.status === 'rejected') {
          mode = LOOP_MODES[failedIndex]!.mode
          throw failed.reason
        }
        if (signal.aborted) return
        step = 'prime'
        mode = undefined
        const renderMs = Math.round(performance.now() - started)
        await photos.prime([...next.values()])
        if (signal.aborted) return
        await publish(manifest, [...next.values()])
        await photos.retainGeneration(manifest.generated)
        available.clear()
        for (const [key, media] of next) available.set(key, media)
        renderedGeneration = manifest.generated
        console.info(JSON.stringify({ event: 'stills-refresh', generated: manifest.generated, count: available.size, renderMs, primeMs: Math.round(performance.now() - started) - renderMs, milliseconds: Math.round(performance.now() - started) }))
      }
    } catch (error) {
      if (signal.aborted) console.info(JSON.stringify({ event: 'refresh-interrupted', step, mode }))
      else reportFailure('refresh', error, { step, mode })
    }
    await delay(15_000, undefined, { signal }).catch(() => undefined)
  }
}

function selectionKey(selection: MediaSelection): string {
  return `${selection.mode}:${selection.hour}`
}

function retryDelay(error: unknown): number {
  if (error instanceof TelegramApiError && error.retryAfter) return error.retryAfter * 1000
  return 5000
}

function reportFailure(event: string, error: unknown, context: { step?: string; mode?: string } = {}): void {
  // Geen exceptiontekst: fetch/Playwright kan URL's, bot-token of verzoekinhoud opnemen.
  const renderError = error instanceof StillRenderError ? error : undefined
  console.error(JSON.stringify({ event: `${event}-failed`, ...context, phase: renderError?.phase, frame: renderError?.frame, method: error instanceof TelegramApiError ? error.method : undefined, code: error instanceof TelegramApiError ? error.code : undefined, reason: renderError?.timeout ? 'TimeoutError' : error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? error.name : undefined }))
}
