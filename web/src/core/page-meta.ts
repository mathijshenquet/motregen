import { parsePresetPath, presetPath, type PresetMode } from './presets.js'

export const modeTitles: Record<PresetMode, string> = {
  weather: 'Regenradar', air: 'Lucht', feels: 'Gevoelstemperatuur', wind: 'Wind',
}

export const defaultTitle = 'motregen.nl — Regenradar en weersverwachting'

export function pageMetadata(pathname: string): { title: string; canonical: string; place?: string } {
  const { mode, place, placeSlug } = parsePresetPath(pathname)
  return {
    title: mode ? `${modeTitles[mode]}${place ? ` ${place}` : ''} — motregen.nl` : defaultTitle,
    canonical: `https://motregen.nl${mode ? presetPath(mode, place, placeSlug) : '/'}`,
    place,
  }
}

export function updatePageMetadata(pathname: string): void {
  const { title, canonical } = pageMetadata(pathname)
  document.title = title
  document.querySelector('link[rel="canonical"]')?.setAttribute('href', canonical)
  for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) {
    document.querySelector(selector)?.setAttribute('content', title)
  }
  document.querySelector('meta[property="og:url"]')?.setAttribute('content', canonical)
}
