import { defineConfig, devices } from '@playwright/test'

// Meet een vreemde site over het echte netwerk: geen webserver, geen fixture.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'reference-*.rig.ts',
  outputDir: './tmp/perf-mobile/playwright-reference',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  reporter: [['list']],
  projects: [{ name: 'desktop', use: { ...devices['Pixel 5'] } }],
  use: {
    launchOptions: { args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] },
  },
})
