import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { noteFiles, readNote, readRelease, readReleases, readVersion, repositoryRoot, validateChanges, type Release } from './changelog'

export function bumpVersion(version: string, level: string): string {
  const parts = version.split('.').map(Number)
  const index = ['major', 'minor', 'patch'].indexOf(level)
  if (index < 0) throw new Error('Gebruik: tools/release.sh <patch|minor|major> [--dry-run]')
  parts[index] = parts[index]! + 1
  for (let following = index + 1; following < 3; following++) parts[following] = 0
  return parts.join('.')
}

export function markdownChangelog(releases: Release[]): string {
  return `# Changelog\n\n${releases.map((release) => `## v${release.version} — ${release.date}\n\n${release.notes.map((note) => `### ${note.title} (${note.kind})\n\n${note.body}\n${note.media.map((media) => `\n[${media.caption}](${media.file})\n`).join('')}`).join('\n')}`).join('\n')}`
}

export function release(root: string, level: string, dryRun = false): string {
  const git = (...arguments_: string[]) => execFileSync('git', arguments_, { cwd: root, encoding: 'utf8' }).trim()
  validateChanges(root)
  const current = readVersion(root)
  const next = bumpVersion(current, level)
  const pending = noteFiles(root, 'pending')
  if (!pending.length) throw new Error('Geen pending notities om uit te brengen')
  if (git('status', '--porcelain')) throw new Error('Release vereist een schone werkboom en index')
  if (existsSync(resolve(root, `changes/v${next}`)) || git('tag', '--list', `v${next}`)) throw new Error(`v${next} bestaat al`)
  const notes = pending.map((file) => readNote(root, 'pending', file))
  if (notes.flatMap((note) => note.media).length > 10) throw new Error('Een release kan maximaal 10 media-items bevatten')
  const unapproved = notes.filter((note) => !note.goedgekeurd).map((note) => note.slug)
  if (unapproved.length) throw new Error(`Nog niet door de PO gekozen (veld goedgekeurd): ${unapproved.join(', ')}`)
  const summary = `${current} → ${next}\n${pending.map((file) => `changes/pending/${file} → changes/v${next}/${file}`).join('\n')}\nVERSION, changes/v${next}/index.md en CHANGELOG.md bijwerken\nCommit: release v${next}\nTag: v${next}\nGeen push of uitrol.`
  if (dryRun) return summary
  const date = new Date().toISOString().slice(0, 10)
  const directory = resolve(root, `changes/v${next}`)
  mkdirSync(directory)
  for (const file of pending) renameSync(resolve(root, 'changes/pending', file), resolve(directory, file))
  writeFileSync(resolve(directory, 'index.md'), `# v${next}\n\nDatum: ${date}\n\n${pending.map((file) => `- [${file}](${file})`).join('\n')}\n`)
  writeFileSync(resolve(root, 'VERSION'), `${next}\n`)
  const released = readRelease(root, next)
  const previous = readReleases(root).filter((entry) => entry.version !== next)
  writeFileSync(resolve(root, 'CHANGELOG.md'), markdownChangelog([released, ...previous]))
  git('add', '--', 'VERSION', 'CHANGELOG.md', 'changes/pending', `changes/v${next}`)
  git('commit', '-m', `release v${next}`)
  git('tag', `v${next}`)
  return summary
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const arguments_ = process.argv.slice(2)
    if (arguments_.filter((argument) => argument !== '--dry-run').length !== 1 || arguments_.some((argument) => argument.startsWith('--') && argument !== '--dry-run')) throw new Error('Gebruik: tools/release.sh <patch|minor|major> [--dry-run]')
    console.log(release(repositoryRoot, arguments_.find((argument) => argument !== '--dry-run')!, arguments_.includes('--dry-run')))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Release mislukt')
    process.exitCode = 1
  }
}
