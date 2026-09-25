import { defineConfig } from '@playwright/test'
import { performanceProjects } from './e2e/profiles'

// Instelbaar zodat parallelle tracks op één host elkaars e2e-servers niet raken.
const port = Number(process.env.MOTREGEN_E2E_PORT ?? 4185)
const dataPort = Number(process.env.MOTREGEN_E2E_DATA_PORT ?? 8185)
// Per poort, zodat twee slots elkaars ontvangen bakens niet zien (e2e/usage.spec.ts leest hem).
const hitLogPath = `tmp/hits-${port}.jsonl`

export default defineConfig({
  testDir: './e2e',
  outputDir: './tmp/playwright-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  projects: performanceProjects,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
    },
  },
  webServer: [
    {
      command: `pnpm synthgen && MOTREGEN_E2E_DATA_PORT=${dataPort} caddy run --config e2e/Caddyfile`,
      url: `http://127.0.0.1:${dataPort}/manifest.json`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `VITE_BASEMAP_STYLE_URL=http://127.0.0.1:${dataPort}/style.json pnpm build && MOTREGEN_DATA_ORIGIN=http://127.0.0.1:${dataPort} MOTREGEN_HIT_LOG=${hitLogPath} pnpm preview --host 127.0.0.1 --port ${port}`,
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
