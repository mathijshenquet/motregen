import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.MOTREGEN_E2E_PORT ?? 4392)
const dataPort = Number(process.env.MOTREGEN_E2E_DATA_PORT ?? 8392)
const fixtureDir = `tmp/perf-mobile/fixture-${dataPort}`
const distDir = `tmp/perf-mobile/dist-${port}`
process.env.MOTREGEN_MOBILE_FIXTURE_DIR = fixtureDir
process.env.MOTREGEN_RIG_DIST = distDir
const basemap = process.env.MOTREGEN_MOBILE_BASEMAP ?? 'fixture'
const styleOverride = `VITE_BASEMAP_STYLE_URL=http://127.0.0.1:${dataPort}/${basemap === 'fixture' ? 'style' : 'style-{theme}'}.json`

export default defineConfig({
  testDir: './e2e',
  testMatch: 'mobile-load.rig.ts',
  outputDir: './tmp/perf-mobile/playwright',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  projects: [{ name: 'desktop', use: { ...devices['Pixel 5'] } }],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    serviceWorkers: 'block',
    launchOptions: { args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] },
  },
  webServer: [
    {
      command: `MOTREGEN_SYNTH_DIR=${fixtureDir} pnpm synthgen && MOTREGEN_E2E_DATA_PORT=${dataPort} pnpm exec tsx scripts/mobile-fixture.ts && MOTREGEN_E2E_DATA_PORT=${dataPort} caddy run --config perf/Caddyfile`,
      url: `http://127.0.0.1:${dataPort}/manifest.json`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `${styleOverride} pnpm build --outDir ${distDir} && pnpm exec tsx scripts/mobile-assets.ts && MOTREGEN_E2E_PORT=${port} MOTREGEN_E2E_DATA_PORT=${dataPort} caddy run --config perf/Preview.Caddyfile`,
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
