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
  // Opwarmen: de eerste zoom laadt tegels en labels, die anders als windinkt meetellen.
  await zoomBy(page, 1)
  await zoomBy(page, -1)
  await page.waitForTimeout(3_000)

  const before = await ink(page)
  expect(before).toBeGreaterThan(0.2)
  await zoomBy(page, 1)
  const zoomedIn = await ink(page)
  await page.screenshot({ path: testInfo.outputPath('wind-zoom-in.png') })
  // Ingezoomd ligt er ander weer onder; hier alleen: niet leeg (vóór U12 ~0,3×) en niet verdubbeld.
  expect(zoomedIn / before, `ingezoomd ${zoomedIn.toFixed(3)} tegen ${before.toFixed(3)} vóór`).toBeGreaterThan(0.5)
  expect(zoomedIn / before).toBeLessThan(2)
  await zoomBy(page, -1)
  const back = await ink(page)
  await page.screenshot({ path: testInfo.outputPath('wind-zoom-terug.png') })
  // Terug op hetzelfde beeld: binnen ±20 % van vóór de zoom.
  expect(back / before, `terug ${back.toFixed(3)} tegen ${before.toFixed(3)} vóór`).toBeGreaterThan(0.8)
  expect(back / before).toBeLessThan(1.2)
})

// U24: een doorlopende zoom (trackpad/pinch) warpte de trailbuffer elke frame opnieuw en liet
// de staarten tot < ½ wegvagen; één sprong ging wel goed. 100 stappen van 0,02, één per frame.
test('wind keeps its trails through a continuous zoom 7→9, like a single jump does', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'renderpad, geen performance: desktop volstaat')
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  await page.waitForFunction(() => (globalThis as { __motregenWind?: { map?: unknown } }).__motregenWind?.map !== undefined)
  const pause = page.getByRole('button', { name: 'Pauzeren' })
  if (await pause.count()) await pause.first().click()
  const run = (continuous: boolean) => page.evaluate(async (stepwise) => {
    type Map = { jumpTo: (options: object) => void; getZoom: () => number }
    const wind = (globalThis as unknown as { __motregenWind: Record<string, unknown> & { map: Map; render: (...args: unknown[]) => void } }).__motregenWind
    wind.frameCount = -1e12
    wind.budget = wind.target
    ;(wind.balance as () => void).call(wind)
    // Virtuele klok: elk animatieframe telt als 1/60 s, hoe traag swiftshader ook rendert.
    const realNow = performance.now.bind(performance)
    let virtual = realNow()
    performance.now = () => virtual
    const frame = async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      virtual += 1_000 / 60
    }
    const inks: number[] = []
    const render = wind.render
    let pixels = new Uint8Array(0)
    wind.render = (...args: unknown[]) => {
      render.apply(wind, args)
      const gl = args[0] as WebGL2RenderingContext
      const size = gl.drawingBufferWidth * gl.drawingBufferHeight * 4
      if (pixels.length !== size) pixels = new Uint8Array(size)
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      let sum = 0
      for (let index = 3; index < size; index += 4) sum += pixels[index]!
      inks.push(sum / (size / 4))
    }
    wind.map.jumpTo({ zoom: 7 })
    for (let index = 0; index < 240; index++) await frame()
    const rest = inks.length
    if (stepwise) {
      for (let step = 1; step <= 100; step++) {
        wind.map.jumpTo({ zoom: 7 + step * 0.02 })
        await frame()
      }
    } else {
      wind.map.jumpTo({ zoom: 9 })
      await frame()
    }
    const end = inks.length
    await frame()
    wind.render = render
    performance.now = realNow
    const baseline = inks.slice(rest - 30, rest).reduce((sum, value) => sum + value, 0) / 30
    return { baseline, lowest: Math.min(...inks.slice(rest, end)), end: inks[inks.length - 1]! }
  }, continuous)
  const jump = await run(false)
  const continuous = await run(true)
  const summary = `sprong ${JSON.stringify(jump)}, continu ${JSON.stringify(continuous)}`
  await testInfo.attach('wind-continu-zoom.json', { body: summary, contentType: 'text/plain' })
  expect(continuous.baseline, summary).toBeGreaterThan(0)
  // Nooit een leeg beeld tijdens de gesture (vóór U24 zakte het naar ~0,4 van rust).
  expect(continuous.lowest / continuous.baseline, summary).toBeGreaterThan(0.5)
  // Aan het eind ≥ 70 % van de inkt na één sprong (vóór U24 ~0,65).
  expect(continuous.end / (jump.end / jump.baseline * continuous.baseline), summary).toBeGreaterThan(0.7)
})

async function zoomBy(page: Page, step: number): Promise<void> {
  await page.evaluate((delta) => new Promise<void>((resolve) => {
    const map = (globalThis as unknown as { __motregenWind: { map: { once: (event: string, callback: () => void) => void; easeTo: (options: object) => void; getZoom: () => number } } }).__motregenWind.map
    map.once('moveend', () => resolve())
    map.easeTo({ zoom: map.getZoom() + delta, duration: 600 })
  }), step)
  await page.waitForTimeout(300)
}

/** Gemiddelde over drie stills, elk tussen twee byte-gelijke basisbeelden (kaart zelf stond stil). */
async function ink(page: Page): Promise<number> {
  const map = page.locator('.map')
  const wind = page.locator('.map-overlay-motregen-wind')
  const hidden = async () => {
    await wind.evaluate((element: HTMLElement) => { element.style.visibility = 'hidden' })
    const shot = await map.screenshot()
    await wind.evaluate((element: HTMLElement) => { element.style.visibility = '' })
    return shot
  }
  let total = 0
  for (let sample = 0; sample < 3; sample++) {
    let base = await hidden()
    let shot = await map.screenshot()
    for (let after = await hidden(), retries = 0; !after.equals(base) && retries < 3; after = await hidden(), retries++) {
      base = after
      shot = await map.screenshot()
    }
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
