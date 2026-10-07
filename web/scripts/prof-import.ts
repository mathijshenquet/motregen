import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const file = process.argv[2]
if (!file) throw new Error('Gebruik: pnpm prof:import <profiel.json>')

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('https://profiler.firefox.com/from-file/', { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.locator('input[type=file]').setInputFiles(resolve(file))
  await page.waitForURL(/\/from-file\/calltree\//, { timeout: 120_000 })
  await page.getByText('Full Range').waitFor({ timeout: 120_000 })
  if (errors.length) throw new Error(`Firefox Profiler rapporteerde browserfouten: ${errors.join('; ')}`)
  console.log(`Firefox Profiler importeerde ${file}: ${await page.title()} · ${page.url()}`)
} finally {
  await browser.close()
}
