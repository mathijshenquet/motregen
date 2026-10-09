import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'
import { brandName, defaultTitle, modeTitles, pageMetadata } from '../src/core/page-meta'
import { slugNames } from '../src/core/place-slug'
import { places } from '../src/core/places'
import { parsePresetPath, pathModes, presetPath } from '../src/core/presets'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}

function replaceMetadata(html: string, title: string, canonical: string, place: string): string {
  return html.replaceAll(defaultTitle, title)
    .replaceAll('https://motregen.nl/"', `${canonical}"`)
    .replace(`<p>${brandName} toont`, `<p>${place}${brandName} toont`)
}

export function renderPageHtml(html: string, pathname: string): string {
  const { title, canonical, place } = pageMetadata(pathname)
  return replaceMetadata(html, escapeHtml(title), escapeHtml(canonical), place ? `Het weer voor ${escapeHtml(place)}. ` : '')
}

export function sitemapXml(): string {
  const paths = ['/', ...Object.values(pathModes).map((mode) => `/${mode}`),
    ...places.filter((place) => !place.country).flatMap((place) => Object.keys(pathModes).map((mode) => presetPath(mode as keyof typeof pathModes, place.name)))]
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((path) => `  <url><loc>https://motregen.nl${path}</loc></url>`).join('\n')}\n</urlset>\n`
}

function caddyPageHtml(html: string): string {
  const dictionary = (entries: Record<string, string>) => `dict ${Object.entries(entries).map(([key, value]) => `${JSON.stringify(key)} ${JSON.stringify(value)}`).join(' ')}`
  const titles = Object.fromEntries(Object.entries(pathModes).map(([mode, path]) => [path, modeTitles[mode as keyof typeof pathModes]]))
  const preamble = `{{ $parts := splitList "/" (trimAll "/" .OriginalReq.URL.Path) }}
{{ $mode := index $parts 0 | lower }}
{{ $slug := "" }}{{ $place := "" }}
{{ if gt (len $parts) 1 }}{{ $slug = index $parts 1 | lower }}{{ $place = default ($slug | replace "-" " " | title) (get (${dictionary({ ...slugNames })}) $slug) }}{{ end }}
{{ $title := printf "%s%s — ${brandName}" (get (${dictionary(titles)}) $mode) (ternary (printf " %s" $place) "" (ne $place "")) }}
{{ $canonical := printf "https://motregen.nl/%s%s" $mode (ternary (printf "/%s" $slug) "" (ne $slug "")) }}
`
  return preamble + replaceMetadata(html, '{{ $title | html }}', '{{ $canonical | html }}', '{{ if $place }}Het weer voor {{ $place | html }}. {{ end }}')
}

function caddyRoutes(): string {
  const lowercase = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ', (letter) => `      plaats ${letter} ${letter.toLowerCase()}`).join('\n')
  return `route {
header /plaatsen-*.json Cache-Control "public, max-age=31536000, immutable"
header /assets/* Cache-Control "public, max-age=31536000, immutable"
@legacyPreset {
  path /
  method GET HEAD
  expression \`{query.modus} in ['', 'weer', 'lucht', 'gevoel', 'wind'] && {query.lat} == '' && {query.lon} == '' && ({query.modus} != '' || {query.plaats} != '') && !({query.plaats}.lowerAscii() in ['thuis', 'werk', 'mijn locatie'])\`
}
route @legacyPreset {
  map {query.modus} {legacyMode} {
    "" weer
    default {query.modus}
  }
  map {query.t} {legacyTime} {
    "" ""
    default "#t={query.t}"
  }
  vars legacyTargetMode {legacyMode}
  vars legacyTargetTime {legacyTime}
  uri query {
${lowercase}
    plaats "['’]" ""
    plaats " +" "-"
  }
  @slugPreset expression \`{query.plaats}.matches('^[a-z0-9]+(-[a-z0-9]+)*$') || {query.plaats} == ''\`
  route @slugPreset {
    map {query.plaats} {legacyPlace} {
      "" ""
      default /{query.plaats}
    }
    vars legacyTargetPlace {legacyPlace}
    uri query {
      -modus
      -plaats
      -t
    }
    map {http.request.uri.query} {legacyQuery} {
      "" ""
      default ?{http.request.uri.query}
    }
    redir * /{http.vars.legacyTargetMode}{http.vars.legacyTargetPlace}{legacyQuery}{http.vars.legacyTargetTime} 301
  }
}
@weatherPage path_regexp weatherPage (?i)^/(weer|lucht|gevoel|wind)(/[a-z0-9]+(-[a-z0-9]+)*)?/?$
route @weatherPage {
  rewrite * /route.html
  templates
  file_server {
    disable_canonical_uris
  }
}
try_files {path} /index.html
file_server {
  precompressed gzip
}
}
`
}

export function pageRoutes(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'motregen-page-routes',
    configResolved(resolved) { config = resolved },
    transformIndexHtml(html, context) {
      const pathname = new URL(context.originalUrl ?? context.path, 'http://localhost').pathname
      return parsePresetPath(pathname).mode ? renderPageHtml(html, pathname) : html
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') { next(); return }
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        if (!parsePresetPath(pathname).mode) { next(); return }
        const html = readFileSync(resolve(config.root, config.build.outDir, 'index.html'), 'utf8')
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.end(renderPageHtml(html, pathname))
      })
    },
    generateBundle: { order: 'post', handler(_options, bundle) {
      const html = bundle['index.html']
      if (!html || html.type !== 'asset') throw new Error('index.html ontbreekt voor de padpagina’s')
      this.emitFile({ type: 'asset', fileName: 'route.html', source: caddyPageHtml(String(html.source)) })
      this.emitFile({ type: 'asset', fileName: 'routes.caddy', source: caddyRoutes() })
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml() })
    } },
  }
}
