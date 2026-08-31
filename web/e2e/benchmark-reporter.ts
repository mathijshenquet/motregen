import type { FullConfig, FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

interface ReporterOptions {
  output?: string
  motregenOrigin?: string
  buienradarOrigin?: string
}

interface Milestone {
  elapsedMs: number
  requests: number
  bytes: number
}

interface BenchmarkResult {
  profile: string
  profileLabel: string
  emulation: string
  site: 'motregen' | 'buienradar'
  firstRadar: Milestone
  fullyLoaded: Milestone & { timedOut: boolean }
  lcpMs: number | null
  session: Milestone & { quietTimedOut: boolean }
  failedRequests: number
}

export default class BenchmarkReporter implements Reporter {
  private readonly options: ReporterOptions
  private readonly measurements: BenchmarkResult[] = []
  private rootDir = process.cwd()

  constructor(options: ReporterOptions = {}) {
    this.options = options
  }

  onBegin(config: FullConfig): void {
    this.rootDir = config.rootDir
  }

  onTestEnd(_test: TestCase, result: TestResult): void {
    const attachment = result.attachments.find((candidate) => candidate.name === 'benchmark-result')
    if (!attachment) return
    const body = attachment.body ?? (attachment.path ? readFileSync(attachment.path) : null)
    if (body) this.measurements.push(JSON.parse(body.toString()) as BenchmarkResult)
  }

  onEnd(result: FullResult): void {
    const output = resolve(this.rootDir, this.options.output ?? '../tmp/competitive-benchmark')
    const report = {
      generatedAt: new Date().toISOString(),
      status: result.status,
      origins: {
        motregen: this.options.motregenOrigin ?? null,
        buienradar: this.options.buienradarOrigin ?? null,
      },
      measurements: this.measurements,
    }
    mkdirSync(dirname(output), { recursive: true })
    writeFileSync(`${output}.json`, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`Competitieve benchmark: ${output}.json`)
  }
}
