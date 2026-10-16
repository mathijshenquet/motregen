import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteTestPost, postRelease } from '../../tools/changelog-post'

let root: string
const token = 'test-token'
const chat = '-12345'
function fixture(mediaCount: number, video = false): void {
  const media = Array.from({ length: mediaCount }, (_, index) => `  - file: changes/media/example.${video ? 'mp4' : 'webp'}\n    caption: Bijschrift ${index + 1}\n`).join('')
  writeFileSync(resolve(root, 'changes/v0.1.0/note.md'), `---\ntitle: Nieuwe kaart\nkind: beter\n${media ? `media:\n${media}` : ''}---\nDe regen is beter zichtbaar.\n`)
  if (mediaCount) execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=32x32:r=2', ...(video ? ['-t', '1', '-c:v', 'libx264'] : ['-frames:v', '1', '-c:v', 'libwebp']), resolve(root, 'changes/media', `example.${video ? 'mp4' : 'webp'}`)], { stdio: 'pipe' })
}
function success(result: unknown): Response { return new Response(JSON.stringify({ ok: true, result })) }
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
    expect(fetcher).not.toHaveBeenCalled()
    expect(existsSync(resolve(root, 'changes/v0.1.0/posted.json'))).toBe(false)
  })

  it('sends separate photos by default, persists ids and skips a completed release', async () => {
    fixture(2)
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(success({ message_id: 10 })).mockResolvedValueOnce(success({ message_id: 11 })).mockResolvedValueOnce(success({ message_id: 12 }))
    await postRelease(root, '0.1.0', chat, token, fetcher)
    expect(fetcher.mock.calls.map(([url]) => String(url).split('/').at(-1))).toEqual(['sendMessage', 'sendPhoto', 'sendPhoto'])
    expect((fetcher.mock.calls[1]![1]!.body as FormData).get('caption')).toBe('Bijschrift 1')
    expect(state()).toMatchObject({ complete: true, message_ids: [10, 11, 12], media_sent: 2 })
    await expect(postRelease(root, '0.1.0', chat, '', fetcher)).resolves.toContain('al gepost')
    expect(fetcher).toHaveBeenCalledTimes(3)
    await expect(postRelease(root, '0.1.0', '-999', token, fetcher)).rejects.toThrow('past niet')
  })

  it('supports albums with independent captions and skips repeating the text after a known rejection', async () => {
    fixture(2)
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(success({ message_id: 20 })).mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 429 })).mockResolvedValueOnce(success([{ message_id: 21 }, { message_id: 22 }]))
    await expect(postRelease(root, '0.1.0', chat, token, fetcher, { layout: 'album' })).rejects.toThrow('wees sendMediaGroup af')
    expect(state()).toMatchObject({ text_sent: true, pending: null, complete: false })
    await postRelease(root, '0.1.0', chat, token, fetcher, { layout: 'album' })
    expect(fetcher.mock.calls.map(([url]) => String(url).split('/').at(-1))).toEqual(['sendMessage', 'sendMediaGroup', 'sendMediaGroup'])
    const album = JSON.parse(String((fetcher.mock.calls[2]![1]!.body as FormData).get('media'))) as { caption: string }[]
    expect(album.map((item) => item.caption)).toEqual(['Bijschrift 1', 'Bijschrift 2'])
    expect(state()).toMatchObject({ complete: true, message_ids: [20, 21, 22] })
  })

  it('resumes after the last successful separate item', async () => {
    fixture(2)
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(success({ message_id: 30 })).mockResolvedValueOnce(success({ message_id: 31 })).mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 400 })).mockResolvedValueOnce(success({ message_id: 32 }))
    await expect(postRelease(root, '0.1.0', chat, token, fetcher)).rejects.toThrow('af')
    expect(state()).toMatchObject({ media_sent: 1 })
    await postRelease(root, '0.1.0', chat, token, fetcher)
    expect((fetcher.mock.calls[3]![1]!.body as FormData).get('caption')).toBe('Bijschrift 2')
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
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(success({ message_id: 40 })).mockResolvedValueOnce(success({ message_id: 41 }))
    await postRelease(root, '0.1.0', chat, token, fetcher, { layout: 'album' })
    expect(fetcher.mock.calls[1]![0]).toContain('/sendVideo')
    expect((fetcher.mock.calls[1]![1]!.body as FormData).get('supports_streaming')).toBe('true')
  })

  it('marks every TEST message and deletes only TEST ids once', async () => {
    fixture(1)
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(success({ message_id: 50 })).mockResolvedValueOnce(success({ message_id: 51 })).mockImplementation(async () => success(true))
    await postRelease(root, '0.1.0', chat, token, fetcher, { test: true })
    expect(String((fetcher.mock.calls[0]![1]!.body as FormData).get('text'))).toMatch(/^TEST\n/)
    expect(String((fetcher.mock.calls[1]![1]!.body as FormData).get('caption'))).toMatch(/^TEST\n/)
    expect(existsSync(resolve(root, 'changes/v0.1.0/posted.json'))).toBe(false)
    await deleteTestPost(root, '0.1.0', chat, token, fetcher)
    expect(state(true)).toMatchObject({ deleted_ids: [50, 51] })
    expect(fetcher.mock.calls.slice(2).map(([, init]) => (init!.body as URLSearchParams).get('message_id'))).toEqual(['50', '51'])
    await deleteTestPost(root, '0.1.0', chat, token, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(4)
  })
})
