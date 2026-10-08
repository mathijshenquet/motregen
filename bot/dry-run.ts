import { TelegramApi, type TelegramMessage } from './api.js'
import { readConfig } from './config.js'
import { handleUpdate } from './handlers.js'
import { StillPhotos } from './photos.js'
import { createPoller } from './poller.js'
import { createRegister, TelegramRegister, writeRegister } from './register.js'
import type { RenderedMedia } from './render.js'
import type { StillManifest } from './stills.js'

export async function dryRunPrime(manifest: StillManifest, media: RenderedMedia[], path: string): Promise<void> {
  const started = performance.now()
  const ids = new Map<string, string>()
  let messageId = 0
  let document: unknown
  const calls: string[] = []
  const request: typeof fetch = async (url, options) => {
    const method = String(url).split('/').at(-1)!
    calls.push(method)
    const form = options?.body instanceof FormData ? options.body : undefined
    const fields = form ? Object.fromEntries(form.entries()) : JSON.parse(options!.body as string)
    const message = (kind: 'photo' | 'animation') => ({ message_id: ++messageId, chat: { id: -100123, type: 'supergroup' }, [kind]: kind === 'photo' ? [{ file_id: `dry-run-photo-${messageId}` }] : { file_id: `dry-run-animation-${messageId}` } })
    if (method === 'sendMediaGroup') {
      const album = JSON.parse(String(fields.media)) as unknown[]
      return Response.json({ ok: true, result: album.map(() => message('photo')) })
    }
    if (method === 'sendAnimation' && form) return Response.json({ ok: true, result: message('animation') })
    if (method === 'getChat') return Response.json({ ok: true, result: {} })
    if (method === 'sendDocument') {
      document = JSON.parse(await (form!.get('document') as File).text())
      return Response.json({ ok: true, result: { message_id: ++messageId } })
    }
    if (method === 'sendAnimation' && fields.animation !== ids.get(media.find((item) => item.key.startsWith('weather-loop-'))!.key)) throw new Error('Poller antwoordt niet uit het register')
    return Response.json({ ok: true, result: { message_id: ++messageId } })
  }
  const api = new TelegramApi('dry-run', request)
  const fileIds = {
    bot: 'dry-run',
    get: async (item: RenderedMedia) => ids.get(item.key),
    remember: async (item: RenderedMedia, message: TelegramMessage | true) => {
      if (message === true) return
      const fileId = item.kind === 'animation' ? message.animation?.file_id : message.photo?.at(-1)?.file_id
      if (fileId) ids.set(item.key, fileId)
    },
    forget: async (item: RenderedMedia) => { ids.delete(item.key) },
  }
  const photos = new StillPhotos(api, fileIds, '-100123', undefined, 0)
  await photos.prime(media)
  const register = await createRegister(42, manifest, media, fileIds)
  await writeRegister(path, register)
  await new TelegramRegister(api, '-100123', 42).publish(path)
  if (JSON.stringify(document) !== JSON.stringify(register)) throw new Error('Registerdocument wijkt af')
  const primeMs = Math.round(performance.now() - started)
  const config = readConfig({ TG_BOT_KEY: 'dry-run', MOTREGEN_BOT_ROLE: 'poller', MOTREGEN_REGISTER_PATH: path })
  const poller = await createPoller(config, api, { id: 42, username: 'motregen_bot' })
  await poller.refresh()
  await handleUpdate({ update_id: 1, message: { message_id: 1, chat: { id: 99, type: 'private' }, text: '/regen' } }, poller.runtime)
  if (calls.includes('getUpdates')) throw new Error('Dry-run mag geen updates lezen')
  console.info(JSON.stringify({ event: 'generation-dry-run-prime-receipt', generated: manifest.generated, count: register.entries.length, primeMs, registerPath: path, uploads: 'mocked', pacing: 'disabled', pollerRead: true, pollerFileIdReply: true }))
}
