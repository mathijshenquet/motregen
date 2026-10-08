import { readFileSync, writeFileSync } from 'node:fs'
import { test as base, expect, type Page } from '@playwright/test'
import { emulateWorkerNetwork } from '../scripts/rig-worker-network'
import { performanceProfile } from './profiles'

export const test = base.extend({
  context: async ({ playwright, browserName, headless, contextOptions, launchOptions, baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, serviceWorkers, colorScheme }, use) => {
    const browserType = playwright[browserName]
    const settings = { ...contextOptions, baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, serviceWorkers, colorScheme }
    const profile = process.env.MOTREGEN_RIG_WARM_PROFILE
    if (profile) {
      const context = await browserType.launchPersistentContext(profile, { headless, ...launchOptions, args: [...launchOptions.args ?? [], '--remote-debugging-port=0'], ...settings, serviceWorkers: 'allow' })
      const network = await emulateWorkerNetwork(profile, performanceProfile(process.env.MOTREGEN_RIG_ACTIVE_PROFILE!).network)
      try { await use(context) }
      finally {
        const evidence = network.evidence()
        await network.close()
        await context.close()
        expect(evidence.errors, 'SW-netwerkemulatie zonder protocolfouten').toEqual([])
        if (warmVisit && new URL(settings.baseURL ?? 'https://www.buienradar.nl').hostname === '127.0.0.1') {
          expect(evidence.targets.length, 'SW ook via CDP geremd').toBeGreaterThan(0)
          expect(evidence.targets.every(target => target.configured)).toBe(true)
        }
        writeFileSync(`${profile}/worker-network.json`, JSON.stringify(evidence, null, 2))
      }
    } else {
      const browser = await browserType.launch({ headless, ...launchOptions })
      const context = await browser.newContext(settings)
      try { await use(context) }
      finally { await context.close(); await browser.close() }
    }
  },
})

export const warmingCache = process.env.MOTREGEN_RIG_WARM_SEED === '1'
export const warmVisit = Boolean(process.env.MOTREGEN_RIG_WARM_PROFILE) && !warmingCache

export async function cacheInventory(page: Page) {
  return page.evaluate(async () => ({
    controlled: navigator.serviceWorker.controller !== null,
    caches: await Promise.all((await caches.keys()).map(async (name) => ({ name, urls: (await (await caches.open(name)).keys()).map(request => request.url) }))),
  }))
}

export async function installSeedWorker(page: Page, origin: string): Promise<void> {
  await page.goto(`${origin}/perf-warm-bootstrap`, { waitUntil: 'load' })
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
  })
}

export async function completeCacheSeed(page: Page, durationMs: number): Promise<void> {
  await expect(page.getByRole('slider', { name: 'Tijd' })).toHaveAttribute('data-load-stage', 'window', { timeout: 120_000 })
  await page.waitForFunction(() => window.__motregenPerf?.snapshot().basemapReadyMs !== null && window.__motregenPerf?.snapshot().ttfpMs !== null)
  const remaining = durationMs - await page.evaluate(() => performance.now())
  if (remaining > 0) await page.waitForTimeout(remaining)
  await page.waitForLoadState('networkidle')
  const inventory = await cacheInventory(page)
  expect(inventory.controlled, 'cachevulbezoek heeft een actieve SW').toBe(true)
  const profile = process.env.MOTREGEN_RIG_WARM_PROFILE!
  writeFileSync(`${profile}/cache-seed.json`, JSON.stringify({ completedAt: new Date().toISOString(), ...inventory }, null, 2))
}

export function seedEvidence() {
  const profile = process.env.MOTREGEN_RIG_WARM_PROFILE
  return profile ? JSON.parse(readFileSync(`${profile}/cache-seed.json`, 'utf8')) : undefined
}
