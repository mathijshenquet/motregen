import { appendFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const output = resolve(root, '.dev/tracks/u60-basiskaart-afwerking')
const metadata = JSON.parse(readFileSync(resolve(root, 'tools/basemap/tiles/manifest.json'), 'utf8'))
const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const lines = [
  `\n## ${new Date().toISOString()} — Contrastieve A/B (${metadata.filename}, head ${head})\n`,
  'Oud = offline OpenFreeMap/Liberty met U59’s filtering en darkenLibertyLayer; nieuw = eigen archief. De camera en het kaartvlak zijn per paar gelijk. Groen is het onbedekte wood/grass/park-oppervlak, grijs het onbedekte landuse_residential-oppervlak (eigen: residential/commercial/industrial/retail), via afzonderlijke zwart/wit-maskers zonder omtrek. Beide zijn percentages van het hele kaartvlak (incl. water); gebouwen tellen niet als landuse. Plaatslabels zijn unieke geplaatste city/town/village-namen; provincies tellen niet mee.',
  '',
  'ΔL* gebruikt sRGB→CIE L*. Kale landkleur = dominante screenshotkleur nabij de stijlachtergrond; water-/labelverf zijn de dekkende stijlkleuren, grenzen worden met hun werkelijke dekking over land gemengd. Dit meet kleurcontrast vóór tekst-antialiasing; lijndikte, halo en groenoppervlak blijven in de PNG-paren zichtbaar. Liberty’s rasterachtergrond beïnvloedt alleen de lage startzoom. Wetland-textuur en fijne POI-/gebouwdetails zijn geen onderdeel van de eigen kaart.',
  '',
  '| Paar (oud naast nieuw) | Groen % oud / nieuw | Groei groen | Grijs % oud / nieuw | Groei grijs | Plaatslabels oud / nieuw | ΔL* water–land | ΔL* label–land | ΔL* landgrens–land | ΔL* provinciegrens–land |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
]
for (const width of [390, 1280]) {
  for (const theme of ['light', 'dark']) {
    const views = JSON.parse(readFileSync(resolve(output, `ab-${width}-${theme}.json`), 'utf8'))
    for (const view of views) {
      const [old, current] = view.captures
      const comparison = (value: (capture: typeof old) => number) => `${value(old).toFixed(2)} / ${value(current).toFixed(2)}`
      const growth = (kind: 'greenPercent' | 'grayPercent') => old[kind] > 0 ? `${((current[kind] / old[kind] - 1) * 100).toFixed(2)} %` : 'n.v.t. (beide 0)'
      lines.push(`| [${width} ${theme === 'light' ? 'licht' : 'donker'} ${view.view}](ab-${width}-${theme}-${view.view}.png) | ${comparison(capture => capture.greenPercent)} | ${growth('greenPercent')} | ${comparison(capture => capture.grayPercent)} | ${growth('grayPercent')} | ${old.labelCount} / ${current.labelCount} | ${comparison(capture => capture.contrast.waterLand)} | ${comparison(capture => capture.contrast.labelLand)} | ${comparison(capture => capture.contrast.boundaryLand)} | ${comparison(capture => capture.contrast.provinceLand)} |`)
    }
  }
}
lines.push('', 'Bijbehorende volledige app-paren: `app-<390|1280>-<light|dark>-<start|utrecht>.png`. Het eindbeeld ligt ter PO-review; een technische gate is geen smaakakkoord.', '')
appendFileSync(resolve(output, 'LOG.md'), `${lines.join('\n')}\n`)
