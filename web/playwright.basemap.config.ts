import { defineConfig, devices } from '@playwright/test'
import mobile from './playwright.mobile.config'

export default defineConfig({
  ...mobile,
  testMatch: ['basemap.spec.ts', 'basemap-parse.rig.ts'],
  outputDir: './tmp/basemap/playwright',
  expect: { timeout: 15_000 },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
  webServer: (mobile.webServer as Array<{ command: string }>).map((server, index) => index === 0
    ? { ...server, command: server.command.replace('caddy run', 'pnpm exec tsx ../tools/basemap/parse-fixture.mts && caddy run') }
    : server),
})
