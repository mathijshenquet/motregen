import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

export function startAssets(mode: string | undefined): Plugin {
  return {
    name: 'motregen-start-assets',
    transformIndexHtml(html) {
      if (mode !== 'inline') return html
      const styles = process.env.VITE_BASEMAP_STYLE_URL ? [] : ['licht', 'donker'].map((theme) => ({
        tag: 'script',
        attrs: { type: 'application/json', id: `basemap-${theme}` },
        children: JSON.stringify(JSON.parse(readFileSync(resolve(`public/basemap/${theme}.json`), 'utf8'))).replaceAll('<', '\\u003c'),
        injectTo: 'head' as const,
      }))
      return {
        html,
        tags: [
          ...styles,
          {
            tag: 'script',
            children: `
              const startupParams = new URLSearchParams(location.search);
              if (!startupParams.has('skywatch-render') && startupParams.get('still') !== '1') {
                const url = new URL('/data/manifest.json?s=1', location.href).href;
                const response = fetch(url);
                response.catch(() => undefined);
                window.__motregenInitialManifest = { url, response };
              }
            `,
            injectTo: 'head',
          },
          ...styles.length ? [{
            tag: 'link',
            attrs: { rel: 'preload', as: 'fetch', crossorigin: 'anonymous', href: '/basemap/fonts/Noto%20Sans%20Regular/0-255.pbf' },
            injectTo: 'head' as const,
          }] : [],
        ],
      }
    },
  }
}
