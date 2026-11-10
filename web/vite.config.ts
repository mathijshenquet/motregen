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
import { manifestStartCache } from './scripts/manifest-start-cache'
import { maplibreCss } from './scripts/maplibre-css-plugin'
import { precompress } from './scripts/precompress-plugin'
import { pageRoutes } from './scripts/page-routes'
import { brandFromEnvironment } from './src/core/brand'
import { startAssets } from './scripts/start-assets-plugin'
import { startWebgl } from './scripts/start-webgl-plugin'

// dev/preview draait op de dev-host (ageq-mthq, sinds 2026-10-07 ageq-dev2) en wordt via het tailnet bekeken (MIP-1 §5)
const allowedHosts = ['ageq-mthq', 'ageq-dev2']

// dev gebruikt de echte ingest-data via caddy (:8080, MIP-3-contract) of MOTREGEN_DATA_ORIGIN;
// MOTREGEN_SYNTH=1 valt terug op de synthetische dataset in public/data
const brand = brandFromEnvironment(process.env)
const dataOrigin = process.env.MOTREGEN_DATA_ORIGIN
// Previews en rigs proxyen vaak naar prod; zonder sessiemerk tellen ze daar niet als bezoek (MIP-35).
function proxiedDataPath(path: string): string {
  const url = new URL(path.replace(/^\/data/, ''), 'http://proxy')
  url.searchParams.delete('s')
  return url.pathname + url.search
}
const dataProxy = (target: string) => ({ '/data': { target, changeOrigin: true, rewrite: proxiedDataPath } })
const profileProxy = { '/prof': { target: process.env.MOTREGEN_PROF_ORIGIN ?? 'http://127.0.0.1:4331', changeOrigin: true } }
const proxy = { ...process.env.MOTREGEN_SYNTH ? {} : dataProxy(dataOrigin ?? 'http://localhost:8080'), ...profileProxy }
const previewProxy = { ...dataOrigin ? dataProxy(dataOrigin) : {}, ...profileProxy }
const profilingHeaders = { 'Document-Policy': 'js-profiling' }

function earlyManifestEntry(): Plugin {
  return {
    name: 'motregen-early-manifest',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        const entry = Object.values(context.bundle ?? {}).find((output) => output.type === 'chunk' && output.isEntry && output.name === 'startup')
        if (!entry) throw new Error('Vroege manifest-entry ontbreekt in de build')
        // Vite voegt HTML-modules samen; een eigen Rollup-entry moet ook vóór de app worden uitgevoerd.
        return { html, tags: [{ tag: 'script', attrs: { type: 'module', crossorigin: true, src: `/${entry.fileName}` }, injectTo: 'head-prepend' }] }
      },
    },
  }
}

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
  plugins: [earlyManifestEntry(), maplibreCss(), solid(), tailwindcss(), usageBeaconEndpoint(), localBasemapArchive(), pageRoutes(brand), startAssets(process.env.VITE_START_ASSETS ?? 'inline'), startWebgl(process.env.VITE_WEBGL_PREWARM), VitePWA({
    injectRegister: false,
    registerType: 'prompt',
    includeAssets: ['droplet.svg'],
    pwaAssets: { image: 'public/droplet.svg', preset: 'minimal-2023', overrideManifestIcons: true },
    manifest: {
      name: brand.name,
      short_name: brand.name,
      description: 'Regenradar en weersverwachting',
      lang: 'nl',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#eaf1f3',
      background_color: '#eaf1f3',
    },
    workbox: {
      // U109: og-image is alleen voor deelkaarten en hoort niet in de installatie. Glyphs gaan naar een
      // runtimecache: precache haalde ze bij de installatie opnieuw op (cache: reload, 204 kB ongecomprimeerd),
      // terwijl 256-511 zelden nodig is.
      globPatterns: ['**/*.{js,css,html,ico,png,svg}', 'basemap/*.json', 'assets/*.pbf-*.gz'],
      // De plekkenorde (U114, place-order-zooms-*.js, ± 90 kB gzip) laadt App pas na de eerste kaartweergave; de precache
      // geeft hem een tweede bezoek meteen.
      globIgnores: ['**/data/**', '**/perf-mobile/**', 'route.html', 'og-image.png'],
      navigateFallback: '/index.html',
      navigateFallbackDenylist: [/^\/(?:data|telegram|changelog)(?:\/|$)/, /^\/(?:hit|sw\.js|sitemap\.xml|robots\.txt)$/],
      runtimeCaching: [
        ...process.env.VITE_WARM_CACHE === 'manifest' ? [{
          urlPattern: ({ url }: { url: URL }) => url.pathname === '/data/manifest.json' && url.search === '?s=1',
          handler: 'StaleWhileRevalidate' as const,
          options: {
            cacheName: 'motregen-start-manifest-v1',
            plugins: [manifestStartCache],
            expiration: { maxEntries: 1, maxAgeSeconds: 15 },
          },
        }] : [],
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
        {
          // Ongehashte bestandsnamen: bij een nieuwe glyphset de cachenaam ophogen.
          urlPattern: ({ url }) => url.pathname.startsWith('/basemap/fonts/'),
          handler: 'CacheFirst',
          options: { cacheName: 'motregen-glyphs-v1', expiration: { maxEntries: 16, maxAgeSeconds: 31_536_000 } },
        },
        { urlPattern: /\/data\/|\/hit(?:\?|$)/, handler: 'NetworkOnly' },
        { urlPattern: /^https:\/\/[^/]*openfreemap\.org\//, handler: 'NetworkOnly' },
      ],
    },
  }), precompress()],
  build: {
    assetsInlineLimit: (filePath) => filePath.endsWith('.pbf.gz') ? false : undefined,
    sourcemap: true,
    rollupOptions: {
      input: { index: resolve(__dirname, 'index.html'), startup: resolve(__dirname, 'src/startup.ts') },
      // U109: MapLibre (1 MB) verandert zelden; als eigen chunk blijft hij na een uitrol in de HTTP- en SW-cache
      // en houdt V8 zijn codecache, in plaats van mee te verversen met elke appwijziging.
      output: { manualChunks: (id) => /\/node_modules\/.*\/maplibre-gl\/dist\/maplibre-gl\.js$/.test(id) ? 'maplibre' : undefined },
    },
  },
  server: { allowedHosts, proxy, headers: profilingHeaders },
  preview: { allowedHosts, proxy: previewProxy, headers: profilingHeaders },
  test: { environment: 'node', exclude: [...configDefaults.exclude, 'e2e/**'] },
})
