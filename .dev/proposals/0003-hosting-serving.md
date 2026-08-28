# MIP-3: hosting & serving — ultra goedkoop

Status: draft
Auteur: orchestrator (fable), 2026-08-28

## 1. Het probleem

motregen.nl moet zo goedkoop mogelijk draaien, ook als het op een regenachtige
zaterdag ineens druk wordt. De PO noemt Hetzner en/of een gratis CDN
(Cloudflare), en vraagt of we het ontwerp daarop moeten inrichten — en of we
bij self-hosting alles in memory moeten houden en met juiste cache-headers
goedkoop moeten sturen.

## 2. Eerder werk / analyse

**De architectuur is al CDN-vormig.** MIP-1/2 geven ons: een kleine, elke ~5
min muterende `manifest.json`, en verder uitsluitend **immutable chunks**
(URL bevat bron + run-tijdstempel; een chunk verandert nooit meer na
schrijven). Dat is precies de vorm waar HTTP-caching en CDN's voor gebouwd
zijn — er valt niets te "inrichten", alleen headers goed te zetten.

**Volume-bierviltje.** Eén volledige tijdlijn (3 u history + 2 u nowcast +
24 u AROME ≈ 85 frames à grofweg 5–50 KB gecomprimeerd) is enkele MB's; een
gebruikssessie haalt eenmalig de timeline + daarna elke 5 min een manifestje
en één verse chunk. Zelfs 100k sessies/dag is origin-side verwaarloosbaar
zodra een CDN ervoor staat, en Hetzners 20 TB inbegrepen egress is sowieso
al ordes te veel voor ons.

**In-memory server?** Niet nodig: de hele hot set is enkele MB's, dus de
kernel page cache houdt hem sowieso permanent in RAM. Een statische server
(Caddy/nginx) serveert dat op memory-snelheid zonder dat wij een custom
in-memory-server hoeven te schrijven en onderhouden. De winst zit niet in
het serveerproces maar in het **HTTP-cachecontract**:

- chunks: `Cache-Control: public, max-age=31536000, immutable`
- manifest: `Cache-Control: public, max-age=15, stale-while-revalidate=60`
- `ETag` op het manifest (client pollt goedkoop met If-None-Match → 304)
- CORS open (`Access-Control-Allow-Origin: *`), `Accept-Ranges: bytes`
  (nodig voor de Range-requests uit MIP-2)
- géén content-encoding op chunks (payload is al zstd; dubbel comprimeren
  is verspilde CPU)

**Cloudflare free.** Proxied DNS + cache-rules ("cache everything" voor
`/data/*`) legt vrijwel al het verkeer op Cloudflares conto, gratis; Range-
requests en immutable caching werken daar gewoon. Risico's: ToS staat
non-HTML asset-serving formeel alleen "in dienst van de site" toe — een
weer-app die zijn eigen dataframes serveert valt daar ruim binnen; lock-in is
verwaarloosbaar (het is DNS + een cache, origin blijft van ons).

## 3. Aanbeveling

- **Origin = één goedkope box** die alles doet: ingest-daemon schrijft naar
  disk, Caddy serveert statisch met bovenstaand headercontract. Een Hetzner
  CAX11 (~€4/mnd, ARM) is al ruim; een bestaande eigen box is net zo goed.
  NixOS-configuratie zodat dev (ageq-mthq) en prod identiek zijn.
- **Cloudflare free ervoor** (proxied DNS voor motregen.nl, cache-rules op
  `/data/*` en de statische frontend-assets). De frontend zelf is een
  statische Vite-build — die kan van dezelfde origin komen; aparte "free
  static hosting" (Pages e.d.) is een optie maar splitst deploy zonder
  noodzaak.
- **Geen custom in-memory-server.** Page cache + juiste headers geeft
  hetzelfde resultaat met nul extra code. Als metingen ooit anders zeggen,
  is dat een latere MIP.
- **Nu al inrichten?** Alleen dit: de ingest schrijft run-gestempelde,
  nooit-muterende chunk-bestandsnamen (staat al in het contract) en de
  serving-config wordt een klein, gecommit Caddy-bestand met het
  headercontract. Verder verandert er niets aan T1–T3.
- Basemap-tiles blijven extern (OpenFreeMap); als dat ooit knelt is
  self-hosted PMTiles achter dezelfde CDN de uitwijk (MIP-1).

## 4. Open vragen

1. **Cloudflare free ervoor: akkoord?** (Aanbevolen: ja. Alternatief: kale
   Hetzner met alleen Caddy — werkt ook, maar dan betaal je pieken zelf in
   bandbreedte/latency.)
2. **Welke box wordt prod**: nieuwe Hetzner CAX11, of een bestaande eigen
   box? (Geen haast — nodig vanaf T4/T5; dev blijft ageq-mthq.)
3. **Frontend-assets van dezelfde origin** (aanbevolen, één deploy) of via
   Cloudflare Pages?

## Changelog

- 2026-08-28: draft.
