// Pollt prod-manifest elke 10 s; logt per manifestwissel de leeftijd van het nieuwste rtcor-frame,
// generated→ontvangst en de CDN-headers. Gebruik: node poll-manifest.mjs <minuten> > out.jsonl
const url = 'https://motregen.nl/data/manifest.json'
const minutes = Number(process.argv[2] ?? 40)
const end = Date.now() + minutes * 60_000
let lastGenerated
while (Date.now() < end) {
  const sent = Date.now()
  try {
    const response = await fetch(`${url}?t=${sent}`, { headers: { 'user-agent': 'Mozilla/5.0 motregen-u17-probe', 'cache-control': 'no-cache' } })
    const received = Date.now()
    const manifest = await response.json()
    const radar = Math.max(...manifest.chunks.filter((c) => c.source === 'rtcor').flatMap((c) => c.times.map(Date.parse)))
    const generated = Date.parse(manifest.generated)
    const row = {
      at: new Date(received).toISOString(), generated: manifest.generated, radar: new Date(radar).toISOString(),
      radarAgeMin: +((received - radar) / 60_000).toFixed(2), sinceGeneratedS: +((received - generated) / 1000).toFixed(1),
      pubDelayS: +((generated - radar) / 1000).toFixed(1), status: response.status,
      cache: response.headers.get('cf-cache-status'), age: response.headers.get('age'),
      etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified'), cacheControl: response.headers.get('cache-control'),
      changed: manifest.generated !== lastGenerated,
    }
    lastGenerated = manifest.generated
    console.log(JSON.stringify(row))
  } catch (error) { console.log(JSON.stringify({ at: new Date().toISOString(), error: String(error) })) }
  await new Promise((resolve) => setTimeout(resolve, 10_000))
}
