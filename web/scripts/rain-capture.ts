import type { Page } from '@playwright/test'

export const rainCaptureBrowserArguments = ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader']
export const rainCaptureContext = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: 'light' as const, timezoneId: 'Europe/Amsterdam' }

export async function positionRainPage(page: Page, url: string, camera?: { longitude: number; latitude: number; zoom: number }): Promise<void> {
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(5000)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  if (camera) {
    await page.waitForFunction(() => Boolean((window as unknown as { __motregenCamera?: () => object }).__motregenCamera?.()))
    await page.evaluate((position) => {
      const jump = (window as unknown as { __motregenJumpTo: (longitude: number, latitude: number, zoom: number) => void }).__motregenJumpTo
      jump(position.longitude, position.latitude, position.zoom)
    }, camera)
    await page.waitForTimeout(3000)
  }
}
