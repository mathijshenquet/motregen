declare global {
  interface Window {
    __motregenInitialManifest?: { url: string; response: Promise<Response> }
  }
}

export function fetchInitialManifest(url: URL, cache: RequestCache): Promise<Response> {
  const initial = window.__motregenInitialManifest
  delete window.__motregenInitialManifest
  if (cache === 'default' && initial?.url === url.href) return initial.response
  return fetch(url, { cache })
}
