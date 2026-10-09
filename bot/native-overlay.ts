import { prepareNativeAsset } from './native-assets.js'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BrowserContext } from 'playwright'
import sharp from 'sharp'
import { FRAME, FRAME_PIXELS } from './config.js'
import { openRenderPage } from './render-open.js'
import type { LoopMode, StillManifest } from './stills.js'

// libvips' operation cache otherwise retains the raw full-frame inputs between renders.
sharp.cache(false)
sharp.concurrency(1)

interface Box { left: number; top: number; width: number; height: number }
interface Glyph { target: { left: number; top: number } }
interface ClockLayout { time: Glyph['target']; day: Glyph['target']; title: Glyph['target']; backgrounds: Record<string, string> }
interface AtlasMetadata { clocks: Record<string, ClockLayout>; glyphs: Record<string, Record<string, Box>>; footer: string; key: string }
interface GlyphPatch { rgba: Buffer; box: Box }
interface Atlas { metadata: AtlasMetadata; glyphs: Map<string, Promise<Record<string, GlyphPatch>>>; backgrounds: Record<string, Buffer>; footer: Buffer }
const clockBox: Box = { left: 330, top: 0, width: 300, height: 130 }
const footerBox: Box = { left: 0, top: 1197, width: 450, height: 75 }
const timeFormat = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })
const dayFormat = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', timeZone: 'Europe/Amsterdam' })

export class NativeOverlay {
  private atlas?: Promise<Atlas>
  constructor(private readonly origin: string, private readonly directory: string, private readonly context: () => Promise<BrowserContext>, private readonly mode: LoopMode = 'weather') {}

  private get title(): string { return this.mode === 'feels' ? 'Gevoelstemperatuur' : this.mode === 'wind' ? 'Wind' : 'Regen' }

  async prepare(manifest: StillManifest, epochs: readonly number[] = [Date.parse(manifest.now)]): Promise<void> {
    this.atlas ??= this.load(manifest).catch((error) => { this.atlas = undefined; throw error })
    const atlas = await this.atlas
    const days = new Map<string, Set<string>>()
    for (const epoch of epochs) {
      const day = dayFormat.format(epoch)
      const texts = days.get(day) ?? new Set([day, this.title])
      texts.add(timeFormat.format(epoch))
      days.set(day, texts)
    }
    for (const [day, texts] of days) await this.loadGlyphs(atlas, day, [...texts])
  }

  async draw(rgb: Buffer, epoch: number, now: number): Promise<Buffer> {
    const atlas = await this.atlas!
    const day = dayFormat.format(epoch), time = timeFormat.format(epoch)
    const layout = atlas.metadata.clocks[day]!
    const glyphs = await this.loadGlyphs(atlas, day, [time, day, this.title])
    const background = atlas.backgrounds[layout.backgrounds[epoch > now ? 'forecast' : 'history']!]!
    const blurred = await sharp(rgb, { raw: { ...FRAME_PIXELS, channels: 3 } }).extract(clockBox).blur(15).raw().toBuffer()
    this.blit(rgb, background, clockBox, blurred)
    for (const glyph of [{ text: time, target: layout.time }, { text: day, target: layout.day }, { text: this.title, target: layout.title }]) {
      const patch = glyphs[glyph.text]!
      this.blit(rgb, patch.rgba, { ...patch.box, left: Math.floor(glyph.target.left), top: Math.floor(glyph.target.top) })
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
    const key = createHash('sha256').update(JSON.stringify({ version: 7, styles, frame: FRAME, ...(this.mode === 'weather' ? {} : { mode: this.mode, title: this.title }) })).digest('hex').slice(0, 24)
    const path = join(this.directory, `overlay-${key}.json`)
    let metadata: AtlasMetadata
    try { metadata = JSON.parse(await readFile(path, 'utf8')) as AtlasMetadata } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      metadata = await prepareNativeAsset(() => this.capture(manifest, key))
      const temporary = `${path}.${randomUUID()}.tmp`
      await writeFile(temporary, JSON.stringify(metadata))
      await rename(temporary, path)
    }
    const backgrounds = Object.fromEntries(await Promise.all(Object.values(metadata.clocks).flatMap((layout) => Object.values(layout.backgrounds)).map(async (name) => [name, await sharp(join(this.directory, name)).ensureAlpha().raw().toBuffer()])))
    return { metadata, glyphs: new Map(), backgrounds, footer: await sharp(join(this.directory, metadata.footer)).ensureAlpha().raw().toBuffer() }
  }

