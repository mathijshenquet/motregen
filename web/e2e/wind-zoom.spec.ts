import { expect, test, type Page } from '@playwright/test'

// U20: na een zoomstap blijft de wind staan — geen leeg beeld en geen dubbele inkt. Inkt is de
// gemiddelde RGB-afwijking van de kaart door de windcanvas (wind-ink-methode), gemeten tegen
// hetzelfde beeld met alleen die canvas verborgen.
test('wind keeps its ink through a zoom step: no blank, no doubling', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'renderpad, geen performance: desktop volstaat')
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  await page.waitForFunction(() => (globalThis as { __motregenWind?: { map?: unknown } }).__motregenWind?.map !== undefined)
  await page.evaluate(() => {
    // Adaptief budget uit: swiftshader schaalt anders zijn eigen particles terug.
    const wind = (globalThis as unknown as { __motregenWind: Record<string, unknown> }).__motregenWind
    wind.frameCount = -1e12
    wind.budget = wind.target
    ;(wind.balance as () => void).call(wind)
  })
  const pause = page.getByRole('button', { name: 'Pauzeren' })
  if (await pause.count()) await pause.first().click()
  await page.waitForTimeout(4_000)

  const before = await ink(page)
  expect(before).toBeGreaterThan(0.2)
  for (const delta of [1, -1]) {
    await page.evaluate((step) => new Promise<void>((resolve) => {
      const map = (globalThis as unknown as { __motregenWind: { map: { once: (event: string, callback: () => void) => void; easeTo: (options: object) => void; getZoom: () => number } } }).__motregenWind.map
      map.once('moveend', () => resolve())
      map.easeTo({ zoom: map.getZoom() + step, duration: 600 })
    }), delta)
    await page.waitForTimeout(300)
    const after = await ink(page)
    await page.screenshot({ path: testInfo.outputPath(`wind-zoom-${delta > 0 ? 'in' : 'uit'}.png`) })
    expect(after / before, `inkt ${delta > 0 ? 'in' : 'uit'}gezoomd ${after.toFixed(3)} tegen ${before.toFixed(3)} vóór`).toBeGreaterThan(0.8)
    expect(after / before).toBeLessThan(1.2)
  }
})

/** Gemiddelde over drie paren (wind zichtbaar, wind verborgen), ~0,2 s uit elkaar. */
async function ink(page: Page): Promise<number> {
  const map = page.locator('.map')
  let total = 0
  for (let sample = 0; sample < 3; sample++) {
    const shot = await map.screenshot()
    await page.locator('.map-overlay-motregen-wind').evaluate((element: HTMLElement) => { element.style.visibility = 'hidden' })
    const base = await map.screenshot()
    await page.locator('.map-overlay-motregen-wind').evaluate((element: HTMLElement) => { element.style.visibility = '' })
    total += await page.evaluate(async ([shotBase64, baseBase64]) => {
      const decode = async (base64: string) => {
        const image = new Image()
        image.src = `data:image/png;base64,${base64}`
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d')!
        context.drawImage(image, 0, 0)
        return context.getImageData(0, 0, image.width, image.height).data
      }
      const [withWind, without] = await Promise.all([decode(shotBase64!), decode(baseBase64!)])
      let sum = 0
      for (let index = 0; index < withWind.length; index += 4) {
        sum += Math.abs(withWind[index]! - without[index]!) + Math.abs(withWind[index + 1]! - without[index + 1]!) + Math.abs(withWind[index + 2]! - without[index + 2]!)
      }
      return sum / (withWind.length / 4)
    }, [shot.toString('base64'), base.toString('base64')])
  }
  return total / 3
}
