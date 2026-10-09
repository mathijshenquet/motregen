import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Bouwt de weerok.nl-variant echt (MIP-28: per domein een eigen bundle) en leest de dist terug.
const webRoot = resolve(import.meta.dirname, '..')
const outputDirectory = resolve(webRoot, 'tmp/brand-build-test')
const read = (file: string) => readFileSync(resolve(outputDirectory, file), 'utf8')

describe('the weerok.nl build', () => {
  beforeAll(() => {
    execFileSync('pnpm', ['exec', 'vite', 'build', '--outDir', outputDirectory, '--emptyOutDir', '--logLevel', 'error'], {
      cwd: webRoot,
      env: { ...process.env, VITE_BRAND_NAME: 'weer ok?', VITE_CANONICAL_ORIGIN: 'https://weerok.nl' },
      stdio: 'pipe',
    })
  }, 180_000)

  afterAll(() => rmSync(outputDirectory, { recursive: true, force: true }))

  it('names the page and points canonical, social cards and noscript text at weerok.nl', () => {
    const html = read('index.html')
    expect(html).toContain('<title>weer ok? — Regenradar en weersverwachting</title>')
    expect(html).toContain('<link rel="canonical" href="https://weerok.nl/" />')
    expect(html).toContain('<meta property="og:url" content="https://weerok.nl/" />')
    expect(html).toContain('<meta property="og:image" content="https://weerok.nl/og-image.png" />')
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="weer ok?" />')
    expect(html).toContain('<p>weer ok? toont')
    expect(html).not.toContain('motregen.nl')
    expect(html).not.toMatch(/%[A-Z_]+%/)
  })

  it('carries the name in the PWA manifest', () => {
    const manifest = JSON.parse(read('manifest.webmanifest')) as { name: string; short_name: string }
    expect(manifest.name).toBe('weer ok?')
    expect(manifest.short_name).toBe('weer ok?')
  })

  it('serves place pages, sitemap and robots under its own origin', () => {
    const routeTemplate = read('route.html')
    expect(routeTemplate).toContain('"weer ok?" }}')
    expect(routeTemplate).toContain('{{ $canonical := printf "%s/%s%s" "https://weerok.nl" $mode')
    expect(read('sitemap.xml')).toContain('<loc>https://weerok.nl/weer/utrecht</loc>')
    expect(read('sitemap.xml')).not.toContain('motregen.nl')
    expect(read('robots.txt')).toContain('Sitemap: https://weerok.nl/sitemap.xml')
  })
})
