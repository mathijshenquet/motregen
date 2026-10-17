import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { TelegramUpdate } from './api.js'
import { UsageCounts } from './usage-counts.js'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))) })

async function setup(instant = '2026-10-17T12:00:00Z') {
  const directory = await mkdtemp(join(tmpdir(), 'motregen-usage-'))
  directories.push(directory)
  let now = new Date(instant)
  const clock = () => now
  const counts = await UsageCounts.open(directory, 'motregen_bot', clock)
  return { directory, counts, clock, setTime: (instant: string) => { now = new Date(instant) }, read: async (day = '2026-10-17') => JSON.parse(await readFile(join(directory, `${day}.json`), 'utf8')) }
}

function command(text: string, user = 987654321, type = 'private'): TelegramUpdate {
  return { update_id: 123456789, message: { message_id: 7654321, from: { id: user }, chat: { id: -123456789, type }, text } }
}

describe('Telegram dagtellingen', () => {
  it('telt hoofdcommando’s, aliassen, inline en beide soorten knoppen zonder botvreemde opdrachten', async () => {
    const { counts, read } = await setup()
    for (const text of ['/start', '/weer Amsterdam', '/regen ams', '/hitte', '/gevoel', '/TEMPERATUUR@Motregen_Bot', '/wind', '/regen_rich']) await counts.record(command(text))
    await counts.record(command('/weer@andere_bot geheim'))
    await counts.record(command('/onbekend geheim'))
    await counts.record(command('gewone tekst'))
    await counts.record(command('/wind', 24681012, 'supergroup'))
    await counts.record(command('/regen', 24681012, 'group'))
    await counts.record({ update_id: 1, inline_query: { id: 'inline-secret', query: 'plaatsnaam-secret', from: { id: 987654321 } } })
    await counts.record({ update_id: 2, callback_query: { id: 'callback-secret', data: 'weather:0', from: { id: 987654321 }, message: command('').message } })
    await counts.record({ update_id: 3, callback_query: { id: 'place-secret', data: 'weer:12345', from: { id: 987654321 } } })
    await counts.record({ update_id: 4, channel_post: { chat: { id: -111, type: 'channel' } } })
    await counts.flush()
    expect(await read()).toEqual({ day: '2026-10-17', commands: { start: 1, weer: 1, regen: 3, temperatuur: 3, wind: 2 }, inline: 1, timeButtons: 1, placeButtons: 1, chats: { private: 9, group: 2 }, users: 2 })
  })

  it.each(['2026-10-17T22:00:00Z', '2026-10-25T23:00:00Z'])('wisselt op lokale middernacht, ook na de wintertijdwissel (%s)', async (midnight) => {
    const instant = Date.parse(midnight)
    const { counts, read, setTime } = await setup(new Date(instant - 1000).toISOString())
    await counts.record(command('/regen'))
    setTime(new Date(instant).toISOString())
    await counts.record(command('/wind'))
    await counts.flush()
    const beforeDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date(instant - 1000))
    const afterDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date(instant))
    expect(await read(beforeDay)).toMatchObject({ commands: { regen: 1 }, users: 1 })
    expect(await read(afterDay)).toMatchObject({ commands: { wind: 1 }, users: 1 })
    expect((await read(afterDay)).commands.regen).toBeUndefined()
  })

  it('schrijft een stille dag en rolt ook zonder updates door', async () => {
    const { counts, read, setTime } = await setup()
    await counts.flush()
    setTime('2026-10-18T12:00:00Z')
    await counts.flush()
    expect(await read()).toMatchObject({ users: 0, commands: {} })
    expect(await read('2026-10-18')).toMatchObject({ users: 0, inline: 0 })
  })

  it('laadt tellingen terug en telt gebruikers als ondergrens zonder mensen dubbel op te tellen', async () => {
    const { directory, counts, clock, read } = await setup()
    await counts.record(command('/regen', 100))
    await counts.record(command('/regen', 200))
    await counts.flush()
    const restarted = await UsageCounts.open(directory, 'motregen_bot', clock)
    await restarted.record(command('/wind', 100))
    await restarted.flush()
    expect(await read()).toMatchObject({ commands: { regen: 2, wind: 1 }, users: 2, usersLowerBound: true })
    await restarted.record(command('/wind', 300))
    await restarted.record(command('/wind', 400))
    await restarted.flush()
    expect(await read()).toMatchObject({ users: 3, usersLowerBound: true })
  })

  it('bewaart uitsluitend dagtotalen, ook bij vervuilde teruggeladen JSON en gelijktijdig flushen', async () => {
    const { directory, counts, clock } = await setup()
    await counts.record(command('/weer Amsterdam gebruiker-secret'))
    await counts.flush()
    const path = join(directory, '2026-10-17.json')
    const saved = JSON.parse(await readFile(path, 'utf8'))
    await writeFile(path, JSON.stringify({ ...saved, salt: 'zout-secret', userId: 987654321, commands: { ...saved.commands, 'zoektekst-secret': 7 }, chats: { ...saved.chats, chatId: -123456789 } }))
    const restarted = await UsageCounts.open(directory, 'motregen_bot', clock)
    await Promise.all([restarted.record(command('/regen')), restarted.flush(), restarted.record(command('/regen')), restarted.flush()])
    const json = await readFile(path, 'utf8')
    expect(json).not.toMatch(/987654321|123456789|7654321|Amsterdam|secret|salt|hash|userId|chatId|T\d\d:/)
    expect(JSON.parse(json)).toMatchObject({ commands: { weer: 1, regen: 2 }, users: 1 })
    expect(await readdir(directory)).toEqual(['2026-10-17.json'])
  })
})
