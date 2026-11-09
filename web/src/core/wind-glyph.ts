/**
 * Wind-glyphs van de windmodus-proef (U101 ronde 2, `?dev&vaan=<naam>`): één tekening voor de vaantjes op de
 * kaart en, kleiner, voor de tabelrij. Getekend in een assenstelsel waarin "omhoog" de richting is waar de wind
 * heen waait; de aanroeper draait het geheel. Op de kaart staat het Bft-getal in een schijf in het midden
 * (`withDisc`); in de tabel staat het getal ernaast en is het midden een stipje.
 */
export const WIND_GLYPHS = ['veer', 'windzak', 'komeet'] as const
export type WindGlyphName = typeof WIND_GLYPHS[number]

export function windGlyphName(value: string | null): WindGlyphName | undefined {
  return WIND_GLYPHS.find((name) => name === value)
}

export type GlyphPlace = 'kaart' | 'tabel'

export interface WindGlyph {
  /** Zijde van het vierkante svg-vak in CSS-px; het draaipunt is het midden. */
  box: number
  /** Inhoud van de svg (zonder het svg-element zelf). */
  body: string
}

export const MAP_DISC_RADIUS = 13

/** Pijlrichting naar svg-rotatie: de glyph staat getekend met "heen" naar boven. */
export function windGlyphSvg(name: WindGlyphName, force: number, place: GlyphPlace, towardDegrees: number, className = ''): string {
  const glyph = windGlyph(name, force, place)
  return `<svg class="wind-glyph wind-glyph-${name} ${className}" width="${glyph.box}" height="${glyph.box}" viewBox="0 0 ${glyph.box} ${glyph.box}" ` +
    `style="transform: rotate(${Math.round(towardDegrees)}deg)" aria-hidden="true">${glyph.body}</svg>`
}

export function windGlyph(name: WindGlyphName, force: number, place: GlyphPlace): WindGlyph {
  if (name === 'veer') return barb(force, place)
  if (name === 'windzak') return windsock(force, place)
  return comet(force, place)
}

const round = (value: number) => Math.round(value * 100) / 100
const point = (x: number, y: number) => `${round(x)} ${round(y)}`

/**
 * Klassieke windveer, in Bft-stappen in plaats van knopen: een halve veer is 1 Bft, een hele 2 Bft en een
 * vaantje 10 Bft. De staf wijst naar waar de wind vandaan komt (meteorologische afspraak), de veren staan
 * rechts van de staf gezien vanaf het station en hellen naar buiten, zoals op een synoptische kaart.
 */
