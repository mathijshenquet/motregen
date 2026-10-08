import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

export function mapStartPreview(mode: string | undefined): Plugin {
  return {
    name: 'motregen-map-start-preview',
    transformIndexHtml(html) {
      if (mode !== 'svg' && mode !== 'tegel') return html
      const svg = mode === 'svg' ? readFileSync(resolve('src/assets/map-start/netherlands.svg'), 'utf8').replace('<svg ', '<svg id="map-start-svg" ') : ''
      const tiles = mode === 'tegel' ? readFileSync(resolve('src/assets/map-start/tiles.json'), 'utf8') : ''
      return {
        html: html.replace('<div id="root"></div>', `${svg}<div id="root"></div>`),
        tags: [
          {
            tag: 'script',
            children: `const mapStartParams = new URLSearchParams(location.search); if (mapStartParams.has('dev') && mapStartParams.get('kaartstart') === '${mode}') document.documentElement.dataset.mapStart = '${mode}';`,
            injectTo: 'head',
          },
          {
            tag: 'style',
            children: `
              #map-start-svg { display:none; }
              html[data-map-start=svg] #map-start-svg { display:block; position:fixed; top:0; left:0; width:calc(100vw - 470px); height:100dvh; }
              html[data-map-start] .map-splash-veil { background:transparent; }
              [data-map-start=svg] .maplibregl-canvas { opacity:0; }
              [data-map-start=ready] .maplibregl-canvas { opacity:1; transition:opacity 180ms linear; }
              :root[data-theme=dark] { --start-land:#101d21; --start-water:#183746; --start-border:#688087; }
              @media(min-width:1450px) { html[data-map-start=svg] #map-start-svg { width:calc(100vw - 520px); } }
              @media(max-width:959px) { html[data-map-start=svg] #map-start-svg { width:100vw; height:100svh; } }
            `,
            injectTo: 'head',
          },
          ...tiles ? [{ tag: 'script', attrs: { type: 'application/json', id: 'map-start-tiles' }, children: tiles, injectTo: 'head' as const }] : [],
        ],
      }
    },
  }
}
