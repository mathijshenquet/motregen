import { firefox } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// U110: de eerste seconden van een koude /wind-lading, voor en na naast elkaar (telefoonformaat), met een klok
// sinds navigatie. Firefox draait zichtbaar in Xvfb (llvmpipe, ~50 fps); de clip bestaat uit schermafdrukken met hun
// echte tijdstempel. Playwrights eigen video (VP8, lage bitrate) veegde de dunne deeltjes weg; x11grab ontbreekt in
// de ffmpeg van de devshell.
// usage: xvfb-run -a pnpm exec tsx scripts/wind-start-clip.ts UIT.mp4 LABEL=URL [LABEL=URL] [SECONDEN]
//   URL inclusief pad, bv. http://127.0.0.1:4312/wind. CLIP_THICK (standaard 3): lijnbreedte-factor, alleen in de clip.
const [output, ...rest] = process.argv.slice(2)
const seconds = Number(rest.find((arg) => /^\d+(\.\d+)?$/.test(arg)) ?? 9)
const sides = rest.filter((arg) => arg.includes('=') && /^\w+=/.test(arg)).map((arg) => ({ label: arg.slice(0, arg.indexOf('=')), url: arg.slice(arg.indexOf('=') + 1) }))
if (!output || sides.length === 0 || !process.env.DISPLAY) throw new Error("usage: xvfb-run -a pnpm exec tsx scripts/wind-start-clip.ts UIT.mp4 LABEL=URL [LABEL=URL] [SECONDEN]")
const viewport = { width: 402, height: 844 }
const rawDir = `${output}.raw`
rmSync(rawDir, { recursive: true, force: true })
mkdirSync(rawDir, { recursive: true })
const mesa = process.env.MOTREGEN_FIREFOX_MESA
const browser = await firefox.launch({
  headless: false,
  firefoxUserPrefs: { 'webgl.force-enabled': true, 'gfx.webrender.software': true },
  env: { ...process.env, LIBGL_ALWAYS_SOFTWARE: '1', ...mesa ? { LIBGL_DRIVERS_PATH: `${mesa}/lib/dri`, __EGL_VENDOR_LIBRARY_FILENAMES: `${mesa}/share/glvnd/egl_vendor.d/50_mesa.json`, LD_LIBRARY_PATH: `${mesa}/lib:${process.env.MOTREGEN_FIREFOX_GL}/lib` } : {} } as Record<string, string>,
})
const clips: string[] = []
for (const [index, side] of sides.entries()) {
  const context = await browser.newContext({ viewport, hasTouch: true, timezoneId: 'Europe/Amsterdam' })
  await context.addInitScript({ content: `(() => {
    const clock = document.createElement('div')
    clock.style.cssText = 'position:fixed;left:50%;top:64px;transform:translateX(-50%);z-index:99999;font:600 15px/1.2 system-ui;color:#fff;background:#000b;padding:3px 8px;border-radius:6px;pointer-events:none'
    const tick = () => { clock.textContent = ${JSON.stringify(side.label)} + ' · ' + (performance.now() / 1000).toFixed(1) + ' s'; requestAnimationFrame(tick) }
    addEventListener('DOMContentLoaded', () => { document.body.append(clock); tick() })
    // Alleen voor de clip, in voor én na gelijk: dikkere, fellere deeltjes (bij 1–2 Bft en in een schermafdruk van
    // llvmpipe vallen de dunne windmodus-lijnen anders weg). De opbouw en het moment blijven onveranderd.
    const thick = ${Number(process.env.CLIP_THICK ?? 3)}
    const patch = () => {
      const wind = globalThis.__motregenWind
      if (!wind) return requestAnimationFrame(patch)
      const setTuning = wind.setTuning.bind(wind)
      const boost = (tuning) => ({ ...tuning, lineWidth: tuning.lineWidth * thick, headIntensity: tuning.headIntensity * 2 })
      wind.setTuning = (tuning) => setTuning(boost({ ...wind.tuning, ...tuning }))
      wind.tuning = boost(wind.tuning)
    }
    requestAnimationFrame(patch)
    // Het dev-paneel dicht (windfactor zet het open).
    new MutationObserver(() => document.querySelectorAll('details').forEach((element) => { if (element.querySelector(':scope > summary')?.textContent?.includes('Dev-opties')) element.open = false })).observe(document, { subtree: true, childList: true })
  })()` })
  const page = await context.newPage()
  const dir = join(rawDir, String(index))
  mkdirSync(dir, { recursive: true })
  const started = Date.now()
  void page.goto(side.url).catch(() => {})
  const frames: Array<{ file: string; at: number }> = []
  while (Date.now() - started < seconds * 1_000) {
    const file = join(dir, `${String(frames.length).padStart(5, '0')}.png`)
    await page.screenshot({ path: file }).catch(() => {})
    frames.push({ file, at: Date.now() - started })
  }
  const list = frames.map((frame, frameIndex) => `file '${frame.file.split('/').pop()}'\nduration ${(((frames[frameIndex + 1]?.at ?? seconds * 1_000) - frame.at) / 1_000).toFixed(3)}`).join('\n')
  writeFileSync(join(dir, 'list.txt'), `${list}\nfile '${frames.at(-1)!.file.split('/').pop()}'\n`)
  const clip = join(rawDir, `${index}.mp4`)
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-i', join(dir, 'list.txt'), '-vf', 'fps=30', '-c:v', 'libx264', '-qp', '0', '-preset', 'ultrafast', clip])
  console.log(`${side.label}: ${frames.length} beelden in ${seconds} s`)
  await context.close()
  clips.push(clip)
}
await browser.close()
const inputs = clips.flatMap((clip) => ['-i', clip])
const filter = clips.length > 1
  ? `${clips.map((_, index) => `[${index}:v]trim=0:${seconds},setpts=PTS-STARTPTS[v${index}]`).join(';')};${clips.map((_, index) => `[v${index}]`).join('')}hstack=inputs=${clips.length}[out]`
  : `[0:v]trim=0:${seconds},setpts=PTS-STARTPTS[out]`
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '[out]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', '-preset', 'slow', '-movflags', '+faststart', output])
rmSync(rawDir, { recursive: true, force: true })
console.log(output)
