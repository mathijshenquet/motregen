import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { maxMediaBytes, readNote, readRelease, readVersion, validateChanges } from '../../tools/changelog'
import { bumpVersion, release } from '../../tools/release'
import { renderChangelogPage } from './changelog-page'

let root: string
function write(path: string, content: string | Buffer): void { writeFileSync(resolve(root, path), content) }
function note(extra = '', body = 'Je ziet de regen nu duidelijker.'): void {
  write('changes/pending/regen.md', `---\ntitle: Regen beter zichtbaar\nkind: beter\n${extra}---\n${body}\n`)
}
function git(...arguments_: string[]): string {
  return execFileSync('git', arguments_, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}
function commitFixture(): void {
  git('init', '-b', 'release-test')
  git('config', 'user.name', 'Changelog test')
  git('config', 'user.email', 'changelog@example.invalid')
  git('add', '.')
  git('commit', '-m', 'fixture')
}
function mediaNote(file = 'changes/media/regen.webp'): void {
  note(`media:\n  - file: ${file}\n    caption: Links voor, rechts na.\n`)
}
function video(name: string, duration: number, codec = 'libx264'): void {
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=32x32:r=2', '-t', String(duration), '-an', '-c:v', codec, resolve(root, 'changes/media', name)], { stdio: 'pipe' })
}

beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), 'motregen-changelog-test-'))
  mkdirSync(resolve(root, 'changes/pending'), { recursive: true })
  mkdirSync(resolve(root, 'changes/media'), { recursive: true })
  write('VERSION', '0.1.0\n')
  write('CHANGELOG.md', '# Changelog\n')
  note()
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('changelog validation', () => {
  it('reads Dutch notes and quoted titles without interpreting HTML', () => {
    note('', 'Een <script> blijft tekst.')
    expect(readNote(root, 'pending', 'regen.md')).toMatchObject({ title: 'Regen beter zichtbaar', kind: 'beter', body: 'Een <script> blijft tekst.', media: [] })
    note('titleextra: onbekend\n')
    expect(() => validateChanges(root)).toThrow('Onbekend veld')
  })

  it.each(['extra: onbekend\n', 'kind: nieuw\n', 'media:\n  - file: changes/media/regen.webp\n    caption: test\n    extra: nee\n', 'media:\n  - file: changes/media/regen.webp\n    file: changes/media/regen.webp\n', 'media: nee\n'])('rejects unknown, duplicate and incorrectly shaped fields: %s', (extra) => {
    note(extra)
    expect(() => validateChanges(root)).toThrow()
  })

  it('rejects missing, oversized and invalid media', () => {
    mediaNote()
    expect(() => validateChanges(root)).toThrow()
    write('changes/media/regen.webp', Buffer.alloc(maxMediaBytes + 1))
    expect(() => validateChanges(root)).toThrow('2.000.000')
    write('changes/media/regen.webp', 'geen afbeelding')
    expect(() => validateChanges(root)).toThrow('geen WebP')
  })

  it('rejects traversal and symlinks outside the media directory', () => {
    mediaNote('changes/media/../../VERSION.webp')
    expect(() => validateChanges(root)).toThrow('Ongeldig mediapad')
    symlinkSync(resolve(root, 'VERSION'), resolve(root, 'changes/media/regen.webp'))
    mediaNote()
    expect(() => validateChanges(root)).toThrow('buiten changes/media')
  })

  it('checks actual MP4 codec and duration', () => {
    video('short.mp4', 1)
    mediaNote('changes/media/short.mp4')
    expect(() => validateChanges(root)).not.toThrow()
    video('long.mp4', 12.5)
    mediaNote('changes/media/long.mp4')
    expect(() => validateChanges(root)).toThrow('maximaal 12 seconden')
    video('mpeg4.mp4', 1, 'mpeg4')
    mediaNote('changes/media/mpeg4.mp4')
    expect(() => validateChanges(root)).toThrow('H.264')
  })

  it.each(['01.1.0', '1.2', 'v1.2.3', '1.2.3-rc.1'])('rejects invalid VERSION %s', (version) => {
    write('VERSION', version)
    expect(() => readVersion(root)).toThrow('X.Y.Z')
  })
})

