/// <reference types="vitest/config" />
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import solid from 'vite-plugin-solid'
import { configDefaults } from 'vitest/config'

// dev/preview draait op de dev-host (ageq-mthq, sinds 2026-10-07 ageq-dev2) en wordt via het tailnet bekeken (MIP-1 §5)
const allowedHosts = ['ageq-mthq', 'ageq-dev2']

// dev gebruikt de echte ingest-data via caddy (:8080, MIP-3-contract) of MOTREGEN_DATA_ORIGIN;
// MOTREGEN_SYNTH=1 valt terug op de synthetische dataset in public/data
const dataOrigin = process.env.MOTREGEN_DATA_ORIGIN
const dataProxy = (target: string) => ({ '/data': { target, changeOrigin: true, rewrite: (path: string) => path.replace(/^\/data/, '') } })
const profileProxy = { '/prof': { target: process.env.MOTREGEN_PROF_ORIGIN ?? 'http://127.0.0.1:4331', changeOrigin: true } }
const proxy = { ...process.env.MOTREGEN_SYNTH ? {} : dataProxy(dataOrigin ?? 'http://localhost:8080'), ...profileProxy }
const previewProxy = { ...dataOrigin ? dataProxy(dataOrigin) : {}, ...profileProxy }
const profilingHeaders = { 'Document-Policy': 'js-profiling' }

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
  plugins: [solid(), tailwindcss(), usageBeaconEndpoint(), VitePWA({
    injectRegister: false,
    registerType: 'prompt',
    includeAssets: ['droplet.svg'],
    pwaAssets: { image: 'public/droplet.svg', preset: 'minimal-2023', overrideManifestIcons: true },
    manifest: {
      name: 'motregen.nl',
      short_name: 'motregen.nl',
      description: 'Regenradar en weersverwachting',
      lang: 'nl',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#eaf1f3',
      background_color: '#eaf1f3',
    },
    workbox: {
      globIgnores: ['**/data/**'],
      navigateFallback: '/index.html',
      runtimeCaching: [
        { urlPattern: /\/data\/|\/hit(?:\?|$)/, handler: 'NetworkOnly' },
        { urlPattern: /^https:\/\/[^/]*openfreemap\.org\//, handler: 'NetworkOnly' },
      ],
    },
  })],
  build: { sourcemap: true },
  server: { allowedHosts, proxy, headers: profilingHeaders },
  preview: { allowedHosts, proxy: previewProxy, headers: profilingHeaders },
  test: { environment: 'node', exclude: [...configDefaults.exclude, 'e2e/**'] },
})
