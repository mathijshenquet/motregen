import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import type { Plugin, ResolvedConfig } from 'vite'

// U109: Caddy serveert met `precompressed br gzip` (routes.caddy) de broertjes naast elk bestand. Brotli-11 is
// 18–24 % kleiner dan de zstd-3 die Cloudflare nu zelf maakt; de glyph-pbf's gingen zelfs ongecomprimeerd over de lijn.
const COMPRESSIBLE = /\.(?:js|css|html|json|webmanifest|svg|pbf|xml|txt|ico)$/
const SKIPPED = /(?:^|\/)(?:data|changes|perf-mobile)\//
const MIN_BYTES = 1024

export interface Precompressed { file: string; raw: number; br: number; gz: number }

/** Schrijft `<bestand>.br` en `<bestand>.gz` naast elk comprimeerbaar bestand dat er baat bij heeft. */
export function precompressDirectory(root: string): Precompressed[] {
  const written: Precompressed[] = []
  const walk = (directory: string) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name)
      const rel = relative(root, path)
      if (statSync(path).isDirectory()) { if (!SKIPPED.test(`${rel}/`)) walk(path); continue }
      if (!COMPRESSIBLE.test(name) || SKIPPED.test(rel)) continue
      const bytes = readFileSync(path)
      if (bytes.byteLength < MIN_BYTES) continue
      const br = brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: bytes.byteLength } })
      const gz = gzipSync(bytes, { level: 9 })
      // Zonder winst geen broertje: Caddy valt dan terug op het origineel.
      if (br.byteLength >= bytes.byteLength * 0.95) continue
      writeFileSync(`${path}.br`, br)
      if (!existsSync(`${path}.gz`)) writeFileSync(`${path}.gz`, gz)
      written.push({ file: rel, raw: bytes.byteLength, br: br.byteLength, gz: gz.byteLength })
    }
  }
  walk(root)
  return written
}

export function precompress(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'motregen-precompress',
    apply: 'build',
    enforce: 'post',
    configResolved(resolved) { config = resolved },
    closeBundle: {
      order: 'post',
      sequential: true,
      handler() {
        const written = precompressDirectory(resolve(config.root, config.build.outDir))
        const raw = written.reduce((sum, entry) => sum + entry.raw, 0)
        const br = written.reduce((sum, entry) => sum + entry.br, 0)
        config.logger.info(`precompress: ${written.length} bestanden, ${raw} → ${br} B brotli`)
      },
    },
  }
}
