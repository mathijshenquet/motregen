import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BrowserContext } from 'playwright'
import sharp from 'sharp'
import { FRAME, FRAME_PIXELS } from './config.js'
import { openRenderPage } from './render-open.js'
import type { StillManifest } from './stills.js'

interface Box { left: number; top: number; width: number; height: number }
interface Glyph { target: { left: number; top: number } }
interface ClockLayout { time: Glyph['target']; day: Glyph['target']; title: Glyph['target']; backgrounds: Record<string, string> }
interface AtlasMetadata { clocks: Record<string, ClockLayout>; glyphs: Record<string, Box>; footer: string }
interface Atlas { metadata: AtlasMetadata; glyphs: Record<string, { rgba: Buffer; box: Box }>; backgrounds: Record<string, Buffer>; footer: Buffer }
const clockBox: Box = { left: 330, top: 0, width: 300, height: 130 }
const footerBox: Box = { left: 0, top: 1197, width: 450, height: 75 }
const timeFormat = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })
const dayFormat = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', timeZone: 'Europe/Amsterdam' })

export class NativeOverlay {
  private atlas?: Promise<Atlas>
  constructor(private readonly origin: string, private readonly directory: string, private readonly context: () => Promise<BrowserContext>) {}

  async prepare(manifest: StillManifest): Promise<void> {
    this.atlas ??= this.load(manifest).catch((error) => { this.atlas = undefined; throw error })
    await this.atlas
  }

  async draw(rgb: Buffer, epoch: number, now: number): Promise<Buffer> {
    const atlas = await this.atlas!
    const day = dayFormat.format(epoch), time = timeFormat.format(epoch)
    const layout = atlas.metadata.clocks[day]!
    const background = atlas.backgrounds[layout.backgrounds[epoch > now ? 'forecast' : 'history']!]!
    const blurred = await sharp(rgb, { raw: { ...FRAME_PIXELS, channels: 3 } }).extract(clockBox).blur(15).raw().toBuffer()
    this.blit(rgb, background, clockBox, blurred)
    for (const glyph of [{ text: time, target: layout.time }, { text: day, target: layout.day }, { text: 'Regen', target: layout.title }]) {
      const patch = atlas.glyphs[glyph.text]!
      this.blit(rgb, patch.rgba, { ...patch.box, left: glyph.target.left, top: glyph.target.top })
    }
    this.blit(rgb, atlas.footer, footerBox)
    return rgb
  }

  private blit(rgb: Buffer, rgba: Buffer, box: Box, blurred?: Buffer): void {
    for (let row = 0; row < box.height; row++) for (let column = 0; column < box.width; column++) {
      const source = (row * box.width + column) * 4
      const alpha = rgba[source + 3]! / 255
      if (!alpha) continue
      const destination = ((row + box.top) * FRAME_PIXELS.width + column + box.left) * 3
      for (let channel = 0; channel < 3; channel++) {
        const under = blurred && alpha > 0.5 ? blurred[(row * box.width + column) * 3 + channel]! : rgb[destination + channel]!
        rgb[destination + channel] = Math.round(rgba[source + channel]! * alpha + under * (1 - alpha))
      }
    }
  }

