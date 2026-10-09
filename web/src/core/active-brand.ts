import { brandFromEnvironment } from './brand'

/** De merknaam van deze build; Vite vult `import.meta.env` bij het bouwen uit VITE_BRAND_NAME en VITE_CANONICAL_ORIGIN. */
export const brand = brandFromEnvironment(import.meta.env)
