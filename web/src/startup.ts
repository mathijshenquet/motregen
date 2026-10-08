import type { Manifest } from './core/contract'
import { browserDeviceHints, decodeBudget } from './core/decode-budget'
import { MrfClient } from './core/mrf'
import { configurePerfMode, consumeColdProfile, installPerfMonitor } from './core/perf'
import { cursorForPresetEpoch, parsePresets } from './core/presets'
import { buildTimeline } from './core/time-model'
import { sessionManifestUrls } from './core/usage'

export const manifestUrl = new URL('/data/manifest.json', location.href)
export const profileMode = configurePerfMode(new URL(location.href), localStorage)
export const coldProfileRequested = consumeColdProfile(localStorage)
export const perf = installPerfMonitor()
perf.setDetailedEnabled(profileMode)
export const decode = decodeBudget(browserDeviceHints())
const nextManifestUrl = sessionManifestUrls(manifestUrl)
const params = new URLSearchParams(location.search)
const stillMode = params.get('still') === '1'
export const initialClient = params.has('skywatch-render') ? undefined : new MrfClient(manifestUrl, perf.loads, decode)

export async function fetchManifest(cache: RequestCache = 'default'): Promise<Manifest> {
  const response = await fetch(stillMode ? manifestUrl : nextManifestUrl(), { cache })
  if (!response.ok) throw new Error(`Manifest laden mislukt (${response.status})`)
  return response.json() as Promise<Manifest>
}

export const initialManifest = params.has('skywatch-render') ? undefined : fetchManifest()
// De kleine HTML-entry kan eerder klaar zijn dan de app die deze fout aan de gebruiker toont.
void initialManifest?.catch(() => undefined)

const firstRainLate = params.has('dev') && localStorage.getItem('motregen-dev-eerste-regen') === 'laat'
if (initialManifest && initialClient && !firstRainLate && params.get('tg') !== '1') {
  const client = initialClient
  const initialUrl = new URL(location.href)
  void initialManifest.then((manifest) => {
    const frames = buildTimeline(manifest)
    const now = Date.parse(manifest.now)
    const presets = parsePresets(initialUrl.search, now, initialUrl.pathname, initialUrl.hash)
    let nowIndex = 0
    for (let index = 0; index < frames.length; index++) if (frames[index]!.epoch <= now) nowIndex = index
    const presetCursor = presets.epoch === undefined ? undefined : cursorForPresetEpoch(frames, presets.epoch)
    const firstIndex = Math.floor(presetCursor ?? nowIndex)
    return Promise.all(frames.slice(firstIndex, firstIndex + 2).map((frame) => client.getFrame(frame.chunk, frame.frameIndex)))
  }).catch(() => undefined)
}
