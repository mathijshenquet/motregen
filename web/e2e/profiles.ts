import { devices, type PlaywrightTestConfig } from '@playwright/test'

export interface PerformanceProfile {
  id: 'desktop' | 'mobile-4g' | 'mobile-fast-3g'
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
}

const megabit = 1_000_000 / 8

export const performanceProfiles: readonly PerformanceProfile[] = [
  {
    id: 'desktop',
    label: 'Desktop',
    cpuThrottleRate: 1,
    network: null,
    coldTtfrBudgetMs: 2_000,
    warmTtfrBudgetMs: 750,
    warmChunkByteBudget: 0,
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
    coldTtfrBudgetMs: 4_000,
    warmTtfrBudgetMs: 2_000,
    warmChunkByteBudget: 12_000,
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
    coldTtfrBudgetMs: 8_000,
    warmTtfrBudgetMs: 4_000,
    warmChunkByteBudget: 12_000,
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
