import type { StillManifest } from './stills.js'

export function installRenderFetch(pinnedManifest: StillManifest): void {
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input, options) => {
    const address = input instanceof Request ? input.url : String(input)
    const url = new URL(address, window.location.href)
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/data/')) return originalFetch(input, options)
    if (url.pathname === '/data/manifest.json') {
      return new Response(JSON.stringify(pinnedManifest), { headers: { 'Content-Type': 'application/json' } })
    }
    try {
      const response = await originalFetch(input, options)
      if (response.status < 500) return response
      await response.body?.cancel()
    } catch (error) {
      if (options?.signal?.aborted || input instanceof Request && input.signal.aborted) throw error
    }
    // Eén nieuwe GET om een tijdelijke chunk-/proxyfout heen; tiles behouden hun HTTP-cache.
    return originalFetch(input, { ...options, cache: 'reload' })
  }
}
