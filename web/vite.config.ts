/// <reference types="vitest/config" />
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import solid from 'vite-plugin-solid'
import { configDefaults } from 'vitest/config'

// dev/preview draait op ageq-mthq en wordt via het tailnet bekeken (MIP-1 §5)
const allowedHosts = ['ageq-mthq']

// dev gebruikt de echte ingest-data via caddy (:8080, MIP-3-contract);
// MOTREGEN_SYNTH=1 valt terug op de synthetische dataset in public/data
const proxy = process.env.MOTREGEN_SYNTH
  ? undefined
  : { '/data': { target: 'http://localhost:8080', changeOrigin: true, rewrite: (path: string) => path.replace(/^\/data/, '') } }
const previewProxy = process.env.MOTREGEN_DATA_ORIGIN
  ? { '/data': { target: process.env.MOTREGEN_DATA_ORIGIN, changeOrigin: true, rewrite: (path: string) => path.replace(/^\/data/, '') } }
  : undefined

// Het gebruiksbaken (MIP-13) gaat naar /hit; in prod beantwoordt Caddy dat (U32). dev/preview
// antwoorden net zo met 204, en e2e leest de ontvangen bodies uit MOTREGEN_HIT_LOG.
function usageBeaconEndpoint(): Plugin {
  const handle = (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (request.method !== 'POST' || request.url !== '/hit') { next(); return }
    let body = ''
    request.on('data', (chunk: Buffer) => { body += chunk.toString() })
    request.on('end', () => {
      const log = process.env.MOTREGEN_HIT_LOG
      if (log) {
        mkdirSync(dirname(log), { recursive: true })
        appendFileSync(log, `${body}\n`)
      }
      response.statusCode = 204
      response.end()
    })
  }
  return {
    name: 'motregen-usage-beacon',
    configureServer: (server) => { server.middlewares.use(handle) },
    configurePreviewServer: (server) => { server.middlewares.use(handle) },
  }
}

export default defineConfig({
  plugins: [solid(), tailwindcss(), usageBeaconEndpoint()],
  build: { sourcemap: true },
  server: { allowedHosts, proxy },
  preview: { allowedHosts, proxy: previewProxy },
  test: { environment: 'node', exclude: [...configDefaults.exclude, 'e2e/**'] },
})
