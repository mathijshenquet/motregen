import { defineConfig, devices } from '@playwright/test'
import { RIG_BUILD_COMMAND, RIG_FIXTURE_COMMAND } from './scripts/rig-host'

const port = Number(process.env.MOTREGEN_E2E_PORT ?? 4392)
const dataPort = Number(process.env.MOTREGEN_E2E_DATA_PORT ?? 8392)

// Zie PerformanceProfile.rendererCpuQuotaPercent. De korte periode (5 ms) maakt van de quota een
// gelijkmatige rem; met de standaard 100 ms zou de renderer in blokken stilvallen en zelf lange
// frames veroorzaken.
// perf:mobile bouwt fixture en client zelf, vóór het wachten op een rustige host.
const prebuilt = process.env.MOTREGEN_RIG_PREBUILT === '1'
const rendererQuota = Number(process.env.MOTREGEN_RIG_RENDERER_QUOTA ?? 0)
const rendererPrefix = rendererQuota > 0
  ? [`--renderer-cmd-prefix=systemd-run --user --scope --quiet -p CPUQuota=${rendererQuota}% -p CPUQuotaPeriodSec=5ms --`]
  : []

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
    launchOptions: { args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', ...rendererPrefix] },
  },
  webServer: [
    {
      command: `${prebuilt ? '' : `${RIG_FIXTURE_COMMAND} && `}MOTREGEN_E2E_DATA_PORT=${dataPort} caddy run --config perf/Caddyfile`,
      url: `http://127.0.0.1:${dataPort}/manifest.json`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `${prebuilt ? '' : `${RIG_BUILD_COMMAND} && `}MOTREGEN_E2E_PORT=${port} MOTREGEN_E2E_DATA_PORT=${dataPort} caddy run --config perf/Preview.Caddyfile`,
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
