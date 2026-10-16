import { chromium } from '@playwright/test'
import { positionRainPage, rainCaptureBrowserArguments, rainCaptureContext } from './rain-capture'

export interface ComparisonCapture {
  origin: string
  path: string
  time: string
  now: string
  camera: { longitude: number; latitude: number; zoom: number }
  output: string
  duration: number
  selector?: string
  play?: boolean
}

export async function captureComparison(options: ComparisonCapture): Promise<{ start: number; camera: { longitude: number; latitude: number; zoom: number }; region?: { x: number; y: number; width: number; height: number } }> {
  const browser = await chromium.launch({ args: rainCaptureBrowserArguments })
  try {
    const context = await browser.newContext({ ...rainCaptureContext, deviceScaleFactor: options.duration ? 1 : 2, ...(options.duration ? { recordVideo: { dir: options.output, size: rainCaptureContext.viewport } } : {}) })
    const page = await context.newPage()
    const started = Date.now()
    await page.clock.setFixedTime(new Date(options.now))
    const url = new URL(options.path, options.origin)
    url.searchParams.set('t', options.time)
    url.hash = ''
    await positionRainPage(page, url.href, options.camera)
    const region = options.selector ? await page.locator(options.selector).boundingBox() : undefined
    if (options.selector && !region) throw new Error(`Opnamegebied ontbreekt: ${options.selector}`)
    if (options.play) {
      const surface = page.locator('.scrub-surface')
      if (await surface.getAttribute('data-playing') === null) await surface.press(' ')
      await surface.blur()
      await page.mouse.move(5, 5)
    }
    const camera = await page.evaluate(() => (window as unknown as { __motregenCamera: () => { lng: number; lat: number; zoom: number } }).__motregenCamera())
    const start = (Date.now() - started) / 1000
    if (options.duration) {
      await page.waitForTimeout(options.duration * 1000 + 500)
      const video = page.video()!
      await context.close()
      await video.saveAs(`${options.output}/capture.webm`)
    } else {
      if (options.selector) await page.locator(options.selector).screenshot({ path: `${options.output}/capture.png` })
      else await page.screenshot({ path: `${options.output}/capture.png` })
      await context.close()
    }
    return { start, camera: { longitude: camera.lng, latitude: camera.lat, zoom: camera.zoom }, region: region ?? undefined }
  } finally {
    await browser.close()
  }
}
