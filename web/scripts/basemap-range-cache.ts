// Cache API weigert status 206. Bewaar elk exact bereik als 200 en herstel 206 bij uitlezen.
// Workbox serialiseert deze hooks naar de SW; ze mogen geen modulevariabelen gebruiken.
export const basemapRangeCache = {
  cacheKeyWillBeUsed: async ({ request }: { request: Request }) => {
    const range = request.headers.get('Range')
    if (!range) return request
    const url = new URL(request.url)
    url.searchParams.set('motregen-range', range)
    return new Request(url.href)
  },
  cacheWillUpdate: async ({ response }: { response: Response }) => {
    if (response.status === 200) return response
    if (response.status !== 206 || !response.headers.has('Content-Range')) return null
    return new Response(response.body, { status: 200, headers: response.headers })
  },
  cachedResponseWillBeUsed: async ({ cachedResponse }: { cachedResponse?: Response }) => {
    if (!cachedResponse?.headers.has('Content-Range')) return cachedResponse
    return new Response(cachedResponse.body, { status: 206, headers: cachedResponse.headers })
  },
}
