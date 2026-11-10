import { firefox } from '@playwright/test'

// U111 ronde 4 (naast dom-churn.ts van U58, dat per paginadeel in Chromium telt): wat verandert er tijdens afspelen
// per frame in de DOM? Telt in Firefox (telefoonbeeld, DPR 3) over een venster van --seconds alle mutaties per element en soort (attribuut met naam, tekst, kinderen), naast het aantal
// rAF-frames, en drukt de lopende animaties en overgangen uit `document.getAnimations()` af (elk paar seconden
// bemonsterd, want overgangen zijn kort). Tekst- en attribuutmutaties tellen alleen als de waarde echt anders werd.
//
// usage: xvfb-run -a pnpm exec tsx scripts/wind-dom-churn.ts ORIGIN [--query=a=b&c=d] [--seconds=10] [--warm=6] [--paused]

const args = process.argv.slice(2)
const origin = args.find((arg) => !arg.startsWith('--'))
if (!origin) throw new Error('usage: pnpm exec tsx scripts/wind-dom-churn.ts ORIGIN [--query=…] [--seconds=…] [--warm=…] [--paused]')
const option = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const seconds = Number(option('seconds') ?? 10)
const warm = Number(option('warm') ?? 6)
const paused = args.includes('--paused')

// In de pagina, als tekst (tsx voegt anders `__name(…)` in).
const observer = `(() => {
  const counts = new Map()
  const label = (node) => {
    const element = node.nodeType === 1 ? node : node.parentElement
    if (!element) return '?'
    const parts = []
    for (let current = element; current && parts.length < 3 && current !== document.body; current = current.parentElement) {
      const classes = [...current.classList].slice(0, 2).join('.')
      parts.unshift(current.tagName.toLowerCase() + (classes ? '.' + classes : ''))
    }
    return parts.join(' > ')
  }
  let frames = 0
  const tick = () => { frames++; requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
  const animations = new Map()
  const sample = () => {
    for (const animation of document.getAnimations()) {
      if (animation.playState !== 'running') continue
      const effect = animation.effect
      const properties = effect && effect.getKeyframes ? [...new Set(effect.getKeyframes().flatMap((frame) => Object.keys(frame).filter((key) => !['offset', 'easing', 'composite', 'computedOffset'].includes(key))))].join(',') : '?'
      const name = (animation.animationName ?? animation.transitionProperty ?? animation.constructor.name) + ' [' + properties + '] op ' + label(effect?.target)
      animations.set(name, (animations.get(name) ?? 0) + 1)
    }
  }
  const sampler = setInterval(sample, 250)
  new MutationObserver((records) => {
    for (const record of records) {
      let kind
      if (record.type === 'attributes') {
        const now = record.target.getAttribute(record.attributeName)
        if (now === record.oldValue) continue
        kind = 'attr ' + record.attributeName
      } else if (record.type === 'characterData') {
        if (record.target.data === record.oldValue) continue
        kind = 'tekst'
      } else {
        const named = (nodes) => [...nodes].map((node) => node.nodeType === 1 ? node.tagName.toLowerCase() + (node.classList[0] ? '.' + node.classList[0] : '') : '#' + node.nodeName.replace('#', '')).join(',')
        kind = 'kinderen +' + named(record.addedNodes) + ' -' + named(record.removedNodes)
      }
      const key = label(record.target) + ' | ' + kind
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }).observe(document.documentElement, { subtree: true, attributes: true, attributeOldValue: true, characterData: true, characterDataOldValue: true, childList: true })
  window.__domChurn = () => { clearInterval(sampler); sample(); return { frames, counts: [...counts], animations: [...animations] } }
})()`

const browser = await firefox.launch({
  headless: !process.env.DISPLAY,
  firefoxUserPrefs: { 'webgl.force-enabled': true, 'gfx.webrender.software': true },
  env: {
    ...process.env,
    LIBGL_ALWAYS_SOFTWARE: '1',
    ...process.env.MOTREGEN_FIREFOX_MESA ? {
      LIBGL_DRIVERS_PATH: `${process.env.MOTREGEN_FIREFOX_MESA}/lib/dri`,
      __EGL_VENDOR_LIBRARY_FILENAMES: `${process.env.MOTREGEN_FIREFOX_MESA}/share/glvnd/egl_vendor.d/50_mesa.json`,
      LD_LIBRARY_PATH: `${process.env.MOTREGEN_FIREFOX_MESA}/lib:${process.env.MOTREGEN_FIREFOX_GL}/lib`,
    } : {},
  } as Record<string, string>,
})
const context = await browser.newContext({ viewport: { width: 402, height: 844 }, deviceScaleFactor: 3, hasTouch: true, timezoneId: 'Europe/Amsterdam' })
const page = await context.newPage()
await page.goto(new URL(`/wind?dev${option('query') ? `&${option('query')}` : ''}`, origin).href)
await page.locator('details.dev-panel').evaluate((panel) => panel.removeAttribute('open')).catch(() => {})
await page.locator('[data-playing]').waitFor({ state: 'attached', timeout: 120_000 })
if (paused) {
  await page.locator('.freshness-trigger').press(' ')
  await page.locator('.clock-play').waitFor({ state: 'visible' })
}
await page.waitForTimeout(warm * 1_000)
await page.evaluate(observer)
await page.waitForTimeout(seconds * 1_000)
const result = await page.evaluate('window.__domChurn()') as { frames: number; counts: Array<[string, number]>; animations: Array<[string, number]> }
await browser.close()

console.log(`${paused ? 'stil' : 'spelend'}, ${seconds} s, ${result.frames} rAF-frames (${(result.frames / seconds).toFixed(1)}/s)`)
console.log('\nMutaties per s (element | soort), alleen echte wijzigingen:')
for (const [key, count] of result.counts.sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`  ${(count / seconds).toFixed(1).padStart(6)}/s  ${key}`)
console.log('\nLopende animaties en overgangen (aantal bemonsteringen van 4 per s):')
for (const [name, count] of result.animations.sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${String(count).padStart(4)}×  ${name}`)