describe('local releases', () => {
  it('bumps all levels with lower components reset', () => {
    expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4')
    expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0')
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0')
    expect(() => bumpVersion('1.2.3', 'banana')).toThrow()
  })

  it('dry-runs without modifying files, commits or tags', () => {
    commitFixture()
    const head = git('rev-parse', 'HEAD')
    expect(release(root, 'patch', true)).toContain('0.1.0 → 0.1.1')
    expect(git('rev-parse', 'HEAD')).toBe(head)
    expect(git('tag')).toBe('')
    expect(git('status', '--porcelain')).toBe('')
    expect(existsSync(resolve(root, 'changes/v0.1.1'))).toBe(false)
  })

  it('moves pending notes, writes order/changelog, commits and tags without a remote', () => {
    commitFixture()
    release(root, 'minor')
    expect(readVersion(root)).toBe('0.2.0')
    expect(existsSync(resolve(root, 'changes/pending/regen.md'))).toBe(false)
    expect(readRelease(root, '0.2.0').notes.map((entry) => entry.slug)).toEqual(['regen.md'])
    expect(readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8')).toContain('## v0.2.0')
    expect(git('log', '-1', '--format=%s')).toBe('release v0.2.0')
    expect(git('rev-parse', 'v0.2.0')).toBe(git('rev-parse', 'HEAD'))
    expect(git('status', '--porcelain')).toBe('')
  })

  it('rejects dirty trees, duplicate tags and empty pending before mutation', () => {
    commitFixture()
    write('VERSION', '0.1.1\n')
    expect(() => release(root, 'patch')).toThrow('schone werkboom')
    write('VERSION', '0.1.0\n')
    git('tag', 'v0.1.1')
    expect(() => release(root, 'patch')).toThrow('bestaat al')
    git('tag', '-d', 'v0.1.1')
    rmSync(resolve(root, 'changes/pending/regen.md'))
    git('add', '-u')
    git('commit', '-m', 'empty')
    expect(() => release(root, 'patch')).toThrow('Geen pending')
  })

  it('honors release order and escapes note content in the public page', () => {
    note('', 'Regen <script>alert("test")</script> & hagel.')
    write('changes/pending/andere.md', '---\ntitle: Andere wijziging\nkind: nieuw\n---\nEen tweede notitie.\n')
    commitFixture()
    release(root, 'patch')
    write('changes/v0.1.1/index.md', '# v0.1.1\n\nDatum: 2026-10-16\n\n- [regen.md](regen.md)\n- [andere.md](andere.md)\n')
    const html = renderChangelogPage(root, { name: 'weer ok?', canonicalOrigin: 'https://weerok.nl' })
    expect(html).toContain('https://weerok.nl/changelog')
    expect(html).toContain('16 oktober 2026')
    expect(html).toContain('Regen &lt;script&gt;alert(&quot;test&quot;)&lt;/script&gt; &amp; hagel.')
    expect(html.indexOf('Regen beter zichtbaar')).toBeLessThan(html.indexOf('Andere wijziging'))
    write('changes/v0.1.1/index.md', '# v0.1.1\nDatum: 2026-10-16\n- [regen.md](regen.md)\n')
    expect(() => readRelease(root, '0.1.1')).toThrow('volgorde')
  })

  it('renders inline media with captions and muted video controls', () => {
    video('short.mp4', 1)
    mediaNote('changes/media/short.mp4')
    commitFixture()
    release(root, 'patch')
    const html = renderChangelogPage(root, { name: 'motregen.nl', canonicalOrigin: 'https://motregen.nl' })
    expect(html).toContain('muted playsinline controls')
    expect(html).toContain('<figcaption>Links voor, rechts na.</figcaption>')
    expect(statSync(resolve(root, 'changes/media/short.mp4')).size).toBeLessThan(maxMediaBytes)
  })
})
