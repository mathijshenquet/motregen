import { chromium } from '@playwright/test'

// Telt DOM-mutaties per paginadeel terwijl de app zelf afspeelt (track U58): tijdens afspelen horen
// alleen de klok en de cursor te bewegen; herbouwde tabelrijen of hemel-SVG vallen hier meteen op.
// Gebruik: pnpm exec tsx scripts/dom-churn.ts ORIGIN [seconden] [desktop|mobile]
const [origin, secondsArgument = '15', layout = 'mobile'] = process.argv.slice(2)
if (!origin) throw new Error('usage: pnpm exec tsx scripts/dom-churn.ts ORIGIN [seconden] [desktop|mobile]')
const seconds = Number(secondsArgument)
const viewport = layout === 'desktop' ? { width: 1280, height: 800 } : { width: 390, height: 844 }
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const context = await browser.newContext({ viewport, hasTouch: layout !== 'desktop', isMobile: layout !== 'desktop' })
const page = await context.newPage()
page.setDefaultTimeout(150_000)
// tsx (esbuild keepNames) wikkelt benoemde functies in __name(); die helper bestaat niet in de pagina.
await page.addInitScript('globalThis.__name = (value) => value')
await page.goto(new URL('/', origin).href)
await page.locator('.map-splash.ready').waitFor({ state: 'attached' })
await page.locator('.scrubber-placeholder').waitFor({ state: 'detached' })
await page.locator('[data-testid=sky] rect').first().waitFor({ state: 'attached' })

async function measure(label: string): Promise<void> {
  const counts = await page.evaluate(async (durationMs) => {
    const regions: Array<[string, string]> = [
      ['tabel', '.forecast-table'],
      ['scrubber-hemel', '.chart-track svg .sky, .chart-track svg defs'],
      ['scrubber-wolken', '.cloud-section'],
      ['scrubber-regen', '.rain-bars'],
      ['scrubber-overig', '.scrubber'],
      ['klok', '.freshness, .clock-pill'],
    ]
    const totals: Record<string, { attributes: number; nodes: number; text: number }> = {}
    const kinds = new Map<string, number>()
    const describe = (node: Node | null) => node instanceof Element ? `${node.tagName.toLowerCase()}${node.getAttribute("class") ? `.${node.getAttribute("class")!.split(" ")[0]}` : ""}` : "#text"
    const count = (kind: string) => kinds.set(kind, (kinds.get(kind) ?? 0) + 1)
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const element = record.target instanceof Element ? record.target : record.target.parentElement
        const region = regions.find(([, selector]) => element?.closest(selector))?.[0] ?? 'rest'
        const total = totals[region] ??= { attributes: 0, nodes: 0, text: 0 }
        if (record.type === 'attributes') { total.attributes++; count(`${region}: ${describe(element)} @${record.attributeName}`) }
        else if (record.type === 'childList') {
          total.nodes += record.addedNodes.length + record.removedNodes.length
          for (const node of [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)]) count(`${region}: ${describe(element)} > ${describe(node)}`)
        } else { total.text++; count(`${region}: ${describe(element)} tekst`) }
      }
    })
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
    await new Promise((resolve) => setTimeout(resolve, durationMs))
    observer.disconnect()
    return { totals, top: [...kinds].sort((left, right) => right[1] - left[1]).slice(0, 14) }
  }, seconds * 1_000)
  console.log(`${label} (${layout}, ${seconds} s)`)
  console.table(counts.totals)
  for (const [kind, total] of counts.top) console.log(String(total).padStart(7), kind)
}

await measure('eerste seconden na de start (reeksen komen nog binnen)')
await measure('doorlopend afspelen')
await browser.close()
