// Naam en canonical-origin verschillen per domein (MIP-28): elke build krijgt ze via de omgeving mee.
// Dit bestand blijft vrij van `import.meta.env`, zodat ook vite.config en de scripts (node) het kunnen laden.
export interface Brand {
  /** Zichtbare productnaam: "motregen.nl" of "weer ok?". */
  name: string
  /** Origin zonder slash aan het eind; basis voor canonical, OG-url, sitemap en deel-links. */
  canonicalOrigin: string
}

export const defaultBrand: Brand = { name: 'motregen.nl', canonicalOrigin: 'https://motregen.nl' }

export function brandFromEnvironment(environment: Record<string, string | undefined>): Brand {
  const canonicalOrigin = environment.VITE_CANONICAL_ORIGIN
  return {
    name: environment.VITE_BRAND_NAME || defaultBrand.name,
    canonicalOrigin: canonicalOrigin ? new URL(canonicalOrigin).origin : defaultBrand.canonicalOrigin,
  }
}

/** De naam zoals hij in een zin staat: "Over motregen en instellingen", zonder het domeinachtervoegsel. */
export function spokenBrandName(brand: Brand): string {
  const domainSuffix = '.nl'
  return brand.name.endsWith(domainSuffix) ? brand.name.slice(0, -domainSuffix.length) : brand.name
}
