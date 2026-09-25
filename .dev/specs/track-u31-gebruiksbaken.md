# Track U31 — anoniem gebruiksbaken in de client (MIP-13) (claude opus 5.5)

Read first: `AGENTS.md`, `.dev/proposals/0013-anonieme-gebruiksmeting.md`
(het contract), `web/src/App.tsx` (waar modes, zoeken, geolocatie, favorieten,
scrubber-acties, versheidspaneel, About en thema gebeuren), `web/src/core/
manifest-refresh.ts` (eerste manifest van de sessie), `web/src/components/
About.tsx` (privacy-zin). Your LOG: `.dev/tracks/u31-gebruiksbaken/LOG.md`.
Branch `track/u31-gebruiksbaken` vanaf main. Eigen worktree.

## Opdracht

1. `core/usage.ts`: één module met een `UsageSession`-record (alleen booleans,
   kleine enums en bakken, exact de lijst uit MIP-13), `mark(feature)`-API,
   `sessionBody()` en `sendUsage()` via `navigator.sendBeacon('/hit', JSON)`
   op `visibilitychange → hidden` (eenmalig per sessie; bij terugkeer naar
   zichtbaar begint geen nieuwe sessie — één baken per pagina-leven). Geen
   tijdstempels, geen coördinaten, geen plaatsnamen, geen IDs, geen UA.
2. Het eerste manifest-verzoek van de sessie krijgt `?s=1` (alleen dat ene;
   caches blijven werken omdat Caddy de query negeert voor het bestand).
3. Instrumentatie: markeer op de plekken waar de feature echt gebruikt wordt
   (pin/ontpin modes, hoverfocus, zoekresultaat gekozen, geolocatie gelukt,
   favoriet opgeslagen, pin gesleept, afspelen, scrubben, bereikknop, historie
   geopend, versheidspaneel, About, themakeuze). Vormfactor en duurbak bij
   verzenden bepalen.
4. `?dev`: een regel "Gebruiksbaken: [body]" in het dev-paneel, zodat de PO
   ziet wat er precies zou worden verstuurd. Eigenaar U31, blijft (het is het
   privacycontract zichtbaar gemaakt).
5. About: privacyzin wordt "Geen tracking en geen advertenties. We tellen
   anoniem hoeveel sessies er zijn en welke functies gebruikt worden, zonder
   IP-adres of identificatie; je locatie en favorieten blijven in je eigen
   browser." Link naar `docs/analytics.md`-inhoud is niet nodig in de UI.
6. Tests: unit dat `sessionBody()` nooit velden buiten de whitelist bevat
   (schema-test), dat het baken één keer verstuurd wordt, en dat `?s=1` alleen
   op het eerste manifest staat. e2e (gericht): baken-POST verschijnt bij
   `page.close()`/visibility hidden en bevat de whitelist-velden.

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, gerichte e2e onder een slot
(eigen spec + perf.spec voor de warm-0-B-check: het baken mag géén extra
verzoek tijdens de sessie zijn). Synchrone exit statussen in de LOG. Draft-PR.
