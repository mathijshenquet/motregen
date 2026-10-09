import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { WeatherPlaces } from './weather-places.js'
import { PlaceWeatherRenderer } from './weather.js'
import { validateManifest } from './stills.js'

export async function onceWeer(args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  const value = (name: string) => args.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3)
  const flagIndex = args.indexOf('--once-weer')
  const query = value('once-weer') ?? args[flagIndex + 1]
  if (!query || query.startsWith('--')) throw new Error('Geef een plaats mee met --once-weer ams')
  const origin = env.MOTREGEN_ORIGIN ?? 'https://motregen.nl'
  const directory = resolve(value('output') ?? '.dev/tracks/u73-weer-per-plaats/beelden')
  await mkdir(directory, { recursive: true })
  const places = new WeatherPlaces(origin)
  const found = await places.find(query)
  if (!found.place) {
    await writeFile(join(directory, 'suggesties.json'), JSON.stringify(found.suggestions, null, 2))
    console.info(JSON.stringify({ event: 'weer-suggestions', suggestions: found.suggestions.map((place) => place.name) }))
    return
  }
  const manifestPath = value('manifest')
  const manifest = manifestPath ? validateManifest(JSON.parse(await readFile(manifestPath, 'utf8'))) : undefined
  const renderer = new PlaceWeatherRenderer(origin, env.MOTREGEN_RENDER_CACHE ?? join(directory, 'cache'))
  for (const pass of ['cold', 'warm']) {
    const started = performance.now()
    const result = await renderer.render(found.place, manifest)
    if (result.media) await copyFile(result.media.path, join(directory, `${found.place.slug}.png`))
    await writeFile(join(directory, `${found.place.slug}.txt`), result.caption)
    const receipt = { event: 'weer-receipt', pass, place: found.place.name, generated: result.media?.generated, image: Boolean(result.media), cached: result.cached, renderMs: result.milliseconds, totalMs: performance.now() - started }
    console.info(JSON.stringify(receipt))
    await writeFile(join(directory, `${found.place.slug}-${pass}.json`), JSON.stringify(receipt, null, 2))
    if (!result.media) process.exitCode = 1
  }
}
