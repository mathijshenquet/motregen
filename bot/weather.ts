import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import type { SearchPlace } from '../web/src/core/place-search.js'
import type { RenderedStill } from './render.js'
import { STILL_CACHE_TTL } from './file-ids.js'
import { presetUrl, validateManifest, type StillManifest } from './stills.js'
import { escapeHtml, WEATHER_IMAGE, weatherSvg } from './weather-chart.js'
import { WeatherData, rainSummary } from './weather-series.js'

export interface PlaceWeatherResult { caption: string; url: string; media?: RenderedStill; milliseconds: number; cached: boolean }

export class PlaceWeatherRenderer {
  private data?: { generated: string; value: WeatherData }
  private manifestCache?: { value: Promise<StillManifest>; expires: number }
  private readonly pending = new Map<string, Promise<PlaceWeatherResult>>()
  private prunedAt = 0

  constructor(private readonly origin: string, private readonly cacheDirectory: string) {}

  private manifest(): Promise<StillManifest> {
    if (this.manifestCache && this.manifestCache.expires > Date.now()) return this.manifestCache.value
    const value = fetch(new URL('/data/manifest.json', this.origin), { cache: 'no-store', signal: AbortSignal.timeout(15_000) }).then(async (response) => {
      if (!response.ok) throw new Error('Manifest ontbreekt')
      return validateManifest(await response.json())
    }).catch((error) => {
      this.manifestCache = undefined
      throw error
    })
    this.manifestCache = { value, expires: Date.now() + 15_000 }
    return value
  }

  async render(place: SearchPlace, pinnedManifest?: StillManifest): Promise<PlaceWeatherResult> {
    const started = performance.now()
    let epoch = Date.now()
    try {
      const manifest = pinnedManifest ?? await this.manifest()
      epoch = Date.parse(manifest.now)
      const key = `weer-${createHash('sha256').update(JSON.stringify([1, manifest.generated, place.slug, place.lng, place.lat])).digest('hex').slice(0, 24)}`
      let task = this.pending.get(key)
      if (!task) {
        task = this.renderImage(place, manifest, key)
        this.pending.set(key, task)
        void task.finally(() => this.pending.delete(key)).catch(() => undefined)
      }
      return await task
    } catch {
      const url = placeWeatherUrl(place, epoch)
      return { caption: placeCaption(place, 'De weergegevens zijn tijdelijk niet compleet; bekijk de verwachting in de app', url), url, milliseconds: performance.now() - started, cached: false }
    }
  }

  private async renderImage(place: SearchPlace, manifest: StillManifest, key: string): Promise<PlaceWeatherResult> {
    const started = performance.now()
    const directory = join(this.cacheDirectory, 'weer')
    await mkdir(directory, { recursive: true })
    await this.prune(directory)
    const path = join(directory, `${key}.png`)
    const url = placeWeatherUrl(place, Date.parse(manifest.now))
    try {
      const metadata = await stat(path)
      if (metadata.mtimeMs + STILL_CACHE_TTL > Date.now()) {
        const receipt = JSON.parse(await readFile(`${path}.json`, 'utf8'))
        if (receipt.key === key && typeof receipt.caption === 'string') return this.result(path, key, manifest, url, receipt.caption, started, true)
      }
    } catch {}
    if (this.data?.generated !== manifest.generated) this.data = { generated: manifest.generated, value: new WeatherData(this.origin, manifest) }
    const series = await this.data.value.series(place)
    const caption = placeCaption(place, rainSummary(series), url)
    const svg = weatherSvg(place, series)
    await sharp(Buffer.from(svg), { density: 72 * WEATHER_IMAGE.scale }).png().toFile(`${path}.tmp`)
    await rename(`${path}.tmp`, path)
    await writeFile(`${path}.json.tmp`, JSON.stringify({ key, caption }))
    await rename(`${path}.json.tmp`, `${path}.json`)
    return this.result(path, key, manifest, url, caption, started, false)
  }

  private result(path: string, key: string, manifest: StillManifest, url: string, caption: string, started: number, cached: boolean): PlaceWeatherResult {
    const milliseconds = performance.now() - started
    const media: RenderedStill = { kind: 'photo', path, key, url, caption, epoch: Date.parse(manifest.now), generated: manifest.generated, milliseconds, cached }
    return { media, caption, url, milliseconds, cached }
  }

  private async prune(directory: string): Promise<void> {
    if (this.prunedAt > Date.now() - 60_000) return
    this.prunedAt = Date.now()
    for (const name of await readdir(directory)) {
      const path = join(directory, name)
      const metadata = await stat(path).catch(() => undefined)
      if (metadata && metadata.mtimeMs + STILL_CACHE_TTL < Date.now()) await rm(path, { force: true })
    }
  }
}

export function placeWeatherUrl(place: SearchPlace, epoch: number): string {
  const url = new URL(presetUrl('https://motregen.nl', 'weather', epoch))
  url.pathname = `/weer/${place.slug}`
  url.searchParams.set('lat', String(place.lat))
  url.searchParams.set('lon', String(place.lng))
  return url.href
}

function placeCaption(place: SearchPlace, summary: string, url: string): string {
  return `${escapeHtml(place.name)}\n${summary}.\n<a href="${escapeHtml(url)}">motregen.nl</a>`
}
