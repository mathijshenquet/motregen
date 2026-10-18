import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteTestPost, messageLink, postRelease } from '../../tools/changelog-post'

let root: string
const token = 'test-token'
const chat = '-10012345'
function fixture(mediaCount: number, video = false): void {
  const media = Array.from({ length: mediaCount }, (_, index) => `  - file: changes/media/example.${video ? 'mp4' : 'webp'}\n    caption: Bijschrift ${index + 1}\n`).join('')
  writeFileSync(resolve(root, 'changes/v0.1.0/note.md'), `---\ntitle: Nieuwe kaart\nkind: beter\n${media ? `media:\n${media}` : ''}---\nDe regen is beter zichtbaar.\n`)
  if (mediaCount) execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=32x32:r=2', ...(video ? ['-t', '1', '-c:v', 'libx264'] : ['-frames:v', '1', '-c:v', 'libwebp']), resolve(root, 'changes/media', `example.${video ? 'mp4' : 'webp'}`)], { stdio: 'pipe' })
}
function success(result: unknown): Response { return new Response(JSON.stringify({ ok: true, result })) }
const captionSuccess: typeof fetch = async (url, init) => {
  if (!String(url).endsWith('/editMessageCaption')) throw new Error('Onverwacht verzoek')
  return success({ message_id: Number((init!.body as FormData).get('message_id')) })
}
function state(test = false): Record<string, unknown> { return JSON.parse(readFileSync(resolve(root, `changes/v0.1.0/posted${test ? '.test' : ''}.json`), 'utf8')) as Record<string, unknown> }

beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), 'motregen-poster-test-'))
  mkdirSync(resolve(root, 'changes/v0.1.0'), { recursive: true })
  mkdirSync(resolve(root, 'changes/media'), { recursive: true })
  writeFileSync(resolve(root, 'changes/v0.1.0/index.md'), '# v0.1.0\n\nDatum: 2026-10-16\n\n- [note.md](note.md)\n')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('Telegram publication', () => {
  it('dry-runs all text/captions without a token, network or state', async () => {
    fixture(2)
    const fetcher = vi.fn<typeof fetch>()
    const output = await postRelease(root, '0.1.0', chat, '', fetcher, { dryRun: true })
    expect(output).toContain('Nieuwe kaart')
    expect(output).toContain('Bijschrift 2')
    expect(output).toContain('los bericht per item')
    expect(output).toContain('2/2 → 1/2 (berichtlink na plaatsen)')
    expect(fetcher).not.toHaveBeenCalled()
    expect(existsSync(resolve(root, 'changes/v0.1.0/posted.json'))).toBe(false)
  })

  it('sends separate photos by default, persists ids and skips a completed release', async () => {
    fixture(2)
    const fetcher = vi.fn<typeof fetch>(captionSuccess).mockResolvedValueOnce(success({ message_id: 10 })).mockResolvedValueOnce(success({ message_id: 51 })).mockResolvedValueOnce(success({ message_id: 93 }))
    await postRelease(root, '0.1.0', chat, token, fetcher)
    expect(fetcher.mock.calls.map(([url]) => String(url).split('/').at(-1))).toEqual(['sendMessage', 'sendPhoto', 'sendPhoto', 'editMessageCaption', 'editMessageCaption'])
    const photo = fetcher.mock.calls[1]![1]!.body as FormData
    expect(photo.get('caption')).toBe('Nieuwe kaart (Bijschrift 1)\n\nDe regen is beter zichtbaar.\n\n16 oktober 2026, 1/2')
    expect(JSON.parse(String(photo.get('caption_entities')))).toEqual([{ type: 'bold', offset: 0, length: 'Nieuwe kaart (Bijschrift 1)'.length }])
    const edits = fetcher.mock.calls.slice(3).map(([, init]) => init!.body as FormData)
    expect(edits.map((body) => body.get('message_id'))).toEqual(['51', '93'])
    expect(edits.map((body) => JSON.parse(String(body.get('caption_entities')))[1])).toEqual([
      { type: 'text_link', offset: String(photo.get('caption')).lastIndexOf('1/2'), length: 3, url: 'https://t.me/c/12345/93' },
      { type: 'text_link', offset: String(photo.get('caption')).lastIndexOf('1/2'), length: 3, url: 'https://t.me/c/12345/51' },
    ])
    expect(state()).toMatchObject({ complete: true, message_ids: [10, 51, 93], media_sent: 2, links_updated: 2 })
    await expect(postRelease(root, '0.1.0', chat, '', fetcher)).resolves.toContain('al gepost')
    expect(fetcher).toHaveBeenCalledTimes(5)
    const legacy = state()
    delete legacy.links_updated
    writeFileSync(resolve(root, 'changes/v0.1.0/posted.json'), JSON.stringify(legacy))
    await expect(postRelease(root, '0.1.0', chat, '', fetcher)).resolves.toContain('al gepost')
    expect(fetcher).toHaveBeenCalledTimes(5)
    await expect(postRelease(root, '0.1.0', '-100999', token, fetcher)).rejects.toThrow('past niet')
  })

  it('posts one message per feature without a text message, and refuses a feature without media', async () => {
    fixture(2)
    const fetcher = vi.fn<typeof fetch>(captionSuccess).mockResolvedValueOnce(success({ message_id: 51 })).mockResolvedValueOnce(success({ message_id: 93 }))
    await postRelease(root, '0.1.0', chat, token, fetcher, { layout: 'posts' })
    expect(fetcher.mock.calls.map(([url]) => String(url).split('/').at(-1))).toEqual(['sendPhoto', 'sendPhoto', 'editMessageCaption', 'editMessageCaption'])
    const edits = fetcher.mock.calls.slice(2).map(([, init]) => init!.body as FormData)
    expect(edits.map((body) => body.get('message_id'))).toEqual(['51', '93'])
    expect(state()).toMatchObject({ complete: true, text_sent: false, message_ids: [51, 93], layout: 'posts' })
    rmSync(resolve(root, 'changes/v0.1.0/posted.json'))
    fixture(0)
    await expect(postRelease(root, '0.1.0', chat, token, fetcher, { layout: 'posts', dryRun: true })).rejects.toThrow('elke notitie')
  })

  it('supports albums with independent captions and skips repeating the text after a known rejection', async () => {
    fixture(2)
    const fetcher = vi.fn<typeof fetch>(captionSuccess).mockResolvedValueOnce(success({ message_id: 20 })).mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 429 })).mockResolvedValueOnce(success([{ message_id: 21 }, { message_id: 22 }]))
    await expect(postRelease(root, '0.1.0', chat, token, fetcher, { layout: 'album' })).rejects.toThrow('wees sendMediaGroup af')
    expect(state()).toMatchObject({ text_sent: true, pending: null, complete: false })
    await postRelease(root, '0.1.0', chat, token, fetcher, { layout: 'album' })
    expect(fetcher.mock.calls.map(([url]) => String(url).split('/').at(-1))).toEqual(['sendMessage', 'sendMediaGroup', 'sendMediaGroup', 'editMessageCaption', 'editMessageCaption'])
    const album = JSON.parse(String((fetcher.mock.calls[2]![1]!.body as FormData).get('media'))) as { caption: string; caption_entities: unknown[] }[]
    expect(album.map((item) => item.caption)).toEqual([
      'Nieuwe kaart (Bijschrift 1)\n\nDe regen is beter zichtbaar.\n\n16 oktober 2026, 1/2',
      'Nieuwe kaart (Bijschrift 2)\n\nDe regen is beter zichtbaar.\n\n16 oktober 2026, 2/2',
    ])
    expect(album.every((item) => item.caption_entities.length === 1)).toBe(true)
    expect(state()).toMatchObject({ complete: true, message_ids: [20, 21, 22] })
  })

  it('resumes after the last successful separate item', async () => {
    fixture(2)
    const fetcher = vi.fn<typeof fetch>(captionSuccess).mockResolvedValueOnce(success({ message_id: 30 })).mockResolvedValueOnce(success({ message_id: 31 })).mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 400 })).mockResolvedValueOnce(success({ message_id: 32 }))
    await expect(postRelease(root, '0.1.0', chat, token, fetcher)).rejects.toThrow('af')
    expect(state()).toMatchObject({ media_sent: 1 })
    await postRelease(root, '0.1.0', chat, token, fetcher)
    expect((fetcher.mock.calls[3]![1]!.body as FormData).get('caption')).toBe('Nieuwe kaart (Bijschrift 2)\n\nDe regen is beter zichtbaar.\n\n16 oktober 2026, 2/2')
    expect(state()).toMatchObject({ message_ids: [30, 31, 32], complete: true })
  })

  it('refuses automatic retries after an uncertain network outcome and redacts the token', async () => {
    fixture(0)
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error(`failed https://api.telegram.org/bot${token}/sendMessage`))
    const attempt = postRelease(root, '0.1.0', chat, token, fetcher)
    await expect(attempt).rejects.toThrow('onzeker')
    await expect(attempt).rejects.not.toThrow(token)
    await expect(postRelease(root, '0.1.0', chat, token, fetcher)).rejects.toThrow('Onzekere eerdere')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('handles one video without trying to send a one-item album', async () => {
    fixture(1, true)
    const fetcher = vi.fn<typeof fetch>(captionSuccess).mockResolvedValueOnce(success({ message_id: 40 })).mockResolvedValueOnce(success({ message_id: 41 }))
    await postRelease(root, '0.1.0', chat, token, fetcher, { layout: 'album' })
    expect(fetcher.mock.calls[1]![0]).toContain('/sendVideo')
    expect((fetcher.mock.calls[1]![1]!.body as FormData).get('supports_streaming')).toBe('true')
    expect(JSON.parse(String((fetcher.mock.calls[2]![1]!.body as FormData).get('caption_entities')))[1].url).toBe('https://t.me/c/12345/41')
  })

  it('marks every TEST message and deletes only TEST ids once', async () => {
    fixture(1)
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(success({ message_id: 50 })).mockResolvedValueOnce(success({ message_id: 51 })).mockImplementation(async (url, init) => String(url).endsWith('/deleteMessage') ? success(true) : captionSuccess(url, init))
    await postRelease(root, '0.1.0', chat, token, fetcher, { test: true })
    expect(String((fetcher.mock.calls[0]![1]!.body as FormData).get('text'))).toMatch(/^TEST\n/)
    expect(String((fetcher.mock.calls[1]![1]!.body as FormData).get('caption'))).toMatch(/^TEST\n/)
    expect(existsSync(resolve(root, 'changes/v0.1.0/posted.json'))).toBe(false)
    await deleteTestPost(root, '0.1.0', chat, token, fetcher)
    expect(state(true)).toMatchObject({ deleted_ids: [50, 51] })
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/deleteMessage')).map(([, init]) => (init!.body as URLSearchParams).get('message_id'))).toEqual(['50', '51'])
    await deleteTestPost(root, '0.1.0', chat, token, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(5)
  })

  it('keeps literal markup and emoji intact while making only the title bold after TEST', async () => {
    fixture(1)
    const path = resolve(root, 'changes/v0.1.0/note.md')
    writeFileSync(path, readFileSync(path, 'utf8').replace('Nieuwe kaart', 'Nieuwe 🌦 kaart <&>').replace('De regen is beter zichtbaar.', '<b>Letterlijke tekst & regen</b>.'))
    const fetcher = vi.fn<typeof fetch>(captionSuccess).mockResolvedValueOnce(success({ message_id: 60 })).mockResolvedValueOnce(success({ message_id: 61 }))
    await postRelease(root, '0.1.0', chat, token, fetcher, { test: true })
    const photo = fetcher.mock.calls[1]![1]!.body as FormData
    const title = 'Nieuwe 🌦 kaart <&> (Bijschrift 1)'
    expect(photo.get('caption')).toBe(`TEST\n${title}\n\n<b>Letterlijke tekst & regen</b>.\n\n16 oktober 2026, 1/1`)
    expect(photo.get('parse_mode')).toBe(null)
    expect(JSON.parse(String(photo.get('caption_entities')))).toEqual([{ type: 'bold', offset: 5, length: title.length }])
    const linked = fetcher.mock.calls[2]![1]!.body as FormData
    expect(JSON.parse(String(linked.get('caption_entities')))[1].offset).toBe(String(photo.get('caption')).lastIndexOf('1/1'))
  })

  it('rejects an oversized complete caption before sending or writing posting state', async () => {
    fixture(1)
    const path = resolve(root, 'changes/v0.1.0/note.md')
    writeFileSync(path, readFileSync(path, 'utf8').replace('De regen is beter zichtbaar.', 'Regen '.repeat(166)))
    const fetcher = vi.fn<typeof fetch>()
    // Body blijft binnen de notitielimiet; titel, datum en positie maken het bijschrift te lang.
    for (const dryRun of [true, false]) await expect(postRelease(root, '0.1.0', chat, token, fetcher, { dryRun })).rejects.toThrow('1024 tekens')
    expect(fetcher).not.toHaveBeenCalled()
    expect(existsSync(resolve(root, 'changes/v0.1.0/posted.json'))).toBe(false)
    expect(existsSync(resolve(root, 'changes/v0.1.0/posted.lock'))).toBe(false)
  })

  it('resumes an uncertain link edit safely, including Telegram reporting the caption unchanged', async () => {
    fixture(2)
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(success({ message_id: 70 }))
      .mockResolvedValueOnce(success({ message_id: 71 }))
      .mockResolvedValueOnce(success({ message_id: 72 }))
      .mockRejectedValueOnce(new Error(`failed https://api.telegram.org/bot${token}/editMessageCaption`))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error_code: 400, description: 'Bad Request: message is not modified' }), { status: 400 }))
      .mockResolvedValueOnce(success({ message_id: 72 }))
    const attempt = postRelease(root, '0.1.0', chat, token, fetcher)
    await expect(attempt).rejects.toThrow('veilig hervatten')
    await expect(attempt).rejects.not.toThrow(token)
    expect(state()).toMatchObject({ complete: false, pending: null, media_sent: 2, links_updated: 0 })
    await postRelease(root, '0.1.0', chat, token, fetcher)
    expect(fetcher.mock.calls.slice(3).every(([url]) => String(url).endsWith('/editMessageCaption'))).toBe(true)
    expect(state()).toMatchObject({ complete: true, message_ids: [70, 71, 72], links_updated: 2 })
  })

  it('keeps confirmed link progress when a later edit is rejected', async () => {
    fixture(2)
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(success({ message_id: 80 }))
      .mockResolvedValueOnce(success({ message_id: 81 }))
      .mockResolvedValueOnce(success({ message_id: 82 }))
      .mockResolvedValueOnce(success({ message_id: 81 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 429 }))
      .mockResolvedValueOnce(success({ message_id: 82 }))
    await expect(postRelease(root, '0.1.0', chat, token, fetcher)).rejects.toThrow('veilig hervatten')
    expect(state()).toMatchObject({ complete: false, links_updated: 1 })
    await postRelease(root, '0.1.0', chat, token, fetcher)
    expect((fetcher.mock.calls[5]![1]!.body as FormData).get('message_id')).toBe('82')
    expect(fetcher).toHaveBeenCalledTimes(6)
    expect(state()).toMatchObject({ complete: true, links_updated: 2 })
  })

  it('uses public permalinks for handles and rejects unsupported chats before posting media', async () => {
    expect(messageLink('@motregen_updates', 9)).toBe('https://t.me/motregen_updates/9')
    expect(messageLink('-1000000012345', 9)).toBe('https://t.me/c/12345/9')
    fixture(1)
    const fetcher = vi.fn<typeof fetch>()
    await expect(postRelease(root, '0.1.0', '-12345', token, fetcher)).rejects.toThrow('Berichtlinks vereisen')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('refuses to link an album when Telegram returns fewer message ids than media items', async () => {
    fixture(2)
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(success({ message_id: 90 })).mockResolvedValueOnce(success([{ message_id: 91 }]))
    await expect(postRelease(root, '0.1.0', chat, token, fetcher, { layout: 'album' })).rejects.toThrow('geen passende message-ids')
    expect(state()).toMatchObject({ complete: false, pending: 'media', links_updated: 0 })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
