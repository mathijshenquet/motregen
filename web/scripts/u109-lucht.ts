// U109 stap 3: per bezoek in Lucht de eerste tekening van basiskaart, wolken en regen, plus ttfp, per variant.
// Gebruik: pnpm exec tsx scripts/u109-lucht.ts <uitvoermap van u109-ab.sh>
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const directory = process.argv[2]!
const rows: Record<string, number[][]> = {}
for (const run of readdirSync(directory).filter((name) => /^[AB]\d$/.test(name)).sort()) {
  for (const file of readdirSync(join(directory, run)).filter((name) => name.endsWith('.json'))) {
    const report = JSON.parse(readFileSync(join(directory, run, file), 'utf8'))
    const key = `${report.profile} ${report.visit} ${run[0]}`
    const first = report.layers?.firstMs ?? {}
    ;(rows[key] ??= []).push([first.basiskaart, first.wolken, first.regen, report.milestones.ttfpMs, report.loadAverage])
  }
}
const median = (values: number[]) => { const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b); return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)]! : NaN }
console.log('| profiel bezoek variant | n | basiskaart | wolken | regen | ttfp | load |')
console.log('| --- | ---: | ---: | ---: | ---: | ---: | --- |')
for (const [key, values] of Object.entries(rows).sort()) {
  const col = (index: number) => `${Math.round(median(values.map((row) => row[index]!)))} ms`
  console.log(`| ${key} | ${values.length} | ${col(0)} | ${col(1)} | ${col(2)} | ${col(3)} | ${Math.min(...values.map((row) => row[4]!))}–${Math.max(...values.map((row) => row[4]!))} |`)
  console.log(`|   (losse runs) | | ${values.map((row) => Math.round(row[0]!)).join(' / ')} | ${values.map((row) => Math.round(row[1]!)).join(' / ')} | | ${values.map((row) => Math.round(row[3]!)).join(' / ')} | |`)
}
