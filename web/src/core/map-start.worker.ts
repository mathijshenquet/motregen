// Een server die .gz met `Content-Encoding: gzip` serveert (vite preview) levert de tegel al uitgepakt af;
// alleen bij het gzip-magic (1f 8b) nog zelf uitpakken, anders faalde de z4-startkaart stil (Firefox/4330).
const isGzip = (buffer: ArrayBuffer): boolean => {
  const bytes = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength))
  return bytes.length === 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
}

self.onmessage = async (event: MessageEvent<{ key: string; data: ArrayBuffer }>) => {
  const { key } = event.data
  let data: ArrayBuffer
  try {
    data = isGzip(event.data.data)
      ? await new Response(new Blob([event.data.data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
      : event.data.data
  } catch {
    data = new ArrayBuffer(0)
  }
  self.postMessage({ key, data }, { transfer: [data] })
}
