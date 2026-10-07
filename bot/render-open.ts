import type { Page } from 'playwright'
import { installRenderFetch } from './render-fetch.js'
import { presetUrl, type LoopMode, type StillManifest } from './stills.js'

const OPEN_TIMEOUT_MS = 90_000
const OPEN_BACKOFF_MS = 5_000

export async function openRenderPage(page: Page, origin: string, mode: LoopMode, manifest: StillManifest, epoch: number): Promise<number> {
  // Playwright-routing schakelt de HTTP-cache uit; de fetch-wrapper behoudt tiles/chunks.
  await page.addInitScript(installRenderFetch, manifest)
  const started = performance.now()
  for (let attempt = 1; attempt <= 2; attempt++) {
    const attemptStarted = performance.now()
    const remaining = () => Math.max(1, Math.round(OPEN_TIMEOUT_MS - (performance.now() - attemptStarted)))
    let stage = 'navigation'
    try {
      await page.goto(presetUrl(origin, mode, epoch, true), { waitUntil: 'domcontentloaded', timeout: remaining() })
      stage = 'still-ready'
      await page.waitForFunction(() => {
        const map = document.querySelector<HTMLElement>('.map')
        return map?.dataset.stillReady === 'true' || Boolean(map?.dataset.stillError)
      }, undefined, { timeout: remaining() })
      stage = 'map-loaded'
      await page.waitForFunction(() => (window as unknown as { __motregenStillMapLoaded?: () => boolean }).__motregenStillMapLoaded?.(), undefined, { timeout: remaining() })
      const openMs = Math.round(performance.now() - started)
      console.info(JSON.stringify({ event: 'sequence-open', mode, generated: manifest.generated, attempt, attemptMs: Math.round(performance.now() - attemptStarted), openMs, timeoutMs: OPEN_TIMEOUT_MS }))
      return openMs
    } catch (error) {
      console.info(JSON.stringify({ event: 'sequence-open-failed', mode, generated: manifest.generated, stage, attempt, attemptMs: Math.round(performance.now() - attemptStarted), openMs: Math.round(performance.now() - started), timeoutMs: OPEN_TIMEOUT_MS, reason: error instanceof Error && error.name === 'TimeoutError' ? 'TimeoutError' : 'open-error' }))
      if (attempt === 2) throw error
      console.info(JSON.stringify({ event: 'sequence-open-retry', mode, generated: manifest.generated, attempt: 2, backoffMs: OPEN_BACKOFF_MS }))
      await new Promise((resolve) => setTimeout(resolve, OPEN_BACKOFF_MS))
    }
  }
  throw new Error('Renderpagina openen mislukt')
}
