import { createHash } from 'node:crypto'
import { createServer } from 'node:net'
import { loadavg } from 'node:os'

/**
 * Boven deze 1-minuut-loadavg is een rig-meting ruis: de dev-host draait dan meerdere rigs of
 * builds tegelijk en tijden schuiven tientallen procenten (gezien 2026-10-07 bij loadavg 18).
 */
export const MAX_LOAD_AVERAGE = 8

/**
 * Fixture en client van de laadrig, per poortpaar in een eigen map: zo raakt een rig-run de
 * preview in `dist` niet en twee worktrees elkaar niet. Dezelfde commando's dienen voor de
 * Playwright-webserver en voor de voorbouw in perf:mobile.
 */
export function rigBuild(port: number, dataPort: number, basemap: string) {
  const fixtureDir = `tmp/perf-mobile/fixture-${dataPort}`
  const distDir = `tmp/perf-mobile/dist-${port}`
  const styleOverride = `VITE_BASEMAP_STYLE_URL=http://127.0.0.1:${dataPort}/${basemap === 'fixture' ? 'style' : 'style-{theme}'}.json`
  return {
    fixtureDir,
    distDir,
    fixtureCommand: `MOTREGEN_SYNTH_DIR=${fixtureDir} pnpm synthgen && MOTREGEN_E2E_DATA_PORT=${dataPort} pnpm exec tsx scripts/mobile-fixture.ts`,
    buildCommand: `${styleOverride} pnpm build --outDir ${distDir} && pnpm exec tsx scripts/mobile-assets.ts`,
  }
}

export function hostLoadAverage(): number {
  return Math.round(loadavg()[0]! * 100) / 100
}

/** Wacht tot de host rustig genoeg is; false als dat binnen de wachttijd niet lukt. */
export async function waitForQuietHost(maxWaitMs: number, log: (message: string) => void): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs
  while (hostLoadAverage() > MAX_LOAD_AVERAGE) {
    if (Date.now() >= deadline) return false
    log(`loadavg ${hostLoadAverage()} > ${MAX_LOAD_AVERAGE}: wachten met meten`)
    await new Promise((resolve) => setTimeout(resolve, 20_000))
  }
  return true
}

async function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)))
  })
}

/**
 * Eigen poorten per worktree, zodat rigs van verschillende tracks elkaars webserver niet raken
 * (2026-10-07: ttfr-time-outs op de vaste 4392/8392). Altijd vier cijfers en per worktree
 * dezelfde, want de datapoort staat in de gebouwde bundel en telt dus mee in de wire-bytes.
 */
export async function rigPorts(worktree: string): Promise<{ port: number; dataPort: number }> {
  const start = createHash('sha256').update(worktree).digest().readUInt16BE(0) % 500
  for (let attempt = 0; attempt < 500; attempt++) {
    const offset = (start + attempt) % 500
    const port = 4400 + offset
    const dataPort = 8400 + offset
    if (await portIsFree(port) && await portIsFree(dataPort)) return { port, dataPort }
  }
  throw new Error('Geen vrij poortpaar in 4400–4899 / 8400–8899')
}
