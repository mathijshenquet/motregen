import { defineConfig } from '@playwright/test'

// U102-meetsuite; start via `pnpm perf:modes` (scripts/perf-modes.ts). Elke test start zijn eigen browser,
// omdat het telefoonprofiel de renderer in een cgroup met CPU-quota zet.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'perf-modes.rig.ts',
  outputDir: './tmp/perf-modes/playwright',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  projects: [{ name: 'perf' }],
})