function barb(force: number, place: GlyphPlace): WindGlyph {
  const onMap = place === 'kaart'
  const staffLength = onMap ? 26 : 16
  const featherLength = onMap ? 14 : 8
  const spacing = onMap ? 5 : 3.2
  const pennantWidth = onMap ? 6.5 : 3.8
  const ink = onMap ? 2.6 : 1.7
  // Op de kaart begint de staf aan de rand van de schijf; in de tabel ligt het midden van de staf in het midden.
  const start = onMap ? MAP_DISC_RADIUS - 1 : -staffLength / 2 + 1
  const end = start + staffLength
  const box = onMap ? Math.ceil((end + 4) * 2) : 22
  const center = box / 2
  // Veerrichting: 65° van de staf, naar de kant waar de wind vandaan komt (+y) en naar rechts vanaf het station.
  const dx = -Math.sin(65 * Math.PI / 180), dy = Math.cos(65 * Math.PI / 180)
  const lines: string[] = []
  const pennants: string[] = []
  if (force > 0) lines.push(`M${point(center, center + start)}L${point(center, center + end)}`)
  let pennantCount = force >= 10 ? 1 : 0
  let fullCount = Math.floor((force - pennantCount * 10) / 2)
  const halfCount = (force - pennantCount * 10) % 2
  let at = center + end
  // Een losse halve veer staat één stap van het uiteinde, zodat hij niet als hele leest.
  if (!pennantCount && !fullCount && halfCount) at -= spacing
  for (; pennantCount > 0; pennantCount--) {
    pennants.push(`M${point(center, at)}L${point(center + featherLength * dx, at + featherLength * dy)}L${point(center, at - pennantWidth)}Z`)
    at -= pennantWidth + spacing * 0.6
  }
  for (; fullCount > 0; fullCount--) {
    lines.push(`M${point(center, at)}L${point(center + featherLength * dx, at + featherLength * dy)}`)
    at -= spacing
  }
  if (halfCount) lines.push(`M${point(center, at)}L${point(center + featherLength / 2 * dx, at + featherLength / 2 * dy)}`)
  const stroke = lines.join('')
  const fill = pennants.join('')
  let body = ''
  if (onMap) {
    body += `<path class="glyph-halo" d="${stroke}${fill}" stroke-width="${ink + 2}"/>`
    if (force === 0) body += `<circle class="glyph-halo" cx="${center}" cy="${center}" r="${MAP_DISC_RADIUS + 3.5}" stroke-width="${ink + 2}"/>`
  }
  body += `<path class="glyph-ink-line" d="${stroke}" stroke-width="${ink}"/>`
  if (fill) body += `<path class="glyph-ink" d="${fill}"/>`
  // Windstil: een kringetje om het station, zoals op de weerkaart.
  if (force === 0) body += `<circle class="glyph-ink-line" cx="${center}" cy="${center}" r="${onMap ? MAP_DISC_RADIUS + 3.5 : 4}" stroke-width="${ink}"/>`
  if (!onMap) body += `<circle class="glyph-ink" cx="${center}" cy="${center + start}" r="2.1"/>`
  return { box, body }
}

/**
 * Windzak zoals op een Nederlands vliegveld: vijf banden oranje-wit, vanaf de mast naar waar de wind heen waait.
 * Bij weinig wind is hij kort, smal aan de staart en hangt hij scheef; vanaf 5 Bft staat hij strak en vol
 * (op een vliegveld is elke band ongeveer 3 kn, dus 15 kn ≈ 5 Bft voor een volle zak).
 */
function windsock(force: number, place: GlyphPlace): WindGlyph {
  const onMap = place === 'kaart'
  const filled = Math.max(0, Math.min(1, force / 5))
  const extension = 0.42 + 0.58 * filled
  const maxLength = onMap ? 34 : 20
  const length = maxLength * extension
  const mouth = onMap ? 12.5 : 8.5
  const tail = mouth * (0.32 + 0.24 * filled)
  // Slap: de zak buigt af, tot ~40° aan de staart; strak: recht.
  const bend = 0.7 * (1 - filled)
  const start = onMap ? -(MAP_DISC_RADIUS - 2) : length / 2
  const box = onMap ? Math.ceil((MAP_DISC_RADIUS + maxLength + 4) * 2) : 24
  const center = box / 2
  const samples = 20
  const left: Array<[number, number]> = [], right: Array<[number, number]> = []
  let x = center, y = center + start, heading = 0
  for (let index = 0; index <= samples; index++) {
    const t = index / samples
    const width = (mouth + (tail - mouth) * t) / 2
    // Naar boven lopen ("heen"), met de kop draaiend naar rechts naarmate de zak slapper is.
    const normalX = Math.cos(heading), normalY = Math.sin(heading)
    left.push([x - normalX * width, y - normalY * width])
    right.push([x + normalX * width, y + normalY * width])
    heading = bend * t * t
    x += Math.sin(heading) * length / samples
    y -= Math.cos(heading) * length / samples
  }
  const bands = 5
  let body = ''
  const outline = `M${left.map(([px, py]) => point(px, py)).join('L')}L${right.slice().reverse().map(([px, py]) => point(px, py)).join('L')}Z`
  if (onMap) body += `<path class="glyph-halo" d="${outline}" stroke-width="3"/>`
  for (let band = 0; band < bands; band++) {
    const from = Math.round(band * samples / bands), to = Math.round((band + 1) * samples / bands)
    const edge = [...left.slice(from, to + 1), ...right.slice(from, to + 1).reverse()]
    body += `<path class="${band % 2 ? 'sock-white' : 'sock-orange'}" d="M${edge.map(([px, py]) => point(px, py)).join('L')}Z"/>`
  }
  body += `<path class="glyph-ink-line sock-outline" d="${outline}" stroke-width="${onMap ? 1.1 : 0.9}"/>`
  // De hoepel aan de mond.
  body += `<path class="glyph-ink-line" d="M${point(...left[0]!)}L${point(...right[0]!)}" stroke-width="${onMap ? 2 : 1.4}"/>`
  if (!onMap) body += `<circle class="glyph-ink" cx="${center}" cy="${center + start}" r="1.9"/>`
  return { box, body }
}

