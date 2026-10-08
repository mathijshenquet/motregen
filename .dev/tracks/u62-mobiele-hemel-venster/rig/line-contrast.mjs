// U62 lijnensysteem: contrast van een lijn tegen het rijvlak (WCAG-ratio), nu en met rgba(tekst, α).
// Gebruik: node tmp/u62/line-contrast.mjs
const hex = (text) => [1, 3, 5].map((start) => parseInt(text.slice(start, start + 2), 16))
const lum = (rgb) => { const [r, g, b] = rgb.map((c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
const over = (ink, ground, alpha) => ink.map((channel, index) => channel * alpha + ground[index] * (1 - alpha))
const mix = (a, b, share) => a.map((channel, index) => channel * share + b[index] * (1 - share))
const fmt = (value) => value.toFixed(2)
const white = [255, 255, 255]
const states = {
  'dag, wit vlak': { ground: hex('#ffffff'), text: hex('#102630'), line: hex('#d5e1e5'), strong: hex('#b7cbd2'), rowLine: mix(white, hex('#d5e1e5'), 0.38) },
  'dag, hemelrij helder': { ground: [187, 230, 249], text: hex('#102630'), line: hex('#d5e1e5'), strong: hex('#b7cbd2'), rowLine: mix(white, hex('#d5e1e5'), 0.38) },
  'dag, hemelrij bewolkt': { ground: [200, 219, 225], text: hex('#102630'), line: hex('#d5e1e5'), strong: hex('#b7cbd2'), rowLine: mix(white, hex('#d5e1e5'), 0.38) },
  'nacht, nachtrij': { ground: hex('#0a1820'), text: hex('#edf8fc'), line: hex('#25404b'), strong: hex('#3b5a66'), rowLine: mix(white, hex('#25404b'), 0.16) },
  'donker thema, vlak': { ground: hex('#0d1d25'), text: hex('#edf8fc'), line: hex('#25404b'), strong: hex('#3b5a66'), rowLine: mix(white, hex('#25404b'), 0.38) },
}
console.log('NU            | --line | --line-strong | rijlijn (zoals getekend)')
for (const [name, state] of Object.entries(states)) console.log(`${name.padEnd(22)} | ${fmt(ratio(state.line, state.ground))} | ${fmt(ratio(state.strong, state.ground))} | ${fmt(ratio(state.rowLine, state.ground))}`)
console.log('\nrgba(tekst, α) | ' + [0.08, 0.1, 0.12, 0.14, 0.16, 0.2, 0.24, 0.28, 0.32].map((alpha) => `α ${alpha}`).join(' | '))
for (const [name, state] of Object.entries(states)) console.log(`${name.padEnd(22)} | ` + [0.08, 0.1, 0.12, 0.14, 0.16, 0.2, 0.24, 0.28, 0.32].map((alpha) => fmt(ratio(over(state.text, state.ground, alpha), state.ground))).join(' | '))
// De α die per toestand een doelcontrast geeft.
const solve = (state, target) => { let low = 0, high = 1; for (let step = 0; step < 40; step++) { const middle = (low + high) / 2; if (ratio(over(state.text, state.ground, middle), state.ground) < target) low = middle; else high = middle } return (low + high) / 2 }
for (const target of [1.25, 1.3, 1.6]) console.log(`\ndoelcontrast ${target}: ` + Object.entries(states).map(([name, state]) => `${name} α=${solve(state, target).toFixed(3)}`).join(' · '))
