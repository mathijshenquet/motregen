import { defineConfig, devices } from '@playwright/test'
import { performanceProjects } from './e2e/profiles'

// Specs die alleen in Gecko iets zeggen (gedrag van Firefox voor Android dat Chromium niet heeft); de
// Chromium-profielen slaan ze over en het firefox-project draait alleen deze.
const FIREFOX_ONLY = /firefox\.[^/]*\.spec\.ts$/

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
  projects: [
    ...performanceProjects.map((project) => ({ ...project, testIgnore: FIREFOX_ONLY })),
    {
      name: 'firefox',
      testMatch: FIREFOX_ONLY,
      // De nabootsing van visualViewport is timing-gevoelig (2 van 15 rood in de orkestrator-gate, 2026-10-08);
      // tot firefox.table.spec deterministisch is mag een test twee keer opnieuw.
      retries: 2,
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        // De Chromium-vlaggen hieronder gelden hier niet; WebGL loopt via de softwarerenderer.
        launchOptions: {
          firefoxUserPrefs: { 'webgl.force-enabled': true, 'gfx.webrender.software': true },
          env: {
            ...process.env,
            LIBGL_ALWAYS_SOFTWARE: '1',
            LP_NUM_THREADS: '2',
            ...process.env.MOTREGEN_FIREFOX_MESA ? {
              LIBGL_DRIVERS_PATH: `${process.env.MOTREGEN_FIREFOX_MESA}/lib/dri`,
              __EGL_VENDOR_LIBRARY_FILENAMES: `${process.env.MOTREGEN_FIREFOX_MESA}/share/glvnd/egl_vendor.d/50_mesa.json`,
              LD_LIBRARY_PATH: `${process.env.MOTREGEN_FIREFOX_MESA}/lib:${process.env.MOTREGEN_FIREFOX_GL}/lib`,
            } : {},
          },
        },
      },
    },
  ],
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
      command: `pnpm synthgen && pnpm exec tsx scripts/e2e-basemap.ts && MOTREGEN_E2E_DATA_PORT=${dataPort} caddy run --config e2e/Caddyfile`,
      url: `http://127.0.0.1:${dataPort}/manifest.json`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Naar een eigen map: web/dist blijft de normale build waar de track-preview uit serveert (een e2e-run
      // overschreef die met de test-basemap en liet de splash bij de PO hangen, 2026-10-07).
      command: `pnpm exec tsc -b && VITE_BASEMAP_STYLE_URL=http://127.0.0.1:${dataPort}/style.json pnpm exec vite build --outDir tmp/e2e-dist --emptyOutDir && MOTREGEN_DATA_ORIGIN=http://127.0.0.1:${dataPort} MOTREGEN_HIT_LOG=${hitLogPath} pnpm preview --outDir tmp/e2e-dist --host 127.0.0.1 --port ${port}`,
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `MOTREGEN_E2E_ROUTE_PORT=${dataPort + 1} caddy run --config e2e/Caddyfile.routes`,
      url: `http://127.0.0.1:${dataPort + 1}`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
