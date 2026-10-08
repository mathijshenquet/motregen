// U62 punt 5 (PO 2026-10-08): rijlijn = tekstkleur gemengd (oklab) met de werkelijke rijkleur.
// Rekent het WCAG-contrast lijn/rijgrond na voor heldere dag, betrokken dag en nacht, per mengaandeel.
type Triple = [number, number, number]
const hex = (text: string): Triple => [1, 3, 5].map((start) => parseInt(text.slice(start, start + 2), 16) / 255) as Triple
const toLinear = (channel: number) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
const toOklab = (color: Triple): Triple => {
  const [red, green, blue] = color.map(toLinear) as Triple
  const long = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue)
  const medium = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue)
  const short = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue)
  return [0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short, 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short, 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short]
}
const luminanceOf = ([lightness, greenRed, blueYellow]: Triple): number => {
  const long = (lightness + 0.3963377774 * greenRed + 0.2158037573 * blueYellow) ** 3
  const medium = (lightness - 0.1055613458 * greenRed - 0.0638541728 * blueYellow) ** 3
  const short = (lightness - 0.0894841775 * greenRed - 1.291485548 * blueYellow) ** 3
  const red = 4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short
  const green = -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short
  const blue = -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}
const mix = (first: Triple, share: number, second: Triple): Triple => first.map((value, index) => value * share + second[index]! * (1 - share)) as Triple
const contrast = (first: Triple, second: Triple) => { const [high, low] = [luminanceOf(first), luminanceOf(second)].sort((left, right) => right - left); return (high! + 0.05) / (low! + 0.05) }
const bright = toOklab(hex('#64c6f2')), dull = toOklab(hex('#8ba4a8')), white = toOklab(hex('#ffffff'))
const grounds: Record<string, { ground: Triple; text: Triple }> = {
  'dag helder': { ground: mix(bright, 0.44, white), text: toOklab(hex('#102630')) },
  'dag betrokken': { ground: mix(mix(dull, 0.74, bright), 0.44, white), text: toOklab(hex('#102630')) },
  nacht: { ground: toOklab(hex('#0a1820')), text: toOklab(hex('#edf8fc')) },
}
for (const share of [0.08, 0.1, 0.11, 0.12, 0.13, 0.14, 0.16]) {
  console.log(`${Math.round(share * 100)} %: ` + Object.entries(grounds).map(([name, { ground, text }]) => `${name} ${contrast(mix(text, share, ground), ground).toFixed(2)}`).join(' · '))
}
