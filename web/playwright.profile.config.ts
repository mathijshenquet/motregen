import { defineConfig, type PlaywrightTestConfig } from '@playwright/test'
import { performanceProjects } from './e2e/profiles'

// synth: lokale synthset + Caddy; prod: deze build met /data geproxyd naar
// motregen.nl (loadtrace beschikbaar); origin: rechtstreeks tegen een origin
// (alleen netwerk + DOM, want de gedeployde bundle mist mogelijk de loadtrace).
const target = process.env.MOTREGEN_PROFILE_TARGET ?? 'synth'
const port = Number(process.env.MOTREGEN_E2E_PORT ?? 4187)
const synthDataPort = Number(process.env.MOTREGEN_E2E_DATA_PORT ?? 8185)
const origin = process.env.MOTREGEN_PROFILE_ORIGIN ?? 'https://motregen.nl'

const servers: Record<string, PlaywrightTestConfig['webServer']> = {
  synth: [
    {
      command: `pnpm synthgen && MOTREGEN_E2E_DATA_PORT=${synthDataPort} caddy run --config e2e/Caddyfile`,
      url: `http://127.0.0.1:${synthDataPort}/manifest.json`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `VITE_BASEMAP_STYLE_URL=http://127.0.0.1:${synthDataPort}/style.json pnpm build && MOTREGEN_DATA_ORIGIN=http://127.0.0.1:${synthDataPort} pnpm preview --host 127.0.0.1 --port ${port}`,
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  prod: {
    command: `pnpm build && MOTREGEN_DATA_ORIGIN=${origin}/data pnpm preview --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  origin: undefined,
}
if (!(target in servers)) throw new Error(`Onbekend profieltarget: ${target}`)

export default defineConfig({
  testDir: './e2e',
  testMatch: 'load.profile.ts',
  outputDir: './tmp/playwright-profile-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  reporter: [['list']],
  projects: performanceProjects,
  use: {
    baseURL: target === 'origin' ? origin : `http://127.0.0.1:${port}`,
    launchOptions: {
      args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
    },
  },
  webServer: servers[target],
})
