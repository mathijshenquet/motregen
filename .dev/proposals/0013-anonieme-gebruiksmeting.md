# MIP-13 — Anonieme gebruiksmeting: bezoekers en featuregebruik, zelf gehost, zonder perf-impact

Status: accepted (PO 2026-09-25, "ok doe maar MIP-13")

## Voorstel: één sessiebaken naar onze eigen Caddy, geteld uit het log

Geen analytics-product, geen cookies, geen identifiers, geen extra service.

1. **Bezoek**: Caddy schrijft een JSON access-log **zonder `remote_ip`** (veld
   weggelaten in de logconfig, dus er staat nooit een IP op schijf). Sessies
   tellen we als het aantal `/data/manifest.json`-verzoeken met `?s=1` — de
   client zet dat alleen op het eerste manifest van een sessie. Geen IP nodig
   om te tellen; wat we verliezen is "unieke bezoekers over dagen", en dat is
   precies het stuk dat identificerend zou zijn.
2. **Featuregebruik**: één `navigator.sendBeacon('/hit', body)` per sessie op
   `pagehide`/`visibilitychange:hidden` (dus nooit tijdens gebruik: nul
   perf-impact; het is één POST van < 200 bytes als de tab dichtgaat). Body =
   een vaste set booleans/kleine tellers, allemaal niet-identificerend:
   - modes gepind: gevoel / wind (ja/nee), isolijnfocus via hover gebruikt;
   - zoeken gebruikt, geolocatie gebruikt (alleen "ja/nee", nooit de plaats),
     favoriet opgeslagen, pin gesleept;
   - scrubber: afgespeeld, gescrubd, welk bereik (+3/+8/+24/alles), historie
     geopend;
   - versheidspaneel / About geopend, thema (licht/donker/systeem);
   - vormfactor (`coarse`-pointer ja/nee, breedteklasse < 430 / < 960 / ≥ 960),
     sessieduur in bakken (< 1 min, 1–5, 5–30, > 30).
   Caddy beantwoordt `/hit` met 204 en logt de body als één regel (of een
   10-regels Rust-endpoint in de ingest-binary die naar een append-only
   bestand schrijft — Caddy-only heeft de voorkeur: nul code aan de serverkant).
3. **Rapport**: een dagelijkse `systemd`-timer op de prod-box telt met `jq`
   per dag: sessies, en per feature het percentage sessies dat hem gebruikte,
   naar een statisch `stats.html` op een privé-pad (basic auth of alleen via
   SSH). Logs 30 dagen bewaren, daarna weg; het dagrapport blijft (bevat
   alleen aggregaten).

## Waarom dit en niet Umami/Plausible

Umami/Plausible zijn zelf te hosten en cookieloos, maar ze (a) laden een
script en sturen op elke paginaweergave/gebeurtenis een verzoek tijdens het
gebruik, (b) hashen IP+UA tot een dag-identifier — netjes, maar wél een
pseudoniem, dus niet "volledig geanonimiseerd" in de strikte zin, en (c)
brengen een Postgres (Umami) of Postgres+ClickHouse (Plausible) mee. Voor
"ongeveer hoeveel en wat gebruiken ze" is één baken per sessie in ons eigen
log genoeg en blijft de About-belofte "geen tracking" waar: er is niets dat
één sessie aan een andere koppelt.

## Wat we niet kunnen zien (bewust)

Terugkerende gebruikers, retentie, per-gebruiker paden. Wil de PO dat ooit,
dan is dat een nieuwe MIP en een aanpassing van de About-tekst.

## Uitvoering

Twee kleine tracks als dit wordt aangenomen: (a) client: sessiestatus
verzamelen in één module (`core/usage.ts`) + baken, unit-tests dat de body
nooit coördinaten/namen/tijdstempels bevat; (b) deploy: Caddy-logconfig
zonder IP, `/hit`, jq-rapport + timer in de NixOS-module, `docs/analytics.md`
met de exacte veldenlijst (de veldenlijst is het privacy-contract).

## Decision (PO 2026-09-25)

Aangenomen zoals hierboven. Aanvullende besluiten op PO-vragen:

- **Opslag**: JSONL, één bestand per dag (`/var/lib/motregen-usage/usage/YYYY-MM-DD.jsonl` —
  eigen map, want de ingest chownt `/var/lib/motregen` recursief bij elke start (U32-bevinding),
  Caddy-log met alleen het bakenveld en het manifest-sessievlag, zonder IP), 30 dagen
  bewaard en daarna verwijderd door de timer. Het dagelijkse **aggregaat** is een klein
  JSON-bestand per dag (`/var/lib/motregen-usage/stats/YYYY-MM-DD.json`, honderden bytes) dat blijft en nachtelijks
  naar de dev-host (ageq-mthq) wordt gekopieerd via de bestaande SSH-route — dat is de
  durable kopie; de ruwe regels zijn bewust vergankelijk.
- **Cloudflare**: de site staat al achter Cloudflare-proxy, dus de zone-analytics in het
  dashboard (verzoeken, bandbreedte, landen, "unique visitors" op IP aan de edge) is gratis en
  kost nul werk als grove tweede meter. We sturen er niets extra's heen en gebruiken hun
  Web Analytics-script niet (derde-partijscript, valt buiten "eigen beheer").
- **Google**: geen analytics-koppeling. Vindbaarheid is een apart, klein track (U33):
  metadata in `index.html`, `robots.txt`, en Search Console via een DNS-TXT-verificatie zodat
  zoekvertoningen/klikken zichtbaar zijn zonder iets op de site te laden.
- Tracks: U31 (client-baken), U32 (deploy: log, `/hit`, aggregaat, docs), U33 (vindbaarheid).

- **U32-bevindingen (2026-09-25)**: prod schreef al een vhost-access-log mét IP (nixpkgs-default);
  U32 zet dat uit, oude bestanden wist de PO zelf (commando in `docs/deploy.md`). Cloudflare cachet
  `/data/*` 15 s, dus het sessiemanifest (`?s=1`) krijgt `Cache-Control: no-store`. Body bevat `v: 1`.
