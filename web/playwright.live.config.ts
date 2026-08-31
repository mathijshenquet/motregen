import { defineConfig } from '@playwright/test'
import { performanceProjects } from './e2e/profiles'

const origin = process.env.MOTREGEN_E2E_ORIGIN ?? 'https://motregen.nl'

export default defineConfig({
  testDir: './e2e',
  outputDir: './tmp/playwright-live-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 30_000 },
  reporter: [
    ['list'],
    ['./e2e/perf-reporter.ts', { output: '../tmp/perf-live', origin }],
  ],
  projects: performanceProjects,
  use: {
    baseURL: origin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
    },
  },
})