  private async load(manifest: StillManifest): Promise<Atlas> {
    const response = await fetch(this.origin, { signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error('App-stijl voor klok ontbreekt')
    const html = await response.text()
    const styles = [...html.matchAll(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/g)].map((match) => match[1])
    const key = createHash('sha256').update(JSON.stringify({ version: 1, styles, frame: FRAME })).digest('hex').slice(0, 24)
    const path = join(this.directory, `overlay-${key}.json`)
    let metadata: AtlasMetadata
    try { metadata = JSON.parse(await readFile(path, 'utf8')) as AtlasMetadata } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      metadata = await this.capture(manifest, key)
      await writeFile(`${path}.tmp`, JSON.stringify(metadata))
      await rename(`${path}.tmp`, path)
    }
    const sheet = await readFile(join(this.directory, `overlay-${key}.png`))
    const glyphs = Object.fromEntries(await Promise.all(Object.entries(metadata.glyphs).map(async ([text, box]) => [text, { box, rgba: await sharp(sheet).extract(box).ensureAlpha().raw().toBuffer() }])))
    const backgrounds = Object.fromEntries(await Promise.all(Object.values(metadata.clocks).flatMap((layout) => Object.values(layout.backgrounds)).map(async (name) => [name, await sharp(await readFile(join(this.directory, name))).ensureAlpha().raw().toBuffer()])))
    return { metadata, glyphs, backgrounds, footer: await sharp(await readFile(join(this.directory, metadata.footer))).ensureAlpha().raw().toBuffer() }
  }

  private async capture(manifest: StillManifest, key: string): Promise<AtlasMetadata> {
    await mkdir(this.directory, { recursive: true })
    const started = performance.now()
    const page = await (await this.context()).newPage()
    const metadata: AtlasMetadata = { clocks: {}, glyphs: {}, footer: `overlay-${key}-footer.png` }
    try {
      await openRenderPage(page, this.origin, 'weather', manifest, Date.parse(manifest.now))
      await page.addStyleTag({ content: 'html,body,.app-shell,.map-shell{background:transparent!important}.map,.map-overlay,.map-splash{visibility:hidden!important}.still-clock *{color:transparent!important}.still-clock{backdrop-filter:none!important}' })
      await page.screenshot({ path: join(this.directory, metadata.footer), omitBackground: true, clip: { x: footerBox.left / FRAME.scale, y: footerBox.top / FRAME.scale, width: footerBox.width / FRAME.scale, height: footerBox.height / FRAME.scale } })
      for (const day of ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']) {
        const targets = await page.evaluate((day) => {
          const clock = document.querySelector<HTMLElement>('.still-clock')!
          clock.innerHTML = `<div class="freshness-trigger"><span class="clock-main"><strong class="clock-map-time">00:00</strong><small class="clock-day">${day}</small></span><small class="clock-day">Regen</small></div>`
          return [...clock.querySelectorAll<HTMLElement>('.clock-map-time,.clock-day')].map((element) => { const box = element.getBoundingClientRect(); return { left: Math.floor(box.left * devicePixelRatio), top: Math.floor(box.top * devicePixelRatio) } })
        }, day)
        const layout: ClockLayout = { time: targets[0]!, day: targets[1]!, title: targets[2]!, backgrounds: {} }
        for (const regime of ['history', 'forecast']) {
          await page.locator('.still-clock').evaluate((clock, regime) => { (clock as HTMLElement).dataset.regime = regime }, regime)
          const name = `overlay-${key}-${day}-${regime}.png`
          await page.screenshot({ path: join(this.directory, name), omitBackground: true, clip: { x: clockBox.left / FRAME.scale, y: 0, width: clockBox.width / FRAME.scale, height: clockBox.height / FRAME.scale } })
          layout.backgrounds[regime] = name
        }
        metadata.clocks[day] = layout
      }
      const strings = Array.from({ length: 1440 }, (_, minute) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`)
      strings.push('ma', 'di', 'wo', 'do', 'vr', 'za', 'zo', 'Regen')
      const boxes = await page.evaluate((strings) => {
        document.body.innerHTML = '<div class="still-clock" id="glyphs" style="display:grid;grid-template-columns:repeat(14,100px);width:1400px"></div>'
        document.querySelector('style:last-of-type')?.remove()
        const atlas = document.getElementById('glyphs')!
        for (const text of strings) {
          const cell = document.createElement('div')
          cell.style.cssText = 'height:35px;line-height:1.1;display:flex;align-items:flex-start'
          const glyph = document.createElement(text.includes(':') ? 'strong' : 'small')
          glyph.className = text.includes(':') ? 'clock-map-time' : 'clock-day'
          glyph.textContent = text
          cell.append(glyph); atlas.append(cell)
        }
        return [...atlas.querySelectorAll<HTMLElement>('strong,small')].map((element) => {
          const box = element.getBoundingClientRect()
          return { left: Math.floor(box.left * devicePixelRatio), top: Math.floor(box.top * devicePixelRatio), width: Math.ceil(box.width * devicePixelRatio) + 1, height: Math.ceil(box.height * devicePixelRatio) + 1 }
        })
      }, strings)
      await page.addStyleTag({ content: 'html,body{background:transparent!important}.still-clock *{color:revert!important}.clock-map-time{color:#102630!important}.clock-day{color:#637b85!important}' })
      await page.screenshot({ path: join(this.directory, `overlay-${key}.png`), omitBackground: true, fullPage: true })
      strings.forEach((text, index) => { metadata.glyphs[text] = boxes[index]! })
      console.info(JSON.stringify({ event: 'native-overlay-created', key, milliseconds: Math.round(performance.now() - started), glyphs: strings.length }))
      return metadata
    } finally { await page.close() }
  }
}
