// U62 stap 3-rig: schermbeelden van het contextgevoelige chrome (liniaal, koppenrij, klokpil) en het
// gemeten contrast van elk label tegen wat er werkelijk achter staat.
// Gebruik: pnpm exec tsx tmp/u62/chrome.ts <baseURL> <label>
import { chromium, devices, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const [baseURL = 'http://127.0.0.1:4320', label = 'stap3'] = process.argv.slice(2)
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })

const LABEL_GROUPS: Record<string, string> = {
  uurlabel: '.x-axis span:not(.now-tick)',
  daglabel: '.day-labels span',
  koppenrij: '.forecast-table thead .column-mode',
  klokpil: '.map-clock .clock-map-time',
}

function luminance([red, green, blue]: number[]): number {
  const linear = [red, green, blue].map((channel) => {
    const share = channel! / 255
    return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
}
const contrast = (first: number, second: number) => (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)

interface LabelBox { group: string; text: string; ink: number[]; x: number; y: number; width: number; height: number }

async function measure(page: Page, name: string): Promise<Record<string, { labels: number; worst: number; worstText: string }>> {
  await page.screenshot({ path: `${outputDir}${label}-${name}.png` })
  const boxes = await page.evaluate((groups) => {
    const found: LabelBox[] = []
    // Labels op de baan die buiten de scrubber vallen zijn afgekapt en dus niet te zien.
    const surface = document.querySelector('.scrub-surface')!.getBoundingClientRect()
    for (const [group, selector] of Object.entries(groups)) {
      for (const element of document.querySelectorAll<HTMLElement>(selector)) {
        const bounds = element.getBoundingClientRect()
        const text = element.textContent?.trim() ?? ''
        if (!text || bounds.width < 2 || bounds.right < 2 || bounds.left > innerWidth - 2 || bounds.bottom < 0 || bounds.top > innerHeight) continue
        if (element.closest('.scrub-surface') && (bounds.right < surface.left + 12 || bounds.left > surface.right - 12)) continue
        const ink = getComputedStyle(element).color.match(/[\d.]+/g)!.slice(0, 3).map(Number)
        const inScrubber = Boolean(element.closest('.scrub-surface'))
        const left = inScrubber ? Math.max(bounds.left, surface.left) : bounds.left
        const right = inScrubber ? Math.min(bounds.right, surface.right) : bounds.right
        found.push({ group, text, ink, x: left, y: bounds.top, width: right - left, height: bounds.height })
      }
    }
    return found
  }, LABEL_GROUPS)
  // Dezelfde pagina zonder inkt: wat overblijft is de ondergrond achter elk label.
  const hide = await page.addStyleTag({ content: `${Object.values(LABEL_GROUPS).join(', ')} { color: transparent !important; } ${LABEL_GROUPS.koppenrij} svg { visibility: hidden; }` })
  const { data, info } = await sharp(await page.screenshot()).raw().toBuffer({ resolveWithObject: true })
  await hide.evaluate((element) => element.remove())
  const scale = info.width / page.viewportSize()!.width
  const result: Record<string, { labels: number; worst: number; worstText: string }> = {}
  for (const box of boxes) {
    const inkLuminance = luminance(box.ink)
    let worst = Infinity
    const left = Math.max(0, Math.floor(box.x * scale)), right = Math.min(info.width - 1, Math.ceil((box.x + box.width) * scale))
    const top = Math.max(0, Math.floor(box.y * scale)), bottom = Math.min(info.height - 1, Math.ceil((box.y + box.height) * scale))
    for (let y = top; y <= bottom; y += 2) for (let x = left; x <= right; x += 2) {
      const index = (y * info.width + x) * info.channels
      worst = Math.min(worst, contrast(inkLuminance, luminance([data[index]!, data[index + 1]!, data[index + 2]!])))
    }
    const entry = result[box.group] ?? { labels: 0, worst: Infinity, worstText: '' }
    entry.labels++
    if (worst < entry.worst) { entry.worst = Math.round(worst * 100) / 100; entry.worstText = box.text }
    result[box.group] = entry
  }
  return result
}

const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const report: Record<string, unknown> = {}
const scenes = [
  { time: 'dag', query: 't=%2B5u' },
  { time: 'schemer', query: 't=%2B0u' },
  { time: 'nacht', query: 't=%2B15u' },
]
for (const device of ['390', 'desktop'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const clock of ['wit', 'mee-tinten'] as const) {
      // De klokvariant alleen in het lichte thema dubbel vastleggen; donker met de variant aan.
      if (theme === 'dark' && clock === 'wit') continue
      const context = await browser.newContext(device === '390' ? { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } : { viewport: { width: 1280, height: 800 } })
      await context.addInitScript(([themeChoice, clockChoice]) => {
        localStorage.setItem('motregen-theme', themeChoice!)
        localStorage.setItem('motregen-dev-klokpil', clockChoice!)
      }, [theme, clock])
      const page = await context.newPage()
      for (const scene of scenes) {
        await page.goto(`${baseURL}/?dev&${scene.query}`)
        await page.getByTestId('sky').waitFor({ state: 'attached', timeout: 60_000 })
        await page.waitForTimeout(7_000)
        const slider = page.getByRole('slider', { name: 'Tijd' })
        if (await slider.getAttribute('data-playing') !== null) await slider.press(' ')
        await page.evaluate(() => document.querySelector('.dev-panel')?.removeAttribute('open'))
        await page.waitForTimeout(500)
        const name = `${device}-${theme}-${clock}-${scene.time}`
        report[name] = await measure(page, name)
        console.log(name, JSON.stringify(report[name]))
      }
      await context.close()
    }
  }
}
await browser.close()
writeFileSync(`${outputDir}${label}-contrast.json`, JSON.stringify(report, null, 1))
