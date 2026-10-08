self.onmessage = async (event: MessageEvent<{ key: string; data: ArrayBuffer }>) => {
  const { key } = event.data
  let data: ArrayBuffer
  try {
    data = await new Response(new Blob([event.data.data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
  } catch {
    data = new ArrayBuffer(0)
  }
  self.postMessage({ key, data }, { transfer: [data] })
}
