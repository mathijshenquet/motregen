import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { TelegramUpdate } from './api.js'
import { LOOP_MODES, parseCallback } from './stills.js'

const COMMANDS = ['start', 'weer', ...LOOP_MODES.map((mode) => mode.command)] as const
const calendar = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' })

export interface TelegramUsageDay {
  day: string
  commands: Record<string, number>
  inline: number
  timeButtons: number
  placeButtons: number
  chats: { private: number; group: number }
  users: number
  usersLowerBound?: true
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

export class UsageCounts {
  private salt = randomBytes(32)
  private users = new Set<string>()
  private savedUsers = 0
  private pending = Promise.resolve()
  private totals: TelegramUsageDay

  private constructor(private readonly directory: string, private readonly username: string, private readonly now: () => Date) {
    this.totals = this.emptyDay()
  }

  static async open(directory: string, username: string, now = () => new Date()): Promise<UsageCounts> {
    const usage = new UsageCounts(directory, username, now)
    await mkdir(directory, { recursive: true })
    await usage.restore()
    return usage
  }

  record(update: TelegramUpdate): Promise<void> {
    return this.enqueue(async () => {
      await this.rollover()
      const message = update.message
      const callback = update.callback_query
      let interaction = false
      if (message?.text) {
        const match = /^\/(\w+)(?:@(\w+))?(?:\s|$)/.exec(message.text)
        if (match && (!match[2] || match[2].toLowerCase() === this.username.toLowerCase())) {
          const name = match[1]!.toLowerCase()
          const mode = LOOP_MODES.find((entry) => entry.command === name || (entry.aliases as readonly string[]).includes(name))
          const command = name === 'regen_rich' ? 'regen' : mode?.command ?? name
          if ((COMMANDS as readonly string[]).includes(command)) {
            this.totals.commands[command] = (this.totals.commands[command] ?? 0) + 1
            interaction = true
          }
        }
      }
      if (update.inline_query) {
        this.totals.inline++
        interaction = true
      }
      if (callback?.data?.startsWith('weer:')) {
        this.totals.placeButtons++
        interaction = true
      } else if (parseCallback(callback?.data)) {
        this.totals.timeButtons++
        interaction = true
      }
      if (!interaction) return
      const chatType = message?.chat.type ?? callback?.message?.chat.type
      if (chatType === 'private') this.totals.chats.private++
      else if (chatType === 'group' || chatType === 'supergroup') this.totals.chats.group++
      const user = message?.from ?? callback?.from ?? update.inline_query?.from
      if (user) this.users.add(createHash('sha256').update(this.salt).update(String(user.id)).digest('hex'))
    })
  }

  flush(): Promise<void> {
    return this.enqueue(async () => {
      await this.rollover()
      await this.save()
    })
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.pending.then(operation)
    this.pending = result.catch(() => undefined)
    return result
  }

  private emptyDay(): TelegramUsageDay {
    return { day: calendar.format(this.now()), commands: {}, inline: 0, timeButtons: 0, placeButtons: 0, chats: { private: 0, group: 0 }, users: 0 }
  }

  private async rollover(): Promise<void> {
    if (this.totals.day === calendar.format(this.now())) return
    await this.save()
    this.salt.fill(0)
    this.salt = randomBytes(32)
    this.users.clear()
    this.savedUsers = 0
    this.totals = this.emptyDay()
    await this.restore()
  }

  private async restore(): Promise<void> {
    let saved: TelegramUsageDay
    try {
      saved = JSON.parse(await readFile(join(this.directory, `${this.totals.day}.json`), 'utf8'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw new Error('Telegram-dagtelling kon niet worden gelezen')
    }
    if (saved?.day !== this.totals.day) throw new Error('Ongeldige Telegram-dagtelling')
    this.totals.commands = Object.fromEntries(COMMANDS.map((command) => [command, count(saved.commands?.[command])]))
    this.totals.inline = count(saved.inline)
    this.totals.timeButtons = count(saved.timeButtons)
    this.totals.placeButtons = count(saved.placeButtons)
    this.totals.chats = { private: count(saved.chats?.private), group: count(saved.chats?.group) }
    this.savedUsers = count(saved.users)
    this.totals.usersLowerBound = true
  }

  private async save(): Promise<void> {
    // Na herstart kunnen nieuwe hashes dezelfde mensen zijn: optellen zou geen ondergrens zijn.
    this.totals.users = Math.max(this.savedUsers, this.users.size)
    const path = join(this.directory, `${this.totals.day}.json`)
    await writeFile(`${path}.tmp`, `${JSON.stringify(this.totals)}\n`, { mode: 0o640 })
    await rename(`${path}.tmp`, path)
  }
}
