import type { Page } from '@playwright/test'

export async function useOwnBasemap(page: Page, theme: 'light' | 'dark' = 'light'): Promise<void> {
  // De gewone suite bouwt met een achtergrondstijl voor de perf-gate; U59-tests hebben PMTiles nodig.
  await page.route('**/style.json', async (route) => {
    const origin = new URL(page.url()).origin
    const response = await page.request.get(`${origin}/basemap/${theme === 'light' ? 'licht' : 'donker'}.json`)
    const style = await response.json()
    style.glyphs = `${origin}${style.glyphs}`
    await route.fulfill({ response, json: style })
  })
}
