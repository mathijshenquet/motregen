import type { FullConfig, FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

interface ReporterOptions {
  output?: string
  origin?: string
}

interface PerfResult {
  profile: string
  label: string
  emulation: string
  cpuThrottleRate: number
  coldTtfrMs: number | null
  warmTtfrMs: number | null
  passiveChunkBytes: number
  timeToCompleteMs: number
  scrubP50Ms: number | null
  scrubP95Ms: number | null
  scrubTransfers: number
  scrubFrames: number
  secondClickRequests: number
  sessionBytes: number
  resourceBytes: number
  sessionDownloadMs: number
  fps: number | null
  errors: string[]
}

export default class PerfReporter implements Reporter {
  private readonly options: ReporterOptions
  private readonly measurements: PerfResult[] = []
  private rootDir = process.cwd()

  constructor(options: ReporterOptions = {}) {
    this.options = options
  }

  onBegin(config: FullConfig): void {
    this.rootDir = config.rootDir
  }

  onTestEnd(_test: TestCase, result: TestResult): void {
    const attachment = result.attachments.find((candidate) => candidate.name === 'perf-result')
    if (!attachment) return

    const body = attachment.body ?? (attachment.path ? readFileSync(attachment.path) : null)
    if (body) this.measurements.push(JSON.parse(body.toString()) as PerfResult)
  }

  onEnd(result: FullResult): void {
    const output = resolve(this.rootDir, this.options.output ?? '../tmp/perf-live')
    const generatedAt = new Date().toISOString()
    const report = {
      generatedAt,
      origin: this.options.origin ?? null,
      status: result.status,
      measurements: this.measurements,
    }
    mkdirSync(dirname(output), { recursive: true })
    writeFileSync(`${output}.json`, `${JSON.stringify(report, null, 2)}\n`)
    writeFileSync(`${output}.md`, markdownReport(report))
    console.log(`Live-performancerapport: ${output}.json en ${output}.md`)
  }
}

function markdownReport(report: {
  generatedAt: string
  origin: string | null
  status: string
  measurements: PerfResult[]
}): string {
  const rows = report.measurements.map((measurement) => [
    measurement.label,
    formatMs(measurement.coldTtfrMs),
    formatMs(measurement.warmTtfrMs),
    `${formatBytes(measurement.passiveChunkBytes)} / ${formatMs(measurement.timeToCompleteMs)}`,
    `${formatMs(measurement.scrubP50Ms)} / ${formatMs(measurement.scrubP95Ms)}`,
    `${measurement.scrubTransfers} / ${measurement.scrubFrames}`,
    String(measurement.secondClickRequests),
    formatBytes(measurement.sessionBytes),
    formatMs(measurement.sessionDownloadMs),
    measurement.fps?.toFixed(0) ?? '—',
    String(measurement.errors.length),
  ].join(' | '))

  return `# Live-performancerapport

- Tijdstip: ${report.generatedAt}
- Origin: ${report.origin ?? 'onbekend'}
- Playwright-status: ${report.status}
- Modus: informatief; er zijn geen performancebudgetten toegepast.

| Profiel | Cold TTFR | Warm TTFR | Passief / compleet | Scrub p50 / p95 | Scrubtransfers / frames | Tweede klik | Sessie | Downloadtijd | FPS | Fouten |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows.map((row) => `| ${row} |`).join('\n')}

De downloadtijd loopt van de cold navigatie tot de laatste voltooide response in de gescripte journey. Daardoor omvat hij ook de vaste interactiestappen en is hij alleen vergelijkbaar tussen runs van deze suite.
`
}

function formatMs(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)} ms`
}

function formatBytes(value: number): string {
  return `${(value / 1_000_000).toFixed(2)} MB`
}
