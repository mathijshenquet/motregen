import { defineConfig, devices } from '@playwright/test'
import mobile from './playwright.mobile.config'

export default defineConfig({
  ...mobile,
  testMatch: 'basemap-cache.spec.ts',
  timeout: 90_000,
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
  use: { ...mobile.use, serviceWorkers: 'allow' },
  webServer: (mobile.webServer as Array<{ command: string }>).map((server, index) => index === 1
    ? { ...server, command: server.command.replace(/VITE_BASEMAP_STYLE_URL=\S+ /, '') }
    : server),
})