  private async loadGlyphs(atlas: Atlas, day: string, texts: readonly string[]): Promise<Record<string, GlyphPatch>> {
    const prior = await atlas.glyphs.get(day) ?? {}
    const missing = texts.filter((text) => !prior[text])
    if (!missing.length) return prior
    const pending = (async () => {
      const path = join(this.directory, `overlay-${atlas.metadata.key}-${day}-glyphs.png`)
      const metadata = await sharp(path).metadata()
      const bands = new Map<number, Array<[string, Box]>>()
      for (const text of missing) {
        const entry: [string, Box] = [text, atlas.metadata.glyphs[day]![text]!]
        const band = Math.floor(entry[1].top / 1024)
        const entries = bands.get(band) ?? []
        entries.push(entry)
        bands.set(band, entries)
      }
      const glyphs: Record<string, GlyphPatch> = { ...prior }
      for (const entries of bands.values()) {
        const top = Math.min(...entries.map(([, box]) => box.top))
        const bottom = Math.max(...entries.map(([, box]) => box.top + box.height))
        const sheet = await sharp(path, { sequentialRead: true }).extract({ left: 0, top, width: metadata.width!, height: bottom - top }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
        for (const [text, box] of entries) {
          const rgba = Buffer.alloc(box.width * box.height * 4)
          for (let row = 0; row < box.height; row++) {
            const start = ((box.top - top + row) * sheet.info.width + box.left) * 4
            sheet.data.copy(rgba, row * box.width * 4, start, start + box.width * 4)
          }
          glyphs[text] = { box, rgba }
        }
      }
      return glyphs
    })()
    atlas.glyphs.set(day, pending)
    return pending
  }

  private async capture(manifest: StillManifest, key: string): Promise<AtlasMetadata> {
    await mkdir(this.directory, { recursive: true })
    const temporary = await mkdtemp(join(this.directory, `.overlay-${key}-`))
    const started = performance.now()
    const page = await (await this.context()).newPage()
    const metadata: AtlasMetadata = { clocks: {}, glyphs: {}, footer: `overlay-${key}-footer.png`, key }
    try {
      await openRenderPage(page, this.origin, this.mode, manifest, Date.parse(manifest.now))
      await page.addStyleTag({ content: 'html,body,.app-shell,.map-shell{background:transparent!important}.map,.map-overlay,.map-splash{visibility:hidden!important}.still-clock *{color:transparent!important}.still-clock{backdrop-filter:none!important}' })
      await page.screenshot({ path: join(temporary, metadata.footer), omitBackground: true, clip: { x: footerBox.left / FRAME.scale, y: footerBox.top / FRAME.scale, width: footerBox.width / FRAME.scale, height: footerBox.height / FRAME.scale } })
      for (const day of ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']) {
        const targets = await page.evaluate(({ day, title }) => {
          const clock = document.querySelector<HTMLElement>('.still-clock')!
          clock.innerHTML = `<div class="freshness-trigger"><span class="clock-main"><strong class="clock-map-time">00:00</strong><small class="clock-day">${day}</small></span><small class="clock-day">${title}</small></div>`
          return [...clock.querySelectorAll<HTMLElement>('.clock-map-time,.clock-day')].map((element) => { const box = element.getBoundingClientRect(); return { left: box.left * devicePixelRatio, top: box.top * devicePixelRatio } })
        }, { day, title: this.title })
        const layout: ClockLayout = { time: targets[0]!, day: targets[1]!, title: targets[2]!, backgrounds: {} }
        for (const regime of ['history', 'forecast']) {
          await page.locator('.still-clock').evaluate((clock, regime) => { (clock as HTMLElement).dataset.regime = regime }, regime)
          const name = `overlay-${key}-${day}-${regime}.png`
          await page.screenshot({ path: join(temporary, name), omitBackground: true, clip: { x: clockBox.left / FRAME.scale, y: 0, width: clockBox.width / FRAME.scale, height: clockBox.height / FRAME.scale } })
          layout.backgrounds[regime] = name
        }
        metadata.clocks[day] = layout
      }
      for (const day of Object.keys(metadata.clocks)) {
        const strings = Array.from({ length: 1440 }, (_, minute) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`)
        strings.push(day, this.title)
        const boxes = await page.evaluate(({ strings, day, title }) => {
          document.body.innerHTML = '<div id="glyphs" style="display:grid;grid-template-columns:repeat(10,128px);width:1280px"></div>'
          const atlas = document.getElementById('glyphs')!
          for (const text of strings.slice(0, 1440)) {
            const cell = document.createElement('div')
            // Integer physical cell sizes preserve the app's subpixel text placement.
            cell.style.cssText = 'height:52px;position:relative'
            if (text === '00:00' && title === 'Gevoelstemperatuur') cell.style.gridColumn = 'span 2'
            const clock = document.createElement('div')
            clock.className = 'map-clock still-clock'
            clock.style.left = text === '00:00' && title === 'Gevoelstemperatuur' ? '104px' : '64px'
            clock.innerHTML = '<div class="freshness-trigger"><span class="clock-main"><strong class="clock-map-time">'+text+'</strong><small class="clock-day">'+day+'</small></span><small class="clock-day">'+title+'</small></div>'
            if (text !== '00:00') for (const small of clock.querySelectorAll<HTMLElement>('.clock-day')) small.style.visibility = 'hidden'
            cell.append(clock); atlas.append(cell)
          }
          const elements = [...atlas.querySelectorAll<HTMLElement>('.clock-map-time'), ...atlas.querySelector('.still-clock')!.querySelectorAll<HTMLElement>('.clock-day')]
          return elements.map((element) => {
            const box = element.getBoundingClientRect()
            return { left: Math.floor(box.left * devicePixelRatio), top: Math.floor(box.top * devicePixelRatio), width: Math.ceil(box.width * devicePixelRatio) + 1, height: Math.ceil(box.height * devicePixelRatio) + 1 }
          })
        }, { strings, day, title: this.title })
        await page.addStyleTag({ content: 'html,body{background:transparent!important}.still-clock{background:transparent!important;border-color:transparent!important;box-shadow:none!important;backdrop-filter:none!important}.still-clock *{color:revert!important}.clock-map-time{color:#102630!important}.clock-day{color:#637b85!important}' })
        await page.screenshot({ path: join(temporary, `overlay-${key}-${day}-glyphs.png`), omitBackground: true, fullPage: true })
        metadata.glyphs[day] = Object.fromEntries(strings.map((text, index) => [text, boxes[index]!]))
      }
      for (const name of await readdir(temporary)) await rename(join(temporary, name), join(this.directory, name))
      console.info(JSON.stringify({ event: 'native-overlay-created', key, milliseconds: Math.round(performance.now() - started), glyphs: 7 * 1442 }))
      return metadata
    } finally { await page.close(); await rm(temporary, { recursive: true, force: true }) }
  }
}
