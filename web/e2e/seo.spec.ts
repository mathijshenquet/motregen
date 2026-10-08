import { expect, test } from '@playwright/test'

test('robots.txt allows the site and excludes /data/', async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'gedrag, geen performance: één profiel volstaat')
  const response = await request.get('/robots.txt')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toMatch(/^text\/plain/)
  const lines = (await response.text()).trim().split('\n')
  expect(lines).toEqual(['User-agent: *', 'Allow: /', 'Disallow: /data/', 'Sitemap: https://motregen.nl/sitemap.xml'])
})

test('index.html carries title, description, canonical, social cards and noscript text', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'gedrag, geen performance: één profiel volstaat')
  await page.goto('/')
  await expect(page).toHaveTitle('Regenradar De Bilt — motregen.nl')
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl')
  const head = page.locator('head')
  await expect(head.locator('meta[name="description"]')).toHaveAttribute('content', /KNMI/)
  await expect(head.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://motregen.nl/weer/de-bilt')
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

const caddyOrigin = `http://127.0.0.1:${Number(process.env.MOTREGEN_E2E_DATA_PORT ?? 8185) + 1}`

test('Caddy serves page titles, canonical and place text without JavaScript', async ({ request }) => {
  for (const [path, title, place] of [
    ['/wind/utrecht', 'Wind Utrecht', 'Utrecht'],
    ['/weer/nieuw-vennep', 'Regenradar Nieuw Vennep', 'Nieuw Vennep'],
    ['/gevoel/s-hertogenbosch', 'Gevoelstemperatuur &#39;s-Hertogenbosch', '&#39;s-Hertogenbosch'],
  ]) {
    const response = await request.get(`${caddyOrigin}${path}`)
    expect(response.status()).toBe(200)
    const html = await response.text()
    expect(html).toContain(`<title>${title} — motregen.nl</title>`)
    expect(html).toContain(`content="${title} — motregen.nl"`)
    expect(html).toContain(`href="https://motregen.nl${path}"`)
    expect(html).toContain(`<p>Het weer voor ${place}. motregen.nl toont`)
    expect(html).not.toContain('{{')
  }
})

test('Caddy permanently redirects legacy presets and keeps flags plus fragment time', async ({ request }) => {
  for (const [query, target] of [
    ['?modus=wind', '/wind'],
    ['?modus=wind&plaats=Utrecht', '/wind/utrecht'],
    ['?modus=gevoel&plaats=Bergen%20op%20Zoom', '/gevoel/bergen-op-zoom'],
    ['?plaats=%27s-Hertogenbosch', '/weer/s-hertogenbosch'],
    ['?modus=lucht&plaats=utrecht&t=2026-10-08T0757&dev&perf=start&tg=1', '/lucht/utrecht?dev=&perf=start&tg=1#t=2026-10-08T0757'],
  ]) {
    const response = await request.get(`${caddyOrigin}/${query}`, { maxRedirects: 0 })
    expect(response.status()).toBe(301)
    expect(response.headers().location).toBe(target)
  }
  for (const query of ['?modus=wind&lat=52.09&lon=5.12', '?modus=weer&plaats=Thuis', '?modus=weer&plaats=Werk']) {
    const response = await request.get(`${caddyOrigin}/${query}`, { maxRedirects: 0 })
    expect(response.status()).toBe(200)
  }
})

test('the sitemap lists Dutch places in all four modes, without query or fragments', async ({ request }) => {
  const response = await request.get('/sitemap.xml')
  expect(response.status()).toBe(200)
  const xml = await response.text()
  const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]!)
  expect(new Set(locations).size).toBe(locations.length)
  expect(locations.length).toBeGreaterThanOrEqual(200)
  expect(locations.length).toBeLessThanOrEqual(225)
  for (const mode of ['weer', 'lucht', 'gevoel', 'wind']) {
    expect(locations).toContain(`https://motregen.nl/${mode}/utrecht`)
    expect(locations).toContain(`https://motregen.nl/${mode}/groningen`)
  }
  expect(locations.every((location) => !/[?#]/.test(location))).toBe(true)
  expect(locations).not.toContain('https://motregen.nl/weer/brussel')
})
