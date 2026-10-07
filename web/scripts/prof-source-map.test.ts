import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSourceMapResolver } from './prof-source-map'
import { parseProfileTopArgs, profileTop } from './prof-top'

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })

function build(file = 'app-12345678.js', sourceContent = 'function calculate(value) { return value }') {
  const directory = mkdtempSync(join(tmpdir(), 'prof-map-'))
  directories.push(directory)
  writeFileSync(join(directory, 'app-12345678.js'), 'function a(b){return b}\n//# sourceMappingURL=app-12345678.js.map\n')
  writeFileSync(join(directory, 'app-12345678.js.map'), JSON.stringify({
    version: 3, file, sources: ['../../src/example.ts'], names: ['value'],
    sourcesContent: [sourceContent], mappings: 'AAAAA',
  }))
  return directory
}

const frame = { functionName: 'a', url: 'http://preview/assets/app-12345678.js', lineNumber: 0, columnNumber: 0 }

describe('profile sourcemaps', () => {
  it('resolves zero-based Chrome positions and recovers the function rather than a parameter name', () => {
    const resolve = createSourceMapResolver(build())
    expect(resolve(frame)).toEqual({ functionName: 'calculate', url: 'src/example.ts', lineNumber: 0, columnNumber: 0 })
    expect(resolve({ ...frame, url: '', lineNumber: -1, columnNumber: -1 })).toEqual({ ...frame, url: '', lineNumber: -1, columnNumber: -1 })
  })

  it('keeps sample attribution when resolving stack nodes', () => {
    const result = profileTop({ traceEvents: [{ name: 'ProfileChunk', pid: 1, tid: 1, id: '1', args: { data: {
      cpuProfile: { nodes: [{ id: 1, callFrame: frame }], samples: [1, 1] }, timeDeltas: [10_000, 20_000],
    } } }] }, createSourceMapResolver(build()))
    expect(result.functions[0]).toMatchObject({ functionName: 'calculate', url: 'src/example.ts', selfSamples: 2, selfMs: 30, stackSamples: 2 })
  })

  it('fails clearly for a missing build hash and a renamed map from another build', () => {
    expect(() => createSourceMapResolver(build())({ ...frame, url: 'http://preview/assets/app-87654321.js' })).toThrow(/buildhash komt niet overeen/)
    expect(() => createSourceMapResolver(build('app-87654321.js'))(frame)).toThrow(/sourcemap-buildhash komt niet overeen/)
  })

  it('rejects a bundle linked to the wrong map', () => {
    const directory = build()
    writeFileSync(join(directory, 'app-12345678.js'), '//# sourceMappingURL=app-87654321.js.map')
    expect(() => createSourceMapResolver(directory)(frame)).toThrow(/andere sourcemap/)
  })

  it('uses the map name when embedded dependency source content is incomplete', () => {
    expect(createSourceMapResolver(build('app-12345678.js', ''))(frame).functionName).toBe('value')
  })
})

describe('prof-top CLI', () => {
  it('accepts --dist alongside top-N and JSON output', () => {
    expect(parseProfileTopArgs(['trace.json', '--dist', 'dist-preview', '5', '--json'])).toEqual({ file: 'trace.json', count: 5, json: true, dist: 'dist-preview' })
    expect(() => parseProfileTopArgs(['trace.json', '--dist'])).toThrow(/buildmap/)
    expect(() => parseProfileTopArgs(['trace.json', '--dist', '--json'])).toThrow(/buildmap/)
    expect(() => parseProfileTopArgs(['trace.json', '0'])).toThrow(/positief/)
  })
})
