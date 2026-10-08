import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { TelegramApi, TelegramMessage } from './api.js'
import type { RenderedMedia } from './render.js'
import { cacheKey, caption, LOOP_MODES, STILL_HOURS, stillEpoch, type MediaSelection, type StillManifest } from './stills.js'

export const REGISTER_FILENAME = 'motregen-register.json'
export const REGISTER_NOTICE = 'Nieuwste beschikbare generatie getoond.'

export interface MediaRegister {
  version: 1
  botId: number
  generated: string
  now: string
  entries: Array<{ selection: MediaSelection; fileId: string }>
}

export function registerSelections(): MediaSelection[] {
  return LOOP_MODES.flatMap((definition) => {
    const selections: MediaSelection[] = [{ mode: definition.mode, hour: 'loop' }]
    if (definition.mode !== 'wind') for (const hour of STILL_HOURS) selections.push({ mode: definition.mode, hour })
    return selections
  })
}

export function validateRegister(value: unknown, botId: number): MediaRegister {
  const register = value as MediaRegister | undefined
  if (!register || register.version !== 1 || register.botId !== botId || !Number.isFinite(Date.parse(register.generated)) || !Number.isFinite(Date.parse(register.now)) || !Array.isArray(register.entries)) throw new Error('Ongeldig mediaregister of andere bot')
  const expected = new Set(registerSelections().map(selectionKey))
  for (const entry of register.entries) {
    if (!entry || !entry.selection || typeof entry.fileId !== 'string' || !entry.fileId.trim() || !expected.delete(selectionKey(entry.selection))) throw new Error('Ongeldige registerselectie')
  }
  if (expected.size) throw new Error('Onvolledige registergeneratie')
  return register
}

export async function writeRegister(path: string, register: MediaRegister): Promise<void> {
  validateRegister(register, register.botId)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(`${path}.tmp`, JSON.stringify(register))
  await rename(`${path}.tmp`, path)
}

export async function createRegister(botId: number, manifest: StillManifest, media: RenderedMedia[], fileIds: { get(media: RenderedMedia): Promise<string | undefined> }): Promise<MediaRegister> {
  const selections = registerSelections()
  const entries: MediaRegister['entries'] = []
  for (const selection of selections) {
    const item = media.find((candidate) => candidate.key === cacheKey(selection, manifest) && candidate.generated === manifest.generated)
    const fileId = item && await fileIds.get(item)
    if (!fileId) throw new Error('Geen file_id voor de volledige generatie')
    entries.push({ selection, fileId })
  }
  return validateRegister({ version: 1, botId, generated: manifest.generated, now: manifest.now, entries }, botId)
}

export class TelegramRegister {
  private lastFileId?: string

  constructor(private readonly api: TelegramApi, private readonly chatId: string, private readonly botId: number) {}

  async read(): Promise<MediaRegister | undefined> {
    const message = await this.pinned()
    const document = message?.document
    if (!document || document.file_name !== REGISTER_FILENAME) throw new Error('Geen gepind mediaregister')
    if (document.file_id === this.lastFileId) return undefined
    const register = validateRegister(await this.api.downloadJson(document.file_id), this.botId)
    this.lastFileId = document.file_id
    return register
  }

  async publish(path: string): Promise<void> {
    validateRegister(JSON.parse(await readFile(path, 'utf8')), this.botId)
    const pinned = await this.pinned()
    const attachment = { name: 'document', mime: 'application/json', filename: REGISTER_FILENAME }
    if (pinned?.document?.file_name === REGISTER_FILENAME) {
      await this.api.upload('editMessageMedia', { chat_id: this.chatId, message_id: pinned.message_id, media: { type: 'document', media: 'attach://document', disable_content_type_detection: true } }, path, attachment)
      return
    }
    const message = await this.api.upload<TelegramMessage>('sendDocument', { chat_id: this.chatId, disable_notification: true, disable_content_type_detection: true }, path, attachment)
    await this.api.call('pinChatMessage', { chat_id: this.chatId, message_id: message.message_id, disable_notification: true })
  }

  private async pinned(): Promise<TelegramMessage | undefined> {
    const chat = await this.api.call<{ pinned_message?: TelegramMessage }>('getChat', { chat_id: this.chatId })
    return chat.pinned_message
  }
}

export class MediaUnavailableError extends Error {
  constructor() { super('Beeld wordt klaargezet, probeer zo opnieuw.') }
}

export class RegisterMedia {
  private generations = new Map<string, MediaRegister>()
  private latest?: MediaRegister

  constructor(private readonly botId: number) {}

  accept(value: unknown): void {
    const register = validateRegister(value, this.botId)
    if (this.latest && Date.parse(register.generated) < Date.parse(this.latest.generated)) return
    this.generations.set(register.generated, register)
    this.latest = register
    for (const [generated] of this.generations) {
      if (generated !== register.generated && Date.parse(generated) + 2 * 3_600_000 <= Date.now()) this.generations.delete(generated)
    }
  }

  currentManifest(): StillManifest {
    if (!this.latest) throw new MediaUnavailableError()
    return registerManifest(this.latest)
  }

  manifestForGeneration(generated: number): StillManifest | undefined {
    const register = [...this.generations.values()].find((entry) => Date.parse(entry.generated) === generated)
    return register && registerManifest(register)
  }

  available(selection: MediaSelection): RenderedMedia | undefined {
    if (!this.latest) return undefined
    return this.media(selection, registerManifest(this.latest))
  }

  media(selection: MediaSelection, manifest: StillManifest): RenderedMedia {
    const generation = this.generations.get(manifest.generated)
    let register = generation
    let entry = register?.entries.find((candidate) => selectionKey(candidate.selection) === selectionKey(selection))
    const fallback = !entry
    if (!entry) {
      register = this.latest
      entry = register?.entries.find((candidate) => selectionKey(candidate.selection) === selectionKey(selection))
    }
    if (!entry || !register) throw new MediaUnavailableError()
    const current = registerManifest(register)
    const animation = entry.selection.hour === 'loop'
    const epoch = animation ? Date.parse(current.now) : stillEpoch(current, entry.selection.hour as number)
    const base = { key: cacheKey(entry.selection, current), path: '', url: '', epoch, generated: register.generated, caption: caption(entry.selection.mode, epoch) + (fallback ? `\n${REGISTER_NOTICE}` : ''), milliseconds: 0, cached: true }
    if (animation) return { ...base, kind: 'animation', frames: 169, fps: 10, bytes: 0, renderMs: 0, encodeMs: 0 }
    return { ...base, kind: 'photo' }
  }

  async fileId(media: RenderedMedia): Promise<string | undefined> {
    const register = this.generations.get(media.generated)
    return register?.entries.find((entry) => cacheKey(entry.selection, registerManifest(register)) === media.key)?.fileId
  }
}

function registerManifest(register: MediaRegister): StillManifest {
  return { version: 0, generated: register.generated, now: register.now, chunks: [] }
}

function selectionKey(selection: MediaSelection): string {
  return `${selection.mode}:${selection.hour}`
}
