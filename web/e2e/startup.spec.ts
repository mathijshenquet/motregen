import { expect, test } from '@playwright/test'

test('het manifest en eerste regenbereik starten vóór de appbundel en tellen één sessie', async ({ page }) => {
  let releaseBundle!: () => void
  const bundleGate = new Promise<void>((resolve) => { releaseBundle = resolve })
  await page.route('**/assets/index-*.js', async (route) => {
    await bundleGate
    await route.continue()
  })
  const manifests: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/data/manifest.json')) manifests.push(request.url())
  })
  const firstManifest = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith('/data/manifest.json'))
  const firstRainRange = page.waitForRequest((request) => /\/(rtcor|nowcast|seamless|harmonie)-[^/]+\.mrf$/.test(new URL(request.url()).pathname) && Boolean(request.headers().range) && !request.headers().range!.startsWith('bytes=0-'))
  await page.goto('/', { waitUntil: 'commit' })
  try {
    expect(new URL((await firstManifest).url()).search).toBe('?s=1')
    expect((await firstRainRange).headers().range).toMatch(/^bytes=\d+-\d+$/)
  } finally {
    releaseBundle()
  }
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  expect(manifests.filter((url) => new URL(url).searchParams.get('s') === '1')).toHaveLength(1)
})

test('stills vragen het vroege manifest zonder sessievlag', async ({ page }) => {
  const firstManifest = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith('/data/manifest.json'))
  await page.goto('/?still=1', { waitUntil: 'commit' })
  expect(new URL((await firstManifest).url()).search).toBe('')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
})

test('de skywatch-renderer vraagt geen weerdata', async ({ page }) => {
  const manifests: string[] = []
  const workers: string[] = []
  page.on('worker', (worker) => workers.push(worker.url()))
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/data/manifest.json')) manifests.push(request.url())
  })
  const params = new URLSearchParams({
    'skywatch-render': '1',
    at: '2026-08-28T15:00:00Z',
    times: JSON.stringify(['2026-08-28T15:00:00Z', '2026-08-28T18:00:00Z']),
    high: '[0.2,0.3]',
    mid: '[0.4,0.5]',
    low: '[0.6,0.7]',
  })
  await page.goto(`/?${params}`)
  await expect(page.getByTestId('skywatch-render')).toBeVisible()
  expect(manifests).toEqual([])
  expect(workers).toEqual([])
})
