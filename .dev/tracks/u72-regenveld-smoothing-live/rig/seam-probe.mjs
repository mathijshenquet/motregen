// U72: welke framepaar overspant een bronovergang en welk bewegingsveld hoort erbij? Leest manifest + headers.
const base = process.argv[2] ?? 'http://127.0.0.1:4320/data/'
const manifest = await (await fetch(base + 'manifest.json')).json()
const now = Date.parse(manifest.now)
const priority = { harmonie: 0, uv: 0, seamless: 1, nowcast: 2, rtcor: 3 }
const frames = new Map()
for (const chunk of manifest.chunks) {
  if (chunk.field && chunk.field !== 'rain_rate') continue
  const bytes = new Uint8Array(await (await fetch(base + chunk.url, { headers: { Range: `bytes=0-${chunk.header_len - 1}` } })).arrayBuffer())
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8)))
  const withMotion = header.frames.map((frame) => frame.motion ? 'm' : '-').join('')
  console.log(`${chunk.source.padEnd(8)} ${chunk.times[0]} … ${chunk.times.at(-1)} (${chunk.times.length}) motion_grid ${JSON.stringify(header.motion_grid)} ${withMotion}`)
  chunk.times.forEach((time, frameIndex) => {
    const epoch = Date.parse(time)
    const current = frames.get(epoch)
    if (!current || priority[chunk.source] > priority[current.source]) frames.set(epoch, { epoch, source: chunk.source, frameIndex, motion: !!header.frames[frameIndex].motion })
  })
}
const timeline = [...frames.values()].sort((left, right) => left.epoch - right.epoch)
const lead = (epoch) => `${((epoch - now) / 3_600_000).toFixed(2)} u`
for (let index = 1; index < timeline.length; index++) {
  const left = timeline[index - 1], right = timeline[index]
  if (left.source === right.source) continue
  for (let near = Math.max(1, index - 1); near <= Math.min(timeline.length - 1, index + 1); near++) {
    const a = timeline[near - 1], b = timeline[near]
    console.log(`${near === index ? 'NAAD' : '    '} ${a.source}#${a.frameIndex} (${lead(a.epoch)}, motion ${a.motion}) → ${b.source}#${b.frameIndex} (${lead(b.epoch)}, motion ${b.motion}) · stap ${(b.epoch - a.epoch) / 60_000} min`)
  }
}
