import { chromium, devices, type BrowserContextOptions, type Page } from '@playwright/test'

// Meet de "inkt" van de windlaag (track U3): gemiddelde absolute RGB-afwijking
// die de trails veroorzaken, apart voor land- en zeepixels. Referentiebeeld is
// dezelfde pagina met de windlaag onzichtbaar gezet. `mode` = before (oude
// ?dev-slider "Zichtbaar") of after (PerfHud-veld "Intensiteit").
const [origin, mode] = process.argv.slice(2)
if (!origin || (mode !== 'before' && mode !== 'after')) throw new Error('usage: pnpm exec tsx scripts/wind-ink.ts ORIGIN before|after')

const profiles: Array<{ id: string; context: BrowserContextOptions }> = [
  { id: 'mobile', context: { ...devices['Pixel 5'] } },
  { id: 'desktop', context: { viewport: { width: 1280, height: 720 } } },
]
const samples = 4
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })

for (const profile of profiles) {
  for (const theme of ['light', 'dark'] as const) {
    const context = await browser.newContext(profile.context)
    await context.addInitScript((value) => { localStorage.setItem('motregen-theme', value); localStorage.removeItem('motregen-wind-tuning') }, theme)
    const page = await context.newPage()
    page.setDefaultTimeout(120_000)
    await page.goto(new URL(mode === 'before' ? '/?dev' : '/?perf=1', origin).href)
    await page.waitForFunction(() => (globalThis as unknown as { __motregenPerf?: { snapshot: () => { ttfrMs: number | null } } }).__motregenPerf?.snapshot().ttfrMs != null)
    await page.waitForTimeout(6_000)
    // Autoplay pauzeren: bewegende regen zou anders als windinkt meetellen.
    const pause = page.getByRole('button', { name: 'Pauzeren' })
    if (await pause.count()) await pause.first().evaluate((element) => (element as unknown as { click: () => void }).click())
    await page.waitForTimeout(1_000)
    await page.addStyleTag({ content: '.wind-debug,.perf-hud{visibility:hidden!important}' })
    const shots: Buffer[] = []
    for (let index = 0; index < samples; index++) {
      shots.push(await page.locator('.map').first().screenshot())
      await page.waitForTimeout(350)
    }
    await hideWind(page)
    await page.waitForTimeout(400)
    const base = await page.locator('.map').first().screenshot()
    const stats = await analyse(page, base, shots)
    console.log(mode, `${profile.id}-${theme}`, JSON.stringify(stats))
    await context.close()
  }
}
await browser.close()

async function hideWind(page: Page): Promise<void> {
  const selector = mode === 'before' ? '.wind-debug label:has-text("Zichtbaar") input[type=range]' : 'input[type=number][aria-label="Intensiteit"]'
  await page.locator(selector).evaluate((element) => {
    const input = element as unknown as { value: string; dispatchEvent: (event: Event) => boolean }
    input.value = '0'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function analyse(page: Page, base: Buffer, shots: Buffer[]) {
  return page.evaluate(`(async () => {
    const decode = async (b64) => {
      const image = new Image()
      image.src = 'data:image/png;base64,' + b64
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')
      context.drawImage(image, 0, 0)
      return context.getImageData(0, 0, image.width, image.height).data
    }
    const base = await decode(${JSON.stringify(base.toString('base64'))})
    const shots = await Promise.all(${JSON.stringify(shots.map((shot) => shot.toString('base64')))}.map(decode))
    // Referentiekleuren = meest voorkomende blauwige (zee) en niet-blauwige (land) kleur in het basisbeeld.
    const counts = new Map()
    for (let i = 0; i < base.length; i += 4) {
      const key = (base[i] >> 2) << 16 | (base[i + 1] >> 2) << 8 | (base[i + 2] >> 2)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const decodeKey = (key) => [(key >> 16 & 255) << 2, (key >> 8 & 255) << 2, (key & 255) << 2]
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => decodeKey(key))
    const isBlue = ([r, g, b]) => b > r + 25 && b > g
    const sea = ranked.find(isBlue)
    const land = ranked.find((color) => !isBlue(color))
    const near = (i, color) => Math.abs(base[i] - color[0]) + Math.abs(base[i + 1] - color[1]) + Math.abs(base[i + 2] - color[2]) < 24
    const result = { sea: { pixels: 0, ink: 0 }, land: { pixels: 0, ink: 0 }, seaColor: sea, landColor: land }
    for (let i = 0; i < base.length; i += 4) {
      const bucket = near(i, sea) ? result.sea : near(i, land) ? result.land : null
      if (!bucket) continue
      bucket.pixels++
      for (const shot of shots) bucket.ink += (Math.abs(shot[i] - base[i]) + Math.abs(shot[i + 1] - base[i + 1]) + Math.abs(shot[i + 2] - base[i + 2])) / shots.length
    }
    return {
      seaInk: +(result.sea.ink / Math.max(1, result.sea.pixels)).toFixed(3),
      landInk: +(result.land.ink / Math.max(1, result.land.pixels)).toFixed(3),
      seaPixels: result.sea.pixels,
      landPixels: result.land.pixels,
      seaColor: sea,
      landColor: land,
    }
  })()`)
}
