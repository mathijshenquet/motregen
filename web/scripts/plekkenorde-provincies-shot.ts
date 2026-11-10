import { chromium, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Provincietrede (U114, `?dev&plekken=provincies&namen=samen`): stills op het overzicht, halverwege de tween en in de
// stedentrede, telefoon en desktop, Gevoel/Wind/Weer; plus per profiel en modus een clip (H.264, ≤ 12 s) van één
// keer langzaam in- en uitzoomen over de overgang. De clip is frame voor frame opgebouwd (zoomstap, twee
// animatieframes, still): headless tekent de kaart in software zo traag dat een realtime opname vooral dat toont.
// usage: pnpm exec tsx scripts/plekkenorde-provincies-shot.ts ORIGIN OUT_DIR   (SHOT_CLIPS=0: zonder clips)
const [origin, outDir] = process.argv.slice(2)
if (!origin || !outDir) throw new Error('usage: pnpm exec tsx scripts/plekkenorde-provincies-shot.ts ORIGIN OUT_DIR')
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
const videoDir = join(outDir, 'video-ruw')

const TIME = '2026-11-10T11:00:00.000Z'
const QUERY = 'dev&plekken=provincies&namen=samen'
const profiles = {
  telefoon: { viewport: { width: 402, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
}
// Zoomstappen boven het overzicht: provincies, halverwege de tween, net voor en in de stedentrede.
const STEPS = [0, 0.75, 1, 1.25, 1.5, 2.5]
const CENTRE = { lng: 5.3, lat: 52.2 }

const counts: Record<string, unknown> = {}
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
for (const [profileName, profile] of Object.entries(profiles)) {
  for (const mode of ['gevoel', 'wind', 'weer'] as const) {
    const clip = process.env.SHOT_CLIPS !== '0' && mode !== 'weer'
    const context = await browser.newContext({
      ...profile, colorScheme: 'light', locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', serviceWorkers: 'block',
    })
    const page = await context.newPage()
    page.setDefaultTimeout(120_000)
    page.on('pageerror', (error) => console.log('pageerror', mode, profileName, error.message.slice(0, 200)))
    await page.goto(new URL(`/${mode}/utrecht?t=${encodeURIComponent(TIME)}&${QUERY}`, origin).href)
    await settle(page)
    await jump(page, CENTRE.lng, CENTRE.lat, 0, 3_500)
    const overview = await page.evaluate(() => (window as unknown as { __motregenCamera: () => { zoom: number } }).__motregenCamera().zoom)
    for (const step of STEPS) {
      await jump(page, CENTRE.lng, CENTRE.lat, overview + step, 3_000)
      const name = `${mode}-${profileName}-z${step}`
      await page.locator('.map-shell').screenshot({ path: join(outDir, `${name}.png`) })
      counts[name] = await page.evaluate(() => ({
        numbers: Array.from(document.querySelectorAll('.temperature-number-name'), (element) => element.textContent),
        socks: document.querySelector<HTMLElement>('.map-overlay-windsocks')?.dataset.placed,
      }))
      console.log('shot', name, JSON.stringify(counts[name]))
    }
    if (clip) {
      // Eén keer langzaam in en uit bij 20 fps: 0 → 2,5 stappen in 5 s, 1 s stil, terug in 5 s.
      rmSync(videoDir, { recursive: true, force: true })
      mkdirSync(videoDir, { recursive: true })
      const FPS = 20
      const zooms = [
        ...Array.from({ length: 5 * FPS }, (_, frame) => 2.5 * frame / (5 * FPS)),
        ...Array<number>(FPS).fill(2.5),
        ...Array.from({ length: 5 * FPS }, (_, frame) => 2.5 * (1 - frame / (5 * FPS))),
      ]
      const shell = page.locator('.map-shell')
      const perFrame: Array<{ step: number; places: number }> = []
      for (const [frame, step] of zooms.entries()) {
        await page.evaluate(([lng, lat, zoom]) => (window as unknown as { __motregenJumpTo: (lng: number, lat: number, zoom: number) => void }).__motregenJumpTo(lng!, lat!, zoom!),
          [CENTRE.lng, CENTRE.lat, overview + step])
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        await page.waitForTimeout(60)
        await shell.screenshot({ path: join(videoDir, `${String(frame).padStart(4, '0')}.png`) })
        // Zichtbare plekken in dit frame (getallen die niet uitfaden, of de geplaatste zakken), voor de dichtheidscheck.
        perFrame.push({ step: Math.round(step * 100) / 100, places: await page.evaluate((wind) => wind
          ? (document.querySelector<HTMLElement>('.map-overlay-windsocks')?.dataset.placed ?? '').split('|').filter(Boolean).length
          : Array.from(document.querySelectorAll<HTMLElement>('.temperature-number')).filter((element) => element.style.opacity !== '0').length, mode === 'wind') })
      }
      counts[`clip-${mode}-${profileName}`] = perFrame
      await context.close()
      const target = join(outDir, `clip-${mode}-${profileName}.mp4`)
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(videoDir, '%04d.png'),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '30', '-preset', 'slow', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-an', `${target}.tmp.mp4`])
      renameSync(`${target}.tmp.mp4`, target)
      console.log('clip', target, `${Math.round(statSync(target).size / 1024)} kB`)
    } else {
      await context.close()
    }
  }
}
await browser.close()
rmSync(videoDir, { recursive: true, force: true })
writeFileSync(join(outDir, 'counts.json'), `${JSON.stringify({ query: QUERY, time: TIME, counts }, null, 1)}\n`)
console.log('bestanden', readdirSync(outDir).length)

async function jump(page: Page, lng: number, lat: number, zoom: number, wait: number): Promise<void> {
  await page.evaluate(([lng, lat, zoom]) => (window as unknown as { __motregenJumpTo: (lng: number, lat: number, zoom: number) => void }).__motregenJumpTo(lng!, lat!, zoom!), [lng, lat, zoom])
  await page.waitForTimeout(wait)
  await page.mouse.move(5, 5)
}

async function settle(page: Page): Promise<void> {
  await page.locator('.map-splash.ready').waitFor({ state: 'attached' })
  await page.addStyleTag({ content: '.dev-panel { display: none !important; }' })
  await page.locator('.scrubber-placeholder').waitFor({ state: 'detached' })
  const close = page.locator('.freshness-close')
  if (await close.isVisible().catch(() => false)) await close.click()
  await page.mouse.move(5, 5)
}
