import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, existsSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mediaPath, readRelease, repositoryRoot, type Release } from './changelog'

interface PostedState {
  version: string
  chat_id: string
  fingerprint: string
  message_ids: number[]
  text_sent: boolean
  complete: boolean
  pending: 'text' | 'media' | null
  deleted_ids?: number[]
  layout: 'items' | 'album'
  media_sent: number
  links_updated: number
}
interface TelegramMessage { message_id: number }
interface CaptionEntity { type: string; offset: number; length: number; url?: string }
type Fetch = typeof fetch
interface PostOptions { dryRun?: boolean; test?: boolean; layout?: 'items' | 'album' }

export function releaseText(release: Release): string {
  const text = `Motregen Updates · v${release.version}\n\n${release.notes.map((note) => `${note.title}\n${note.body}`).join('\n\n')}\n\nhttps://motregen.nl/changelog#v${release.version}`
  if (text.length > 4096) throw new Error('Releasetekst is langer dan Telegram toelaat (4096 tekens)')
  return text
}

export function releaseMedia(release: Release, test = false) {
  const items = release.notes.flatMap((note) => note.media.map((item) => ({ note, item })))
  const date = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${release.date}T00:00:00Z`))
  return items.map(({ note, item }, index) => {
    const prefix = test ? 'TEST\n' : ''
    const title = `${note.title} (${item.caption})`
    const caption = `${prefix}${title}\n\n${note.body}\n\n${date}, ${index + 1}/${items.length}`
    if (caption.length > 1024) throw new Error(`Telegram-bijschrift voor ${item.file} is langer dan 1024 tekens, inclusief titel, datum en eventuele TEST-prefix`)
    return { file: item.file, caption, caption_entities: [{ type: 'bold', offset: prefix.length, length: title.length }] }
  })
}

export function messageLink(chatId: string, messageId: number): string {
  if (!Number.isSafeInteger(messageId) || messageId <= 0) throw new Error('Ongeldig bericht-id voor navigatie')
  if (/^@[a-zA-Z][a-zA-Z0-9_]{4,}$/.test(chatId)) return `https://t.me/${chatId.slice(1)}/${messageId}`
  const channel = /^-100(\d+)$/.exec(chatId)?.[1]
  if (!channel || BigInt(channel) === 0n) throw new Error('Berichtlinks vereisen een @kanaal of -100-kanaal/chat-id')
  return `https://t.me/c/${BigInt(channel)}/${messageId}`
}

export function linkedCaption(item: { caption: string; caption_entities: CaptionEntity[] }, chatId: string, nextId: number) {
  const position = /(\d+\/\d+)[.!]?\s*$/.exec(item.caption)
  if (!position) throw new Error('k/n ontbreekt onderaan het bijschrift')
  const entities = item.caption_entities.filter((entity) => entity.type !== 'text_link' || entity.offset !== position.index)
  return { caption: item.caption, caption_entities: [...entities, { type: 'text_link', offset: position.index, length: position[1]!.length, url: messageLink(chatId, nextId) }] }
}

