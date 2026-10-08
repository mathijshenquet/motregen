import { expect, test } from '@playwright/test'
import { useOwnBasemap } from './basemap-fixture'

test('de basiskaart begint met laden terwijl de regenheaders nog onderweg zijn', async ({ page }) => {
  await useOwnBasemap(page)
  let releaseHeaders!: () => void
  const headersGate = new Promise<void>((resolve) => { releaseHeaders = resolve })
  await page.route('**/*.mrf', async (route) => {
    if (route.request().headers().range?.startsWith('bytes=0-')) await headersGate
    await route.continue()
  })
  const firstBasemapRange = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith('.pmtiles'))
  await page.goto('/weer#t=%2B0u', { waitUntil: 'commit' })
  try {
    expect((await firstBasemapRange).headers().range).toMatch(/^bytes=/)
  } finally {
    releaseHeaders()
  }
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  await expect(page).toHaveURL(/\/weer\/de-bilt/)
})
