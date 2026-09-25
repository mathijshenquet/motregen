import { expect, test } from '@playwright/test'

test('robots.txt allows the site and excludes /data/ and /stats/', async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'gedrag, geen performance: één profiel volstaat')
  const response = await request.get('/robots.txt')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toMatch(/^text\/plain/)
  const lines = (await response.text()).trim().split('\n')
  expect(lines).toEqual(['User-agent: *', 'Allow: /', 'Disallow: /data/', 'Disallow: /stats/'])
})

test('index.html carries title, description, canonical, social cards and noscript text', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'gedrag, geen performance: één profiel volstaat')
  await page.goto('/')
  await expect(page).toHaveTitle('motregen.nl — regenradar en verwachting voor Nederland en Vlaanderen')
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl')
  const head = page.locator('head')
  await expect(head.locator('meta[name="description"]')).toHaveAttribute('content', /KNMI/)
  await expect(head.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://motregen.nl/')
  for (const property of ['og:title', 'og:description', 'og:url', 'og:type']) {
    await expect(head.locator(`meta[property="${property}"]`)).toHaveAttribute('content', /\S/)
  }
  await expect(head.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://motregen.nl/og-image.png')
  await expect(head.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')
  await expect(head.locator('meta[name="theme-color"][media="(prefers-color-scheme: light)"]')).toHaveCount(1)
  await expect(head.locator('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]')).toHaveCount(1)

  // De crawler zonder JS leest de noscript-alinea; de PNG achter og:image bestaat en is 1200×630.
  const html = await (await request.get('/')).text()
  expect(html).toMatch(/<noscript>\s*<p>motregen\.nl toont[^<]*KNMI[^<]*<\/p>\s*<\/noscript>/)
  const image = await request.get('/og-image.png')
  expect(image.status()).toBe(200)
  const png = await image.body()
  expect(png.subarray(1, 4).toString()).toBe('PNG')
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630])
})