export async function postRelease(root: string, version: string, chatId: string, token: string, fetcher: Fetch = fetch, options: PostOptions = {}): Promise<string> {
  const { dryRun = false, test = false, layout = 'items' } = options
  if (!/^(?:-?\d+|@[a-zA-Z][a-zA-Z0-9_]{4,})$/.test(chatId)) throw new Error('Ongeldig chat-id of @kanaal')
  const release = readRelease(root, version)
  const text = `${test ? 'TEST\n' : ''}${releaseText(release)}`
  const media = releaseMedia(release, test)
  if (text.length > 4096) throw new Error('TEST-prefix maakt de Telegram-tekst te lang')
  if (media.length > 10) throw new Error('Een release kan maximaal 10 media-items bevatten')
  if (media.length) messageLink(chatId, 1)
  const fingerprint = createHash('sha256').update(JSON.stringify(release))
  for (const item of media) fingerprint.update(readFileSync(mediaPath(root, item.file)))
  const digest = fingerprint.update(layout).digest('hex')
  const directory = resolve(root, `changes/v${version}`)
  const statePath = resolve(directory, test ? 'posted.test.json' : 'posted.json')
  const lockPath = resolve(directory, 'posted.lock')
  if (dryRun) return `Chat: ${chatId}\nMedia: ${layout === 'album' ? 'album (los item bij één bestand)' : 'los bericht per item'}\n\n${text}\n\n${media.map((item, index) => `${item.file}: ${item.caption}\nNavigatie: ${index + 1}/${media.length} → ${(index + 1) % media.length + 1}/${media.length} (berichtlink na plaatsen)`).join('\n')}\nGeen berichten verstuurd.`
  let lock: number
  try { lock = openSync(lockPath, 'wx', 0o600) } catch { throw new Error('Postvergrendeling bestaat; controleer eerst of een andere posttool draait') }
  try {
    let state: PostedState = { version, chat_id: chatId, fingerprint: digest, message_ids: [], text_sent: false, complete: false, pending: null, layout, media_sent: 0, links_updated: 0 }
    if (existsSync(statePath)) {
      state = JSON.parse(readFileSync(statePath, 'utf8')) as PostedState
      if (state.links_updated === undefined) state.links_updated = 0
      if (state.version !== version || state.chat_id !== chatId || state.fingerprint !== digest || state.layout !== layout || !Number.isSafeInteger(state.media_sent) || state.media_sent < 0 || state.media_sent > media.length || !Number.isSafeInteger(state.links_updated) || state.links_updated < 0 || state.links_updated > media.length || !Array.isArray(state.message_ids) || !state.message_ids.every((id) => Number.isSafeInteger(id) && id > 0) || typeof state.complete !== 'boolean' || typeof state.text_sent !== 'boolean' || ![null, 'text', 'media'].includes(state.pending) || state.message_ids.length !== Number(state.text_sent) + state.media_sent) throw new Error('posted.json past niet bij deze release/chat/opmaak of is ongeldig')
      if (state.complete) return `v${version} is al gepost (${state.message_ids.join(', ')}).`
      if (state.pending) throw new Error(`Onzekere eerdere ${state.pending}-post: controleer Telegram en herstel posted.json vóór een nieuwe poging`)
    }
    if (!token) throw new Error('TG_BOT_KEY ontbreekt')
    const persist = () => {
      writeFileSync(`${statePath}.tmp`, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
      renameSync(`${statePath}.tmp`, statePath)
    }
    const attachments = media.map((item) => {
      const video = item.file.endsWith('.mp4')
      const path = mediaPath(root, item.file)
      // De bron blijft WebP; Telegram-fotoalbums krijgen JPEG om stickerinterpretatie te vermijden.
      const bytes = video ? readFileSync(path) : execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-q:v', '2', 'pipe:1'], { maxBuffer: 12_000_000 })
      return { item, video, blob: new Blob([new Uint8Array(bytes)], { type: video ? 'video/mp4' : 'image/jpeg' }) }
    })
    const request = async (method: string, body: FormData, phase: 'text' | 'media', expectedCount = 1): Promise<TelegramMessage[]> => {
      state.pending = phase
      persist()
      let response: Response
      try { response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', body, signal: AbortSignal.timeout(60_000) }) }
      catch { throw new Error('Telegram-resultaat onzeker; controleer de chat vóór hervatten (posted.json)') }
      let result: { ok: boolean; result: TelegramMessage | TelegramMessage[] }
      try { result = await response.json() as typeof result } catch { throw new Error('Telegram-antwoord onleesbaar; controleer de chat vóór hervatten') }
      if (!result.ok) {
        state.pending = null
        persist()
        throw new Error(`Telegram wees ${method} af (HTTP ${response.status}); dezelfde opdracht kan opnieuw`)
      }
      const messages = Array.isArray(result.result) ? result.result : [result.result]
      if (messages.length !== expectedCount || messages.some((message) => !Number.isSafeInteger(message?.message_id) || message.message_id <= 0)) throw new Error('Telegram gaf geen passende message-ids; controleer de chat')
      state.message_ids.push(...messages.map((message) => message.message_id))
      state.pending = null
      return messages
    }
    if (!state.text_sent) {
      const body = new FormData()
      body.set('chat_id', chatId)
      body.set('text', text)
      body.set('link_preview_options', JSON.stringify({ is_disabled: true }))
      await request('sendMessage', body, 'text')
      state.text_sent = true
      persist()
    }
    if (attachments.length > state.media_sent && (layout === 'items' || attachments.length === 1)) {
      for (const attachment of attachments.slice(state.media_sent)) {
        const body = new FormData()
        body.set('chat_id', chatId)
        body.set(attachment.video ? 'video' : 'photo', attachment.blob, attachment.video ? 'media.mp4' : 'media.jpg')
        body.set('caption', attachment.item.caption)
        body.set('caption_entities', JSON.stringify(attachment.item.caption_entities))
        if (attachment.video) body.set('supports_streaming', 'true')
        await request(attachment.video ? 'sendVideo' : 'sendPhoto', body, 'media')
        state.media_sent++
        persist()
      }
    } else if (attachments.length > state.media_sent) {
      const body = new FormData()
      body.set('chat_id', chatId)
      const album = attachments.map((attachment, index) => {
        const name = `media${index}`
        body.set(name, attachment.blob, `${name}.${attachment.video ? 'mp4' : 'jpg'}`)
        return { type: attachment.video ? 'video' : 'photo', media: `attach://${name}`, caption: attachment.item.caption, caption_entities: attachment.item.caption_entities, ...(attachment.video ? { supports_streaming: true } : {}) }
      })
      body.set('media', JSON.stringify(album))
      await request('sendMediaGroup', body, 'media', attachments.length)
      state.media_sent = attachments.length
      persist()
    }
    const mediaIds = state.message_ids.slice(1)
    if (mediaIds.length !== media.length) throw new Error('Bericht-ids passen niet bij media; controleer posted.json')
    for (let index = state.links_updated; index < media.length; index++) {
      const messageId = mediaIds[index]!
      const nextId = mediaIds[(index + 1) % media.length]!
      const caption = linkedCaption(media[index]!, chatId, nextId)
      const body = new FormData()
      body.set('chat_id', chatId)
      body.set('message_id', String(messageId))
      body.set('caption', caption.caption)
      body.set('caption_entities', JSON.stringify(caption.caption_entities))
      let result: { ok: boolean; result?: TelegramMessage; error_code?: number; description?: string }
      try {
        const response = await fetcher(`https://api.telegram.org/bot${token}/editMessageCaption`, { method: 'POST', body, signal: AbortSignal.timeout(30_000) })
        result = await response.json() as typeof result
      } catch { throw new Error('Telegram-linkbewerking onzeker; dezelfde opdracht kan veilig hervatten zonder opnieuw te posten') }
      const unchanged = !result.ok && result.error_code === 400 && result.description?.includes('message is not modified')
      if (!unchanged && (!result.ok || result.result?.message_id !== messageId)) throw new Error('Telegram-linkbewerking niet bevestigd; dezelfde opdracht kan veilig hervatten zonder opnieuw te posten')
      state.links_updated = index + 1
      persist()
    }
    state.complete = true
    persist()
    return `v${version} gepost (${state.message_ids.join(', ')}).`
  } finally {
    closeSync(lock)
    unlinkSync(lockPath)
  }
}

export async function deleteTestPost(root: string, version: string, chatId: string, token: string, fetcher: Fetch = fetch): Promise<string> {
  readRelease(root, version)
  if (!token) throw new Error('TG_BOT_KEY ontbreekt')
  const path = resolve(root, `changes/v${version}/posted.test.json`)
  const state = JSON.parse(readFileSync(path, 'utf8')) as PostedState
  if (state.version !== version || state.chat_id !== chatId || !state.complete || !Array.isArray(state.message_ids) || !state.message_ids.every(Number.isSafeInteger)) throw new Error('Geen voltooide TEST-post voor deze release/chat')
  state.deleted_ids ??= []
  for (const messageId of state.message_ids) {
    if (state.deleted_ids.includes(messageId)) continue
    let result: { ok: boolean }
    try {
      const response = await fetcher(`https://api.telegram.org/bot${token}/deleteMessage`, { method: 'POST', body: new URLSearchParams({ chat_id: chatId, message_id: String(messageId) }), signal: AbortSignal.timeout(30_000) })
      result = await response.json() as typeof result
    } catch { throw new Error(`Verwijderen TEST-bericht ${messageId} onzeker; controleer de chat`) }
    if (!result.ok) throw new Error(`Telegram kon TEST-bericht ${messageId} niet verwijderen`)
    state.deleted_ids.push(messageId)
    writeFileSync(`${path}.tmp`, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
    renameSync(`${path}.tmp`, path)
  }
  return `TEST-berichten verwijderd: ${state.deleted_ids.join(', ')}.`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [version, chatId, ...flags] = process.argv.slice(2)
    if (!version || !chatId || flags.some((flag) => !['--dry-run', '--test', '--delete-test', '--album'].includes(flag)) || (flags.includes('--delete-test') && flags.length !== 1)) throw new Error('Gebruik: pnpm changelog:post <versie> <chat-id> [--dry-run] [--test] [--album] | --delete-test')
    const environmentPath = resolve(repositoryRoot, '.env')
    if (existsSync(environmentPath)) process.loadEnvFile(environmentPath)
    console.log(flags.includes('--delete-test') ? await deleteTestPost(repositoryRoot, version, chatId, process.env.TG_BOT_KEY ?? '') : await postRelease(repositoryRoot, version, chatId, process.env.TG_BOT_KEY ?? '', fetch, { dryRun: flags.includes('--dry-run'), test: flags.includes('--test'), layout: flags.includes('--album') ? 'album' : 'items' }))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Telegram-publicatie mislukt')
    process.exitCode = 1
  }
}
