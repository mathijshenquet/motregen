/**
 * Anoniem gebruiksbaken (MIP-13). De velden van `UsageBody` zijn het privacycontract: alleen
 * booleans en kleine enums, geen tijdstempels, coördinaten, plaatsnamen, IDs of UA. Wie een veld
 * toevoegt, past ook `USAGE_FIELDS`, `USAGE_SCHEMA_VERSION`, `docs/analytics.md` en zo nodig de About-tekst aan.
 */

export const USAGE_FEATURES = [
  'pinFeel', // modus gevoel vastgezet
  'pinWind', // modus wind vastgezet
  'hover', // isolijnfocus via hover op de kolom Gevoel
  'search', // zoekresultaat gekozen
  'geo', // geolocatie gelukt
  'fav', // favoriet opgeslagen
  'pin', // pin gebruikt: tik op de kaart, pin gesleept (loslaten) of dubbeltik-centreren
  'play', // afspelen gestart
  'scrub', // tijd gescrubd
  'history', // historie in de tabel geopend
  'fresh', // versheidspaneel geopend
  'about', // About geopend
] as const
export type UsageFeature = typeof USAGE_FEATURES[number]

export const USAGE_RANGES = ['3', '8', '24', 'all'] as const
export const USAGE_THEMES = ['light', 'system', 'dark'] as const
export const USAGE_WIDTHS = ['<430', '<960', '>=960'] as const
export const USAGE_DURATIONS = ['<1', '1-5', '5-30', '>30'] as const

export type UsageRange = typeof USAGE_RANGES[number]
export type UsageTheme = typeof USAGE_THEMES[number]
export type UsageWidth = typeof USAGE_WIDTHS[number]
export type UsageDuration = typeof USAGE_DURATIONS[number]

/** Alleen gebruikte features staan erin (als true): een ontbrekend veld is "niet gebruikt", zo blijft het baken < 200 B. */
export const USAGE_SCHEMA_VERSION = 1

export type UsageBody = Partial<Record<UsageFeature, true>> & {
  /** Schemaversie: ophogen bij elke wijziging van deze velden, zodat het aggregaat oude en nieuwe regels onderscheidt. */
  v: typeof USAGE_SCHEMA_VERSION
  /** Laatst gekozen bereik via de bereikknop; null als die knop niet gebruikt is. */
  range: UsageRange | null
  theme: UsageTheme
  coarse: boolean
  width: UsageWidth
  /** Sessieduur in minuten, gebakken. */
  dur: UsageDuration
}

export const USAGE_FIELDS = ['v', ...USAGE_FEATURES, 'range', 'theme', 'coarse', 'width', 'dur'] as const

export interface UsageEnvironment {
  /** Milliseconden sinds het begin van het pagina-leven (performance.now). */
  now: () => number
  coarsePointer: () => boolean
  viewportWidth: () => number
  sendBeacon: (url: string, body: string) => boolean
}

export interface UsageTracker {
  mark: (feature: UsageFeature) => void
  setRange: (hours: number | null) => void
  setTheme: (theme: UsageTheme) => void
  sessionBody: () => UsageBody
  /** Verstuurt het baken hooguit één keer per pagina-leven; true als het nu verstuurd is. */
  sendUsage: () => boolean
  readonly sent: boolean
  onChange?: () => void
}

export const USAGE_ENDPOINT = '/hit'

export function createUsageTracker(environment: UsageEnvironment, theme: UsageTheme): UsageTracker {
  const features = new Set<UsageFeature>()
  let range: UsageRange | null = null
  let currentTheme = theme
  let sent = false
  const tracker: UsageTracker = {
    mark(feature) {
      if (features.has(feature)) return
      features.add(feature)
      tracker.onChange?.()
    },
    setRange(hours) {
      range = hours === null ? 'all' : USAGE_RANGES.find((value) => value === String(hours)) ?? range
      tracker.onChange?.()
    },
    setTheme(next) {
      currentTheme = next
      tracker.onChange?.()
    },
    sessionBody() {
      const body = Object.fromEntries(USAGE_FEATURES.filter((feature) => features.has(feature)).map((feature) => [feature, true]))
      return {
        v: USAGE_SCHEMA_VERSION,
        ...body,
        range,
        theme: currentTheme,
        coarse: environment.coarsePointer(),
        width: widthClass(environment.viewportWidth()),
        dur: durationBucket(environment.now()),
      }
    },
    sendUsage() {
      if (sent) return false
      sent = true
      try {
        return environment.sendBeacon(USAGE_ENDPOINT, JSON.stringify(tracker.sessionBody()))
      } catch {
        return false
      }
    },
    get sent() { return sent },
  }
  return tracker
}

export function widthClass(width: number): UsageWidth {
  return width < 430 ? '<430' : width < 960 ? '<960' : '>=960'
}

export function durationBucket(elapsedMs: number): UsageDuration {
  const minutes = elapsedMs / 60_000
  return minutes < 1 ? '<1' : minutes < 5 ? '1-5' : minutes < 30 ? '5-30' : '>30'
}

/**
 * Eén baken per pagina-leven: bij de eerste keer verborgen. pagehide vangt browsers die bij
 * sluiten geen visibilitychange sturen; een terugkeer naar zichtbaar begint geen nieuwe sessie.
 */
export function installUsageBeacon(tracker: UsageTracker, target: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>, page: Pick<Window, 'addEventListener' | 'removeEventListener'>): () => void {
  const hidden = () => { if (target.visibilityState === 'hidden') send() }
  const send = () => {
    tracker.sendUsage()
    dispose()
  }
  const dispose = () => {
    target.removeEventListener('visibilitychange', hidden)
    page.removeEventListener('pagehide', send)
  }
  target.addEventListener('visibilitychange', hidden)
  page.addEventListener('pagehide', send)
  return dispose
}

/** Sessies worden in het serverlog geteld als manifestverzoeken met `?s=1`: alleen het eerste. */
export function sessionManifestUrls(manifestUrl: URL): () => URL {
  let first = true
  return () => {
    if (!first) return manifestUrl
    first = false
    const url = new URL(manifestUrl)
    url.searchParams.set('s', '1')
    return url
  }
}

export function browserUsageEnvironment(): UsageEnvironment {
  const coarse = matchMedia('(pointer: coarse)')
  return {
    now: () => performance.now(),
    coarsePointer: () => coarse.matches,
    viewportWidth: () => window.innerWidth,
    sendBeacon: (url, body) => navigator.sendBeacon(url, body),
  }
}
