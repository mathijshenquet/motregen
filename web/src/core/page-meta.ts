import type { Brand } from './brand.js'
import { parsePresetPath, presetPath, type PresetMode } from './presets.js'

export const modeTitles: Record<PresetMode, string> = {
  weather: 'Regenradar', air: 'Lucht', feels: 'Gevoelstemperatuur', wind: 'Wind',
}

export function defaultTitle(brand: Brand): string {
  return `${brand.name} — Regenradar en weersverwachting`
}

export function pageMetadata(pathname: string, brand: Brand): { title: string; canonical: string; place?: string } {
  const { mode, place, placeSlug } = parsePresetPath(pathname)
  return {
    title: mode ? `${modeTitles[mode]}${place ? ` ${place}` : ''} — ${brand.name}` : defaultTitle(brand),
    canonical: `${brand.canonicalOrigin}${mode ? presetPath(mode, place, placeSlug) : '/'}`,
    place,
  }
}

export function updatePageMetadata(pathname: string, brand: Brand): void {
  const { title, canonical } = pageMetadata(pathname, brand)
  document.title = title
  document.querySelector('link[rel="canonical"]')?.setAttribute('href', canonical)
  for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) {
    document.querySelector(selector)?.setAttribute('content', title)
  }
  document.querySelector('meta[property="og:url"]')?.setAttribute('content', canonical)
}
