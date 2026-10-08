import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

export function mapStartPreview(mode: string | undefined): Plugin {
  return {
    name: 'motregen-map-start-preview',
    transformIndexHtml(html) {
      if (mode !== 'tegel') return html
      const tiles = readFileSync(resolve('src/assets/map-start/tiles.json'), 'utf8')
      return {
        html,
        tags: [
          {
            tag: 'script',
            children: "const mapStartParams = new URLSearchParams(location.search); if (mapStartParams.has('dev') && mapStartParams.get('kaartstart') === 'tegel') document.documentElement.dataset.mapStart = 'tegel';",
            injectTo: 'head',
          },
          {
            tag: 'style',
            children: 'html[data-map-start] .map-splash-veil { background:transparent; }',
            injectTo: 'head',
          },
          { tag: 'script', attrs: { type: 'application/json', id: 'map-start-tiles' }, children: tiles, injectTo: 'head' },
        ],
      }
    },
  }
}
