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
}

export async function captureComparison(options: ComparisonCapture): Promise<{ start: number }> {
  const browser = await chromium.launch({ args: rainCaptureBrowserArguments })
  try {
    const context = await browser.newContext({ ...rainCaptureContext, ...(options.duration ? { recordVideo: { dir: options.output, size: rainCaptureContext.viewport } } : {}) })
    const page = await context.newPage()
    const started = Date.now()
    await page.clock.setFixedTime(new Date(options.now))
    const url = new URL(options.path, options.origin)
    url.searchParams.set('t', options.time)
    url.hash = ''
    await positionRainPage(page, url.href, options.camera)
    const camera = await page.evaluate(() => (window as unknown as { __motregenCamera: () => { lng: number; lat: number; zoom: number } }).__motregenCamera())
    if (Math.abs(camera.lng - options.camera.longitude) > 0.0001 || Math.abs(camera.lat - options.camera.latitude) > 0.0001 || Math.abs(camera.zoom - options.camera.zoom) > 0.001) throw new Error('Camera komt niet overeen met gevraagde positie')
    const start = (Date.now() - started) / 1000
    if (options.duration) {
      await page.waitForTimeout(options.duration * 1000 + 500)
      const video = page.video()!
      await context.close()
      await video.saveAs(`${options.output}/capture.webm`)
    } else {
      await page.screenshot({ path: `${options.output}/capture.png` })
      await context.close()
    }
    return { start }
  } finally {
    await browser.close()
  }
}