/**
 * Komeet: de schijf met het getal als kop, met een korte punt naar waar de wind heen waait (als een
 * kompasnaald) en erachter een zachte staart die met de windkracht groeit, als de streep die een deeltje op de
 * kaart trekt. Bewust geen druppelvorm: die leest in een regen-app als regen.
 */
function comet(force: number, place: GlyphPlace): WindGlyph {
  const onMap = place === 'kaart'
  const radius = onMap ? MAP_DISC_RADIUS : 3.2
  const tailLength = onMap ? 6 + force * 5.5 : Math.min(9, 2 + force * 1.6)
  const maxTail = onMap ? 6 + 9 * 5.5 : 9
  const apex = radius + (onMap ? 7.5 : 4.2)
  // De punt groeit uit de schijf: zijn basis ligt net binnen de rand, onder de schijf (die erboven ligt).
  const baseReach = radius - (onMap ? 1 : 0.4)
  const baseAngle = 30 * Math.PI / 180
  const box = onMap ? Math.ceil((maxTail + radius + 4) * 2) : 24
  const center = box / 2
  // Op de kaart draait alles om de kop (daar staat het getal); in de tabel om het midden van punt tot staart.
  const headY = onMap ? center : center + (apex - radius - tailLength) / 2
  const tip = `M${point(center - baseReach * Math.sin(baseAngle), headY - baseReach * Math.cos(baseAngle))}` +
    `L${point(center, headY - apex)}L${point(center + baseReach * Math.sin(baseAngle), headY - baseReach * Math.cos(baseAngle))}Z`
  const tailStart = headY + radius * 0.2
  const wake = (half: number, end: number) => `M${point(center - half, tailStart)}Q${point(center - half * 0.6, (tailStart + end) / 2)} ${point(center, end)}` +
    `Q${point(center + half * 0.6, (tailStart + end) / 2)} ${point(center + half, tailStart)}Z`
  const tailEnd = headY + radius + tailLength
  const gradient = `comet-tail-${place}`
  let body = `<defs><linearGradient id="${gradient}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" class="comet-tail-stop" stop-opacity="0.8"/><stop offset="0.6" class="comet-tail-stop" stop-opacity="0.3"/>` +
    `<stop offset="1" class="comet-tail-stop" stop-opacity="0"/></linearGradient></defs>`
  if (force > 0) {
    // Twee lagen: een brede zachte kielzog en een smalle kern die verder doorloopt.
    body += `<path d="${wake(radius * 0.95, tailEnd - tailLength * 0.3)}" fill="url(#${gradient})" opacity="0.5"/>`
    body += `<path d="${wake(radius * 0.42, tailEnd)}" fill="url(#${gradient})"/>`
  }
  if (onMap) body += `<path class="glyph-halo" d="${tip}" stroke-width="3"/>`
  body += `<path class="glyph-ink" d="${tip}" stroke-linejoin="round"/>`
  if (!onMap) body += `<circle class="glyph-ink" cx="${center}" cy="${headY}" r="${radius}"/>`
  return { box, body }
}
