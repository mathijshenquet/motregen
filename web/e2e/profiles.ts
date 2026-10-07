import { devices, type CDPSession, type PlaywrightTestConfig } from '@playwright/test'

export interface PerformanceProfile {
  id: 'desktop' | 'mobile-4g' | 'mobile-fast-3g' | 'po-android'
  label: string
  cpuThrottleRate: number
  network: {
    label: string
    downloadThroughput: number
    uploadThroughput: number
    latency: number
    connectionType: 'cellular4g' | 'cellular3g'
  } | null
  coldTtfrBudgetMs: number
  warmTtfrBudgetMs: number
  warmChunkByteBudget: number
  passiveChunkByteBudget: number
  scrubTransferBudget: number
  sessionByteBudget: number
  /** Wijkt het toestel af van de Pixel 5 van het Playwright-project, dan zet de rig dit per run. */
  device?: { viewport: { width: number; height: number }; userAgent: string }
  /** CPU-rem per worker (decodes); zonder dit veld draaien workers op hostsnelheid. */
  workerCpuThrottleRate?: number
  /** Schaal van het synthraster in de laadrig; 3 geeft 570 × 690 cellen, in de orde van het KNMI-raster. */
  synthGridScale?: number
}

const megabit = 1_000_000 / 8

export const performanceProfiles: readonly PerformanceProfile[] = [
  {
    id: 'desktop',
    label: 'Desktop',
    cpuThrottleRate: 1,
    network: null,
    coldTtfrBudgetMs: 1_210,
    warmTtfrBudgetMs: 890,
    warmChunkByteBudget: 0,
    passiveChunkByteBudget: 1_155_000,
    scrubTransferBudget: 19,
    sessionByteBudget: 2_640_000,
  },
  {
    id: 'mobile-4g',
    label: 'Mobiel 4G',
    cpuThrottleRate: 4,
    network: {
      label: '4G (9 Mbps, 60 ms RTT)',
      downloadThroughput: 9 * megabit,
      uploadThroughput: 1.5 * megabit,
      latency: 60,
      connectionType: 'cellular4g',
    },
    coldTtfrBudgetMs: 4_915,
    warmTtfrBudgetMs: 1_545,
    warmChunkByteBudget: 0,
    passiveChunkByteBudget: 686_000,
    scrubTransferBudget: 11,
    sessionByteBudget: 1_345_000,
  },
  {
    id: 'mobile-fast-3g',
    label: 'Mobiel Fast 3G',
    cpuThrottleRate: 4,
    network: {
      label: 'Fast 3G (1,6 Mbps, 150 ms RTT)',
      downloadThroughput: 1.6 * megabit,
      uploadThroughput: 750_000 / 8,
      latency: 150,
      connectionType: 'cellular3g',
    },
    coldTtfrBudgetMs: 5_360,
    warmTtfrBudgetMs: 1_690,
    warmChunkByteBudget: 0,
    passiveChunkByteBudget: 686_000,
    scrubTransferBudget: 14,
    sessionByteBudget: 1_355_000,
  },
  {
    // De telefoon van de PO (Android Chrome, opnames 2026-10-07). Kalibratie en afwijking per
    // meetpunt: docs/perf.md §Profiel po-android. Budgetten zijn die van mobile-4g; dit profiel
    // draait alleen in de mobiele laadrig, niet in perf.spec.
    id: 'po-android',
    label: 'PO-telefoon (Android Chrome)',
    cpuThrottleRate: 4,
    network: {
      label: 'wifi via dev-host (30 Mbps, 20 ms RTT)',
      downloadThroughput: 30 * megabit,
      uploadThroughput: 10 * megabit,
      latency: 20,
      connectionType: 'cellular4g',
    },
    coldTtfrBudgetMs: 4_915,
    warmTtfrBudgetMs: 1_545,
    warmChunkByteBudget: 0,
    passiveChunkByteBudget: 686_000,
    scrubTransferBudget: 11,
    sessionByteBudget: 1_345_000,
    device: {
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
    },
  },
]

const android = devices['Pixel 5']

export const performanceProjects: NonNullable<PlaywrightTestConfig['projects']> = [
  { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  { name: 'mobile-4g', use: { ...android } },
  { name: 'mobile-fast-3g', use: { ...android } },
]

export function performanceProfile(projectName: string): PerformanceProfile {
  const profile = performanceProfiles.find((candidate) => candidate.id === projectName)
  if (!profile) throw new Error(`Onbekend performanceprofiel: ${projectName}`)
  return profile
}

export async function applyEmulation(cdp: CDPSession, profile: PerformanceProfile): Promise<void> {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuThrottleRate })
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false })
  if (!profile.network) return
  const conditions = {
    offline: false,
    latency: profile.network.latency,
    downloadThroughput: profile.network.downloadThroughput,
    uploadThroughput: profile.network.uploadThroughput,
    connectionType: profile.network.connectionType,
  } as const
  await cdp.send('Network.overrideNetworkState', conditions)
  await cdp.send('Network.emulateNetworkConditionsByRule', {
    matchedNetworkConditions: [{ urlPattern: '', ...conditions }],
  })
}
