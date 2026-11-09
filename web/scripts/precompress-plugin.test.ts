import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { precompressDirectory } from './precompress-plugin'

describe('precompressDirectory', () => {
  it('zet br- en gz-broertjes naast comprimeerbare bestanden, niet naast data, kaarten of kleine bestanden', () => {
    const root = mkdtempSync(join(tmpdir(), 'precompress-'))
    mkdirSync(join(root, 'assets'))
    mkdirSync(join(root, 'data'))
    const script = 'export const x = 1;\n'.repeat(500)
    writeFileSync(join(root, 'assets/app.js'), script)
    writeFileSync(join(root, 'assets/app.js.map'), script)
    writeFileSync(join(root, 'data/manifest.json'), script)
    writeFileSync(join(root, 'tiny.css'), 'a{}')
    const written = precompressDirectory(root)
    expect(written.map((entry) => entry.file)).toEqual(['assets/app.js'])
    expect(brotliDecompressSync(readFileSync(join(root, 'assets/app.js.br'))).toString()).toBe(script)
    expect(gunzipSync(readFileSync(join(root, 'assets/app.js.gz'))).toString()).toBe(script)
    expect(existsSync(join(root, 'data/manifest.json.br'))).toBe(false)
    expect(existsSync(join(root, 'tiny.css.br'))).toBe(false)
  })
})
