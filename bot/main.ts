import { setTimeout as delay } from 'node:timers/promises'
import { TelegramApi, TelegramApiError, type TelegramUpdate } from './api.js'
import { readConfig } from './config.js'
import { configureBot, handleUpdate, type BotRuntime } from './handlers.js'
import { StillRenderer, type RenderedStill } from './render.js'
import { FileIdCache } from './file-ids.js'
import { StillPhotos } from './photos.js'
import { MessageSelections } from './selections.js'
import { STILL_HOURS, STILL_MODES, type StillManifest, type StillSelection } from './stills.js'

async function runBot(): Promise<void> {
  const config = readConfig()
  const api = new TelegramApi(config.token)
  const identity = await api.call<{ username: string }>('getMe')
  const webhook = await api.call<{ url: string }>('getWebhookInfo')
  if (webhook.url) throw new Error('Webhook staat aan; schakel die uit voordat long polling start')
  const renderer = new StillRenderer(config.origin, config.cacheDirectory)
  const controller = new AbortController()
  const available = new Map<string, RenderedStill>()
  let manifest: StillManifest | undefined
  const runtime: BotRuntime = {
    api, config, renderer, username: identity.username,
    photos: new StillPhotos(api, new FileIdCache(identity.username)),
    selections: new MessageSelections(),
    currentManifest: async () => manifest ?? renderer.manifest(),
    availableStill: (selection) => available.get(selectionKey(selection)),
  }
  const stop = () => controller.abort()
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
  console.info(JSON.stringify({ event: 'bot-started', username: identity.username }))
  try {
    await configureBot(runtime)
    await Promise.all([pollUpdates(runtime, controller.signal), refreshStills(runtime, available, (current) => { manifest = current }, controller.signal)])
  } finally {
    controller.abort()
    await renderer.close()
  }
}

async function pollUpdates(runtime: BotRuntime, signal: AbortSignal): Promise<void> {
  let offset = 0
  while (!signal.aborted) {
    try {
      const updates = await runtime.api.call<TelegramUpdate[]>('getUpdates', {
        offset, timeout: 25, allowed_updates: ['message', 'inline_query', 'callback_query'],
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

async function refreshStills(runtime: BotRuntime, available: Map<string, RenderedStill>, publish: (manifest: StillManifest) => void, signal: AbortSignal): Promise<void> {
  let renderedGeneration = ''
  while (!signal.aborted) {
    try {
      await runtime.renderer.prune()
      const manifest = await runtime.renderer.manifest()
      publish(manifest)
      if (manifest.generated !== renderedGeneration) {
        const started = performance.now()
        for (const hour of STILL_HOURS) {
          for (const definition of STILL_MODES) {
            if (signal.aborted) return
            const selection: StillSelection = { mode: definition.mode, hour }
            const still = await runtime.renderer.render(selection, manifest)
            available.set(selectionKey(selection), still)
          }
        }
        renderedGeneration = manifest.generated
        console.info(JSON.stringify({ event: 'stills-refresh', generated: manifest.generated, count: available.size, milliseconds: Math.round(performance.now() - started) }))
      }
    } catch (error) {
      reportFailure('refresh', error)
    }
    await delay(15_000, undefined, { signal }).catch(() => undefined)
  }
}

function selectionKey(selection: StillSelection): string {
  return `${selection.mode}:${selection.hour}`
}

function retryDelay(error: unknown): number {
  if (error instanceof TelegramApiError && error.retryAfter) return error.retryAfter * 1000
  return 5000
}

function reportFailure(event: string, error: unknown): void {
  // Geen exceptiontekst: fetch/Playwright kan URL's, bot-token of verzoekinhoud opnemen.
  console.error(JSON.stringify({ event: `${event}-failed`, code: error instanceof TelegramApiError ? error.code : undefined }))
}

void runBot().catch(() => {
  console.error('Bot kon niet starten; controleer configuratie, netwerk en actieve poller.')
  process.exitCode = 1
})
