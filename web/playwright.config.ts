import { defineConfig } from '@playwright/test'
import { performanceProjects } from './e2e/profiles'

const port = 4185

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
      command: 'pnpm synthgen && caddy run --config e2e/Caddyfile',
      url: 'http://127.0.0.1:8185/manifest.json',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `VITE_BASEMAP_STYLE_URL=http://127.0.0.1:8185/style.json pnpm build && MOTREGEN_DATA_ORIGIN=http://127.0.0.1:8185 pnpm preview --host 127.0.0.1 --port ${port}`,
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
