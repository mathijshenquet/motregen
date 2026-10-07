import { spawn, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

interface Options {
  csv: string
  outputDir: string
  sampleIds: string[]
}

type CsvRow = Record<string, string>

const root = resolve(import.meta.dirname, '../..')
const webRequire = createRequire(resolve(root, 'web/package.json'))
const chromium = chromiumFrom(webRequire('@playwright/test') as unknown)

interface RenderLocator {
  waitFor(): Promise<void>
  screenshot(options: { path: string }): Promise<unknown>
}

interface RenderPage {
  goto(url: string, options: { waitUntil: 'networkidle' }): Promise<unknown>
  getByTestId(testId: string): RenderLocator
}

interface RenderBrowser {
  newPage(options: { viewport: { width: number; height: number }; deviceScaleFactor: number }): Promise<RenderPage>
  close(): Promise<void>
}

interface ChromiumLauncher {
  launch(options: { headless: boolean }): Promise<RenderBrowser>
}

function chromiumFrom(value: unknown): ChromiumLauncher {
  if (!value || (typeof value !== 'object' && typeof value !== 'function') || !('chromium' in value)) throw new Error('Playwright chromium ontbreekt')
  return (value as { chromium: ChromiumLauncher }).chromium
}

function parseArguments(values: string[]): Options {
  const options: Options = {
    csv: resolve(root, 'tools/skywatch/data/samples.csv'),
    outputDir: resolve(root, 'tools/skywatch/data/renders'),
    sampleIds: [],
  }
  for (let index = 0; index < values.length; index++) {
    const value = values[index]!
    if (value === '--csv') options.csv = resolve(values[++index] ?? '')
    else if (value === '--output-dir') options.outputDir = resolve(values[++index] ?? '')
    else if (value === '--sample') options.sampleIds.push(values[++index] ?? '')
    else throw new Error(`Onbekend argument: ${value}`)
  }
  if (!options.sampleIds.length || options.sampleIds.some((value) => !value)) throw new Error('Geef minstens één --sample SAMPLE_ID')
  return options
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const header = csvLine(lines[0]!)
  return lines.slice(1).map((line) => Object.fromEntries(header.map((column, index) => [column, csvLine(line)[index] ?? ''])))
}

function csvLine(line: string): string[] {
  const values: string[] = []
  let value = ''
  let quoted = false
  for (let index = 0; index < line.length; index++) {
    const character = line[index]!
    if (character === '"' && quoted && line[index + 1] === '"') { value += '"'; index++; continue }
    if (character === '"') { quoted = !quoted; continue }
    if (character === ',' && !quoted) { values.push(value); value = ''; continue }
    value += character
  }
  values.push(value)
  return values
}

function renderUrl(baseUrl: string, row: CsvRow): string {
  const query = new URLSearchParams({
    'skywatch-render': '1',
    sample: row.sample_id ?? '',
    at: row.polled_at ?? '',
    times: JSON.stringify(Array.from({ length: 4 }, (_, horizon) => row[`model_h${horizon}_valid_at`] ?? '')),
    high: values(row, 'cloud_high_pct'),
    mid: values(row, 'cloud_mid_pct'),
    low: values(row, 'cloud_low_pct'),
  })
  return `${baseUrl}/?${query}`
}

function values(row: CsvRow, suffix: string): string {
  return JSON.stringify(Array.from({ length: 4 }, (_, horizon) => {
    const value = Number(row[`model_h${horizon}_${suffix}`])
    return Number.isFinite(value) ? value : null
  }))
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') { server.close(); reject(new Error('Geen previewpoort')); return }
      server.close((error) => error ? reject(error) : resolvePort(address.port))
    })
  })
}

async function waitForServer(url: string, process: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (process.exitCode !== null) throw new Error(`Preview stopte met exit ${process.exitCode}`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch { /* preview start nog */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error('Preview startte niet binnen tien seconden')
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2))
  const rows = parseCsv(await readFile(options.csv, 'utf8'))
  const byId = new Map(rows.map((row) => [row.sample_id, row]))
  const selected = options.sampleIds.map((sampleId) => {
    const row = byId.get(sampleId)
    if (!row) throw new Error(`Sample ontbreekt: ${sampleId}`)
    return row
  })
  const pnpm = process.env.SKYWATCH_PNPM ?? 'pnpm'
  const build = spawn(pnpm, ['--dir', resolve(root, 'web'), 'build'], { stdio: ['ignore', 'pipe', 'inherit'] })
  build.stdout?.on('data', (data: Buffer) => process.stderr.write(data))
  const buildExit = await new Promise<number | null>((resolveExit, reject) => { build.once('error', reject); build.once('exit', resolveExit) })
  if (buildExit !== 0) throw new Error(`Preview-build mislukte met exit ${buildExit}`)

  const port = await freePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const preview = spawn(pnpm, ['--dir', resolve(root, 'web'), 'preview', '--host', '127.0.0.1', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] })
  preview.stdout?.on('data', () => undefined)
  preview.stderr?.on('data', (data: Buffer) => process.stderr.write(data))
  try {
    await waitForServer(baseUrl, preview)
    await mkdir(options.outputDir, { recursive: true })
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage({ viewport: { width: 1000, height: 400 }, deviceScaleFactor: 1 })
      const output: Array<{ sampleId: string; path: string }> = []
      for (const row of selected) {
        await page.goto(renderUrl(baseUrl, row), { waitUntil: 'networkidle' })
        const target = page.getByTestId('skywatch-render')
        await target.waitFor()
        const path = resolve(options.outputDir, `${row.sample_id}.png`)
        await target.screenshot({ path })
        output.push({ sampleId: row.sample_id!, path })
      }
      process.stdout.write(`${JSON.stringify(output)}\n`)
    } finally {
      await browser.close()
    }
  } finally {
    preview.kill('SIGTERM')
    await new Promise<void>((resolveExit) => { if (preview.exitCode !== null) resolveExit(); else preview.once('exit', () => resolveExit()) })
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`Render mislukt: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
