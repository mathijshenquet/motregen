import { defineConfig } from '@playwright/test'
import { performanceProjects } from './e2e/profiles'

const motregenOrigin = process.env.MOTREGEN_BENCHMARK_ORIGIN
if (!motregenOrigin) throw new Error('MOTREGEN_BENCHMARK_ORIGIN is verplicht voor de externe benchmark')

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.benchmark.ts',
  outputDir: './tmp/playwright-benchmark-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 30_000 },
  reporter: [
    ['list'],
    ['./e2e/benchmark-reporter.ts', {
      output: '../tmp/competitive-benchmark',
      motregenOrigin,
      buienradarOrigin: 'https://www.buienradar.nl',
    }],
  ],
  projects: performanceProjects,
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
    },
  },
})
