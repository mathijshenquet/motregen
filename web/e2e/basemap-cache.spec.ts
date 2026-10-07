import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { applyEmulation, performanceProfile } from './profiles'

for (const width of [390, 1280]) {
  test(`warme basiskaart zonder netwerk ${width}px`, async ({ page, context }, testInfo) => {
    const diagnostics: string[] = []
    context.on('console', message => { if (message.type() === 'error') diagnostics.push(message.text()) })
    page.on('response', response => {
      if (response.url().endsWith('.pmtiles')) diagnostics.push(`${response.status()} ${response.url()} SW=${response.fromServiceWorker()}`)
    })
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 })
    const cdp = await context.newCDPSession(page)
    await applyEmulation(cdp, performanceProfile(width === 390 ? 'mobile-4g' : 'desktop'))
    await cdp.send('Network.clearBrowserCache')
    await page.goto('/?perf=1&t=%2B0u&modus=weer')
    await expect(page.locator('.map-splash.ready')).toBeAttached()
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await page.goto(page.url())
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
    await expect(page.locator('.map-splash.ready')).toBeAttached()
    await expect.poll(() => page.evaluate(async () => (await (await caches.open('motregen-basemap-ranges-v1')).keys()).length)).toBeGreaterThan(1).catch(async (error) => {
      await testInfo.attach('rangecache', { body: diagnostics.join('\n'), contentType: 'text/plain' })
      console.log(diagnostics.join('\n'))
      throw error
    })
    await page.waitForTimeout(1_000)
    const cold = await page.evaluate(() => window.__motregenPerf.snapshot())
    const network: string[] = []
    const isBasemap = (url: string) => /\/basemap\//.test(new URL(url).pathname)
    context.on('request', request => {
      if (isBasemap(request.url()) && (request.serviceWorker() || !request.frame())) network.push(request.url())
    })
    const ranges: Array<{ status: number; cached: boolean }> = []
    page.on('response', response => {
      if (response.url().endsWith('.pmtiles')) ranges.push({ status: response.status(), cached: response.fromServiceWorker() })
    })
    await cdp.send('Network.clearBrowserCache')
    await page.goto(page.url())
    await expect(page.locator('.map-splash.ready')).toBeAttached()
    await page.waitForTimeout(1_000)
    const warm = await page.evaluate(() => window.__motregenPerf.snapshot())
    expect(network).toEqual([])
    expect(ranges.length).toBeGreaterThan(1)
    expect(ranges.every(response => response.status === 206 && response.cached)).toBe(true)
    const cache = await page.evaluate(async () => {
      const cache = await caches.open('motregen-basemap-ranges-v1')
      const keys = await cache.keys()
      let bytes = 0
      for (const key of keys) bytes += (await (await cache.match(key))!.arrayBuffer()).byteLength
      return { entries: keys.length, bytes }
    })
    mkdirSync('tmp/basemap', { recursive: true })
    writeFileSync(`tmp/basemap/cache-${width}.json`, JSON.stringify({ network, ranges, cache, cold, warm }, null, 2))
    await context.setOffline(true)
    const cachedStyle = await page.evaluate(async () => (await fetch('/basemap/licht.json')).status)
    expect(cachedStyle).toBe(200)
    const cachedRange = await page.evaluate(async () => {
      const style = await fetch('/basemap/licht.json').then(response => response.json())
      const response = await fetch(style.sources.basemap.url.slice('pmtiles://'.length), { headers: { Range: 'bytes=0-16383' } })
      return { status: response.status, bytes: (await response.arrayBuffer()).byteLength, range: response.headers.get('Content-Range') }
    })
    expect(cachedRange.status).toBe(206)
    expect(cachedRange.bytes).toBe(16_384)
    expect(cachedRange.range).toMatch(/^bytes 0-16383\//)
    await context.setOffline(false)
    const crossOrigin = await page.evaluate(async () => {
      const style = await fetch('/basemap/licht.json').then(response => response.json())
      const url = new URL(style.sources.basemap.url.slice('pmtiles://'.length), location.origin)
      url.hostname = 'localhost'
      const response = await fetch(url, { headers: { Range: 'bytes=256-511' } })
      return { url: url.href, status: response.status, bytes: [...new Uint8Array(await response.arrayBuffer())] }
    })
    expect(crossOrigin.status).toBe(206)
    expect(crossOrigin.bytes.length).toBe(256)
    await expect.poll(() => page.evaluate(async (url) => {
      const cache = await caches.open('motregen-basemap-ranges-v1')
      return (await cache.keys()).some(request => request.url.startsWith(url))
    }, crossOrigin.url)).toBe(true)
    await context.setOffline(true)
    const offlineCrossOrigin = await page.evaluate(async (url) => {
      const response = await fetch(url, { headers: { Range: 'bytes=256-511' } })
      return { status: response.status, bytes: [...new Uint8Array(await response.arrayBuffer())] }
    }, crossOrigin.url)
    expect(offlineCrossOrigin).toEqual({ status: 206, bytes: crossOrigin.bytes })
    await context.setOffline(false)
  })
}
