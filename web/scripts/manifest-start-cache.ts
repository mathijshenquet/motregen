// Workbox serialiseert de hooks; de maximale leeftijd moet binnen de callback staan.
export const manifestStartCache = {
  cacheWillUpdate: async ({ response }: { response: Response }) => {
    if (response.status !== 200) return null
    const headers = new Headers(response.headers)
    headers.set('X-Motregen-Cached-At', String(Date.now()))
    return new Response(response.body, { status: 200, headers })
  },
  cachedResponseWillBeUsed: async ({ request, cachedResponse }: { request: Request; cachedResponse?: Response }) => {
    if (request.cache === 'no-cache' || request.cache === 'reload' || request.cache === 'no-store') return null
    const cachedAt = Number(cachedResponse?.headers.get('X-Motregen-Cached-At'))
    const age = Date.now() - cachedAt
    return cachedAt > 0 && age >= 0 && age < 15_000 ? cachedResponse : null
  },
}
