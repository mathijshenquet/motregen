import type { Plugin } from 'vite'

// U109: de app maakt geen MapLibre-controls of popups (attributionControl: false). Hun regels in
// maplibre-gl.css (69 kB, waarvan 51 kB SVG-data-URI's) blokkeren alleen de eerste render. Kaart-, canvas-,
// hoekcontainer- en markerregels blijven: die elementen bestaan wel (locatiepin, temperatuurgetallen).
const UNUSED = /\.maplibregl-ctrl(?![\w-])|\.maplibregl-ctrl-(?!(?:top|bottom)-(?:left|right)(?![\w-]))[\w-]+|\.maplibregl-(?:popup|user-location)(?![\w])|\.maplibregl-(?:popup|user-location)-[\w-]+/

function closingBrace(css: string, open: number): number {
  let depth = 0
  for (let index = open; index < css.length; index++) {
    if (css[index] === '{') depth++
    else if (css[index] === '}' && --depth === 0) return index
  }
  throw new Error('maplibre-gl.css: ongesloten blok')
}

/** Laat regels weg waarvan élke selector een ongebruikt MapLibre-element raakt; lege at-blokken vervallen. */
export function stripUnusedMaplibreCss(css: string): string {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
  let output = ''
  let index = 0
  while (index < source.length) {
    const open = source.indexOf('{', index)
    if (open < 0) { output += source.slice(index).trim() ? source.slice(index) : ''; break }
    const prelude = source.slice(index, open).trim()
    const close = closingBrace(source, open)
    const body = source.slice(open + 1, close)
    if (prelude.startsWith('@media') || prelude.startsWith('@supports') || prelude.startsWith('@-moz-document')) {
      const inner = stripUnusedMaplibreCss(body)
      if (inner.trim()) output += `${prelude}{${inner}}\n`
    }
    else if (prelude.startsWith('@') || !prelude.split(',').every((selector) => UNUSED.test(selector))) {
      output += `${prelude}{${body}}\n`
    }
    index = close + 1
  }
  return output
}

export function maplibreCss(): Plugin {
  return {
    name: 'motregen-maplibre-css',
    enforce: 'pre',
    transform(code, id) {
      if (!/\/maplibre-gl\/dist\/maplibre-gl\.css(?:\?|$)/.test(id)) return null
      return { code: stripUnusedMaplibreCss(code), map: null }
    },
  }
}
