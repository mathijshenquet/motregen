/// <reference types="vitest/config" />
import { appendFileSync, createReadStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import solid from 'vite-plugin-solid'
import { configDefaults } from 'vitest/config'
import { basemapRangeCache } from './scripts/basemap-range-cache'
import { pageRoutes } from './scripts/page-routes'
import { mapStartPreview } from './scripts/map-start-plugin'
import { startAssets } from './scripts/start-assets-plugin'

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

// De PMTiles-basiskaart staat in prod onder /data/basemap/ (Caddy, Nix-package). dev/preview proxyen
// /data naar een origin die het archief nog niet hoeft te hebben; serveer het daarom lokaal uit
// tools/basemap/tiles, met Range-ondersteuning zoals de pmtiles-client verwacht.
function localBasemapArchive(): Plugin {
  const tilesDir = resolve(__dirname, '../tools/basemap/tiles')
  const handle = (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const match = /^\/data\/basemap\/(nl-[0-9a-f]{16}\.pmtiles)(?:\?.*)?$/.exec(request.url ?? '')
    if (!match) { next(); return }
    const file = resolve(tilesDir, match[1]!)
    if (!existsSync(file)) { next(); return }
    const size = statSync(file).size
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '')
    const start = range ? Number(range[1]) : 0
    const end = range ? (range[2] ? Math.min(Number(range[2]), size - 1) : size - 1) : size - 1
    if (start > end || start >= size) { response.writeHead(416, { 'Content-Range': `bytes */${size}` }); response.end(); return }
    response.writeHead(range ? 206 : 200, {
      'Content-Type': 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Content-Length': String(end - start + 1),
      'Cache-Control': 'public, max-age=31536000, immutable',
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
    })
    if (request.method === 'HEAD') { response.end(); return }
    createReadStream(file, { start, end }).pipe(response)
  }
  // Alleen wanneer /data naar een externe origin gaat (motregen.nl): e2e en de rig serveren hun eigen
  // data-origin mét archief en meten de tegelverzoeken daarop, dus daar mag niets tussen zitten.
  const active = Boolean(dataOrigin?.startsWith('https://'))
  return {
    name: 'motregen-local-basemap-archive',
    configureServer(server) { if (active) server.middlewares.use(handle) },
    configurePreviewServer(server) { if (active) server.middlewares.use(handle) },
  }
}

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
  appType: 'spa',
  plugins: [solid(), tailwindcss(), usageBeaconEndpoint(), localBasemapArchive(), pageRoutes(), mapStartPreview(process.env.VITE_MAP_START), startAssets(process.env.VITE_START_ASSETS ?? 'inline'), VitePWA({
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
      globPatterns: ['**/*.{js,css,html,ico,png,svg}', 'basemap/**/*.{json,pbf}'],
      globIgnores: ['**/data/**', '**/perf-mobile/**', 'route.html'],
      navigateFallback: '/index.html',
      navigateFallbackDenylist: [/^\/(?:data|telegram)(?:\/|$)/, /^\/(?:hit|sw\.js|sitemap\.xml|robots\.txt)$/],
      runtimeCaching: [
        {
          urlPattern: ({ url }) => /^\/plaatsen-[0-9a-f]{16}\.json$/.test(url.pathname),
          handler: 'CacheFirst',
          options: { cacheName: 'motregen-plaatsen-v1', expiration: { maxEntries: 2, maxAgeSeconds: 31_536_000 } },
        },
        {
          urlPattern: ({ url }) => /^\/data\/basemap\/nl-[0-9a-f]{16}\.pmtiles$/.test(url.pathname),
          handler: 'CacheFirst',
          options: {
            cacheName: 'motregen-basemap-ranges-v1',
            plugins: [basemapRangeCache],
            expiration: { maxEntries: 384, maxAgeSeconds: 31_536_000, purgeOnQuotaError: true },
          },
        },
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
