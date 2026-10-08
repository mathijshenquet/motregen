import { expect, test } from '@playwright/test'

test('startmanifestcache is kort bruikbaar en expliciet verversen omzeilt hem', async ({ page, context }) => {
  test.skip(process.env.VITE_WARM_CACHE !== 'manifest', 'Afzonderlijke U64-buildproef')
  await page.goto('/weer?perf=1')
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.reload()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await expect.poll(() => page.evaluate(async () => {
    const cache = await caches.open('motregen-start-manifest-v1')
    return Boolean((await cache.match('/data/manifest.json?s=1'))?.headers.get('X-Motregen-Cached-At'))
  })).toBe(true)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.clearBrowserCache')
  await context.setOffline(true)
  const cached = await page.evaluate(async () => {
    const response = await fetch('/data/manifest.json?s=1')
    return { status: response.status, cachedAt: response.headers.get('X-Motregen-Cached-At'), generated: (await response.json()).generated }
  })
  expect(cached.status).toBe(200)
  expect(Number(cached.cachedAt)).toBeGreaterThan(0)
  expect(cached.generated).toBeTruthy()
  expect(await page.evaluate(async () => {
    try { await fetch('/data/manifest.json?s=1', { cache: 'no-cache' }); return false }
    catch { return true }
  })).toBe(true)
  await page.waitForTimeout(Math.max(0, 15_100 - (Date.now() - Number(cached.cachedAt))))
  expect(await page.evaluate(async () => {
    try { await fetch('/data/manifest.json?s=1'); return false }
    catch { return true }
  })).toBe(true)
  await context.setOffline(false)
  const refreshed = await page.evaluate(async () => {
    const response = await fetch('/data/manifest.json?s=1', { cache: 'no-cache' })
    return { status: response.status, generated: (await response.json()).generated }
  })
  expect(refreshed).toEqual({ status: 200, generated: cached.generated })
})
