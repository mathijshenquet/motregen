import { defineConfig, devices } from '@playwright/test'

// Meet een vreemde site over het echte netwerk: geen webserver, geen fixture.
// Dezelfde renderer-quota als de laadrig (PerformanceProfile.rendererCpuQuotaPercent), anders
// loopt de referentie op een snellere "telefoon" dan wij.
const rendererQuota = Number(process.env.MOTREGEN_RIG_RENDERER_QUOTA ?? 0)
const rendererPrefix = rendererQuota > 0
  ? [`--renderer-cmd-prefix=systemd-run --user --scope --quiet -p CPUQuota=${rendererQuota}% -p CPUQuotaPeriodSec=5ms --`]
  : []

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
    launchOptions: { args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', ...rendererPrefix] },
  },
})
