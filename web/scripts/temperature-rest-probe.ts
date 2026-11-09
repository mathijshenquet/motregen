import { chromium } from '@playwright/test'

// U100 ronde 3: doen de temperatuurgetallen in Gevoel in rust nog werk? Telt over een stil venster de
// isolijn-passes, blits, repaints, DOM-wijzigingen aan de getallen en animatieframes, na laden en na een pan.
// Gebruik: pnpm exec tsx scripts/temperature-rest-probe.ts ORIGIN; exit 0 = stil.
const [origin] = process.argv.slice(2)
if (!origin) throw new Error('usage: pnpm exec tsx scripts/temperature-rest-probe.ts ORIGIN')
type Counters = { passes: number; fillPasses: number; composites?: number; repaints: number; labelRounds: number }
const browser = await chromium.launch()
let failed = false
{
  const look = 'gevoel'
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.addInitScript(() => {
    const state = window as unknown as { __restFrames: number; __restMutations: number }
    state.__restFrames = 0
    state.__restMutations = 0
    const tick = () => { state.__restFrames++; requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
    new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target instanceof Element ? record.target : record.target.parentElement
        if (target?.closest('.temperature-number') || [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some((node) => node instanceof Element && node.classList.contains('temperature-number'))) state.__restMutations++
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true })
  })
  await page.goto(`${origin}/gevoel`)
  await page.locator('.map-splash.ready').waitFor({ state: 'attached' })
  await page.waitForSelector('.temperature-number, .isoline-label', { timeout: 30_000 })
  // Bij openen speelt de tijdlijn af (intro); rust = gepauzeerd, zoals e2e/playback.ts pausePlayback.
  const slider = page.getByRole('slider', { name: 'Tijd' })
  if (await slider.getAttribute('data-playing') !== null) await slider.press(' ')
  console.log(`${look}: afspelen ${await slider.getAttribute('data-playing') !== null ? 'loopt nog' : 'gepauzeerd'}`)
  const measure = async (label: string) => {
    await page.waitForTimeout(4_000)
    const read = () => page.evaluate(() => {
      const state = window as unknown as { __motregenIsolines: () => Counters; __restFrames: number; __restMutations: number }
      return { ...state.__motregenIsolines(), frames: state.__restFrames, mutations: state.__restMutations }
    })
    const before = await read()
    await page.waitForTimeout(5_000)
    const after = await read()
    const delta = {
      passes: after.passes - before.passes, fillPasses: after.fillPasses - before.fillPasses,
      repaints: after.repaints - before.repaints, labelRounds: after.labelRounds - before.labelRounds, numberMutations: after.mutations - before.mutations,
      numbers: await page.locator('.temperature-number').count(),
    }
    const quiet = delta.passes === 0 && delta.fillPasses === 0 && delta.repaints === 0 && delta.numberMutations === 0
    if (!quiet) failed = true
    console.log(`${look} ${label}: ${JSON.stringify(delta)} → ${quiet ? 'stil' : 'NIET STIL'}`)
  }
  await measure('na laden')
  await page.mouse.move(720, 450)
  await page.mouse.down()
  await page.mouse.move(600, 380, { steps: 10 })
  await page.mouse.up()
  await measure('na pan')
  await page.close()
}
await browser.close()
process.exit(failed ? 1 : 0)
