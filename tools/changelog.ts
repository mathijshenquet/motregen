import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

export const repositoryRoot = resolve(import.meta.dirname, '..')
export const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
export const maxMediaBytes = 2_000_000
export interface ChangeMedia { file: string; caption: string }
export interface ChangeNote { slug: string; title: string; kind: 'nieuw' | 'beter' | 'opgelost'; body: string; media: ChangeMedia[] }
export interface Release { version: string; date: string; notes: ChangeNote[] }

function scalar(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('"')) return JSON.parse(trimmed) as string
  if (trimmed.startsWith("'")) {
    if (!trimmed.endsWith("'")) throw new Error('Ongesloten tekstwaarde')
    return trimmed.slice(1, -1).replaceAll("''", "'")
  }
  if (!trimmed || /^[\[\]{}&*!>|]/.test(trimmed)) throw new Error('Gebruik een tekstwaarde op één regel')
  return trimmed
}

function fields(text: string): { header: Record<string, unknown>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text)
  if (!match) throw new Error('Frontmatter tussen --- ontbreekt')
  const header: Record<string, unknown> = {}
  let media: Record<string, string>[] | undefined
  let item: Record<string, string> | undefined
  for (const line of match[1]!.split(/\r?\n/)) {
    if (!line.trim()) continue
    const top = /^([a-z]+):\s*(.*)$/.exec(line)
    if (top) {
      const key = top[1]!
      if (Object.hasOwn(header, key)) throw new Error(`Dubbel veld: ${key}`)
      media = undefined
      item = undefined
      if (key === 'media' && !top[2]) { media = []; header[key] = media }
      else header[key] = scalar(top[2]!)
      continue
    }
    const first = /^  - ([a-z]+):\s*(.+)$/.exec(line)
    const next = /^    ([a-z]+):\s*(.+)$/.exec(line)
    if (!media || (!first && !next)) throw new Error(`Ongeldige frontmatterregel: ${line}`)
    if (first) { item = {}; media.push(item) }
    const property = first ?? next!
    if (!item || Object.hasOwn(item, property[1]!)) throw new Error('Dubbel of los mediaveld')
    item[property[1]!] = scalar(property[2]!)
  }
  return { header, body: match[2]!.trim() }
}

function exactFields(value: Record<string, unknown>, allowed: string[]): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Onbekend veld: ${key}`)
}

function requiredText(value: unknown, name: string, limit: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error(`Ongeldige ${name} (1–${limit} tekens)`)
  return value
}

export function mediaPath(root: string, file: string): string {
  if (!/^changes\/media\/[a-zA-Z0-9][a-zA-Z0-9_./-]*\.(webp|mp4)$/.test(file) || file.split('/').includes('..')) throw new Error(`Ongeldig mediapad: ${file}`)
  const path = resolve(root, file)
  const mediaRoot = realpathSync(resolve(root, 'changes/media'))
  if (!realpathSync(path).startsWith(`${mediaRoot}/`)) throw new Error(`Media buiten changes/media: ${file}`)
  return path
}

export function validateMedia(root: string, media: ChangeMedia, probe = true): void {
  const path = mediaPath(root, media.file)
  const stats = statSync(path)
  if (!stats.isFile() || stats.size === 0 || stats.size > maxMediaBytes) throw new Error(`${media.file}: media moet 1–2.000.000 bytes zijn`)
  if (media.file.endsWith('.webp')) {
    const bytes = readFileSync(path)
    if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') throw new Error(`${media.file}: geen WebP`)
  } else if (probe) {
    const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path], { encoding: 'utf8' })) as { streams: { codec_type: string; codec_name: string }[]; format: { duration: string } }
    const duration = Number(info.format.duration)
    const video = info.streams.filter((stream) => stream.codec_type === 'video')
    if (video.length !== 1 || video[0]!.codec_name !== 'h264' || !Number.isFinite(duration) || duration <= 0 || duration > 12) throw new Error(`${media.file}: vereist H.264, maximaal 12 seconden`)
  }
}

export function readNote(root: string, directory: string, slug: string, probe = true): ChangeNote {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(slug) || slug === 'index.md') throw new Error(`Ongeldige notitienaam: ${slug}`)
  const { header, body } = fields(readFileSync(resolve(root, 'changes', directory, slug), 'utf8'))
  exactFields(header, ['title', 'kind', 'media'])
  const title = requiredText(header.title, 'titel', 160)
  if (!['nieuw', 'beter', 'opgelost'].includes(String(header.kind))) throw new Error(`Onbekend soort: ${header.kind}`)
  requiredText(body, 'notitie', 1500)
  const media = (header.media ?? []) as ChangeMedia[]
  if (!Array.isArray(media)) throw new Error('media moet een lijst zijn')
  for (const item of media) {
    exactFields(item as unknown as Record<string, unknown>, ['file', 'caption'])
    requiredText(item.file, 'mediapad', 240)
    requiredText(item.caption, 'bijschrift', 1024)
    validateMedia(root, item, probe)
  }
  return { slug, title, kind: header.kind as ChangeNote['kind'], body, media }
}

export function noteFiles(root: string, directory: string): string[] {
  const path = resolve(root, 'changes', directory)
  if (!existsSync(path)) return []
  return readdirSync(path).filter((name) => name.endsWith('.md') && name !== 'index.md').sort()
}

export function readVersion(root = repositoryRoot): string {
  const version = readFileSync(resolve(root, 'VERSION'), 'utf8').trim()
  if (!versionPattern.test(version)) throw new Error('VERSION moet X.Y.Z zijn')
  return version
}

export function readRelease(root: string, version: string, probe = true): Release {
  if (!versionPattern.test(version)) throw new Error('Versie moet X.Y.Z zijn (zonder v)')
  const directory = `v${version}`
  const index = readFileSync(resolve(root, 'changes', directory, 'index.md'), 'utf8')
  const date = /^Datum: (\d{4}-\d{2}-\d{2})$/m.exec(index)?.[1]
  const order = [...index.matchAll(/^- \[([^\]]+)\]\(\1\)$/gm)].map((match) => match[1]!)
  const files = noteFiles(root, directory)
  if (!date || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date || order.length === 0 || new Set(order).size !== order.length || files.length !== order.length || files.some((file) => !order.includes(file))) throw new Error(`${directory}/index.md: ongeldige datum of volgorde`)
  return { version, date, notes: order.map((slug) => readNote(root, directory, slug, probe)) }
}

export function readReleases(root = repositoryRoot, probe = true): Release[] {
  return readdirSync(resolve(root, 'changes')).filter((name) => name.startsWith('v')).map((name) => readRelease(root, name.slice(1), probe)).sort((left, right) => {
    const leftParts = left.version.split('.').map(Number)
    const rightParts = right.version.split('.').map(Number)
    for (let index = 0; index < 3; index++) if (leftParts[index] !== rightParts[index]) return rightParts[index]! - leftParts[index]!
    return 0
  })
}

export function validateChanges(root = repositoryRoot): void {
  readVersion(root)
  for (const file of noteFiles(root, 'pending')) readNote(root, 'pending', file)
  readReleases(root)
}
