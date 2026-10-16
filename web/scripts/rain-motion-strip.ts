// Filmstrip van de regenkaart op vaste kaarttijden (bevroren snapshot), om beweging tussen frames te beoordelen.
// Rig-haak: window.__motregenJumpTo (App.tsx). Gebruik: tsx scripts/rain-motion-strip.ts <origin> <uitmap> <start-ISO> <eind-ISO> <stap-min> [lng lat zoom]
import { writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { positionRainPage, rainCaptureBrowserArguments, rainCaptureContext } from './rain-capture'
const [origin, outDir, startIso, endIso, stepText, cameraLng, cameraLat, cameraZoom] = process.argv.slice(2)
const browser = await chromium.launch({ args: rainCaptureBrowserArguments })
const context = await browser.newContext(rainCaptureContext)
const page = await context.newPage()
// Klok vast op het moment van de snapshot, anders veroudert de reproductie met de echte tijd.
const manifest = await (await fetch(`${origin}/data/manifest.json`)).json()
await page.clock.setFixedTime(new Date(Date.parse(manifest.generated) + 60_000))
const step = Number(stepText) * 60_000
for (let epoch = Date.parse(startIso!); epoch <= Date.parse(endIso!); epoch += step) {
  const time = new Date(epoch).toISOString().replace('.000', '')
  await positionRainPage(page, `${origin}/?t=${encodeURIComponent(time)}${process.env.REPRO_QUERY ?? ''}`, cameraZoom ? { longitude: Number(cameraLng), latitude: Number(cameraLat), zoom: Number(cameraZoom) } : undefined)
  await page.screenshot({ path: `${outDir}/${time.slice(11, 19).replaceAll(':', '')}.png` })
  // Twee referentiepunten per beeld: daarmee rekent de analyse schermpixels terug naar lengte/breedte.
  const projection = await page.evaluate(() => {
    const project = (window as unknown as { __motregenProject: (lng: number, lat: number) => { x: number; y: number } }).__motregenProject
    const pair = (window as unknown as { __motregenRainPair?: object }).__motregenRainPair
    const pick = (window as unknown as { __motregenMotionPick?: object }).__motregenMotionPick
    const motionBytes = (window as unknown as { __motregenMotionBytes?: object }).__motregenMotionBytes
    const motionDecoded = (window as unknown as { __motregenMotionDecoded?: object }).__motregenMotionDecoded
    return { a: { lng: 3.5, lat: 53.2, ...project(3.5, 53.2) }, b: { lng: 5.0, lat: 52.2, ...project(5.0, 52.2) }, pair, pick, motionBytes, motionDecoded }
  })
  writeFileSync(`${outDir}/${time.slice(11, 19).replaceAll(':', '')}.json`, JSON.stringify(projection))
  console.log('shot', time)
}
await browser.close()
