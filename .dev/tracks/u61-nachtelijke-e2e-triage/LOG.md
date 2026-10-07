# U61 — nachtelijke e2e-triage

## 2026-10-08 00:20 UTC — start

- Specificatie gelezen; branch fast-forward naar `09d1364` (bestand na de lege spec-commit `32f4cda`). Devenv/direnv is actief; bash-runner, pnpm beschikbaar.
- Op verzoek van de orkestrator staat deze LOG committed, append-only; dit wijkt expliciet af van de algemene ignored-LOG-regel.
- Nachtelijke uitgangsstand: 30 failed, 84 passed, 63 skipped, exit 1 (15,6 min). Overgedragen staart: `nightly-e2e-2026-10-07.txt` naast deze LOG. Bronartefacten: `/home/mathijs/motregen/web/tmp/playwright-results/`.
- Startload 1/5/15 min: 4,08 / 10,99 / 17,11. Deze track gebruikt poorten 4396/8396 en de e2e-slotwrapper. De trackspecificatie autoriseert gerichte mobiele tests en één volledige suite als uitzondering op de normale desktop-workerregel.
- Volgende stap: fouten en beelden van precies de 30 nachtelijke gevallen lezen, classificeren en oorzaken gericht reproduceren; vroege draft-PR na eerste coherente wijziging.

## 2026-10-08 00:24 CEST — triage van de nachtelijke artefacten

- Correctie startnotitie: de fast-forward nam ook de inmiddels verschenen main-logcommit mee; werkbasis is `1c92c3f`, na `09d1364`. De hostklok staat in CEST (UTC+2); de startnotitie vermeldde abusievelijk UTC. Volgende tijdstempels gebruiken CEST.
- Alle 30 error-contexts ingelezen; screenshots bekeken in drie genummerde contactvellen in ignored `tmp/u61/`. De beelden bevestigen de achtergrond-fixture en de nieuwe Tabel-kop. Geen onbewezen flake-classificaties.
- `pnpm install --frozen-lockfile`: exit 0. Gerichte pin-nulrun loopt; hostload inmiddels >8, dus geen performance-conclusies uit die run.
- Eerste wijzigingen passen alleen de testopzet aan: PMTiles via de eigen stijl in U59-tests; U42-koppen; uitgeklapt zoekveld conform U34/U58; exacte strookrand i.p.v. 1 px in de continue tijdlijn; MapLibre-anker i.p.v. onderkant van de schaduw-SVG; kale start-URL voor geolocatie conform U26/U44. Budgetten ongewijzigd.

| Nr | Rode test / profiel | Klasse | Fout en oorzaak | Stand |
| --- | --- | --- | --- | --- |
| 1 | basemap-cache-warme-basiskaart-zonder-netwerk-390px / desktop | d — testintegratie | 0 PMTiles-responses/cachekeys: standaard e2e-build gebruikt de achtergrond-fixture; U59-tests verwachtten de eigen kaart (MIP-21). | Gericht verifiëren |
| 2 | basemap-cache-warme-basiskaart-zonder-netwerk-1280px / desktop | d — testintegratie | 0 PMTiles-responses/cachekeys: standaard e2e-build gebruikt de achtergrond-fixture; U59-tests verwachtten de eigen kaart (MIP-21). | Gericht verifiëren |
| 3 | basemap-basiskaart-1280px-light / desktop | d — testintegratie | 0 PMTiles-responses/cachekeys: standaard e2e-build gebruikt de achtergrond-fixture; U59-tests verwachtten de eigen kaart (MIP-21). | Gericht verifiëren |
| 4 | basemap-basiskaart-1280px-dark / desktop | d — testintegratie | 0 PMTiles-responses/cachekeys: standaard e2e-build gebruikt de achtergrond-fixture; U59-tests verwachtten de eigen kaart (MIP-21). | Gericht verifiëren |
| 5 | basemap-basiskaart-390px-light / desktop | d — testintegratie | 0 PMTiles-responses/cachekeys: standaard e2e-build gebruikt de achtergrond-fixture; U59-tests verwachtten de eigen kaart (MIP-21). | Gericht verifiëren |
| 6 | basemap-basiskaart-390px-dark / desktop | d — testintegratie | 0 PMTiles-responses/cachekeys: standaard e2e-build gebruikt de achtergrond-fixture; U59-tests verwachtten de eigen kaart (MIP-21). | Gericht verifiëren |
| 7 | pin-navigation-desktop-dra-30892-edge-a-double-click-centres / desktop | b — onjuist meetanker | Exact 9 px: test meet SVG-onderkant inclusief schaduw, terwijl MapLibre ankert op elementmidden +14 px. Productpin hoeft niet verschoven te worden. | Gericht verifiëren |
| 8 | pin-navigation-with-geoloc-af7b9-t-location-without-a-prompt / desktop | b — U44 | reload heropent de inmiddels gesynchroniseerde plaats-permalink Groningen; een gedeelde plaats gaat bewust vóór geolocatie (U44). Teststart op kale URL. | Gericht verifiëren |
| 9 | basemap-cache-warme-basiskaart-zonder-netwerk-390px / mobile-4g | d — testintegratie | 0 PMTiles-responses/cachekeys: standaard e2e-build gebruikt de achtergrond-fixture; U59-tests verwachtten de eigen kaart (MIP-21). | Gericht verifiëren |
| 10 | basemap-cache-warme-basiskaart-zonder-netwerk-1280px / mobile-4g | d — testintegratie | 0 PMTiles-responses/cachekeys: standaard e2e-build gebruikt de achtergrond-fixture; U59-tests verwachtten de eigen kaart (MIP-21). | Gericht verifiëren |
| 11 | basemap-basiskaart-1280px-light / mobile-4g | d — testintegratie | 0 PMTiles-responses/cachekeys: standaard e2e-build gebruikt de achtergrond-fixture; U59-tests verwachtten de eigen kaart (MIP-21). | Gericht verifiëren |
| 12 | basemap-basiskaart-1280px-dark / mobile-4g | d — testintegratie | 0 PMTiles-responses/cachekeys: standaard e2e-build gebruikt de achtergrond-fixture; U59-tests verwachtten de eigen kaart (MIP-21). | Gericht verifiëren |
| 13 | basemap-basiskaart-390px-light / mobile-4g | d — testintegratie | 0 PMTiles-responses/cachekeys: standaard e2e-build gebruikt de achtergrond-fixture; U59-tests verwachtten de eigen kaart (MIP-21). | Gericht verifiëren |
| 14 | basemap-basiskaart-390px-dark / mobile-4g | d — testintegratie | 0 PMTiles-responses/cachekeys: standaard e2e-build gebruikt de achtergrond-fixture; U59-tests verwachtten de eigen kaart (MIP-21). | Gericht verifiëren |
| 15 | focus-tapping-the-wind-heading-pins-wind-focus-on-touch / mobile-4g | b — U42 | Selector Tabel openen bestaat niet meer; Tabel staat in de koprij en een moduskeuze toont de kaart. | Gericht verifiëren |
| 16 | focus-tapping-the-column-h-44c51-uch-and-measures-frame-rate / mobile-4g | b — U42 | Selector Tabel openen bestaat niet meer; Tabel staat in de koprij en een moduskeuze toont de kaart. | Gericht verifiëren |
| 17 | freshness-fresh-radar-read-cc8ff-h-the-scan-time-and-its-age / mobile-4g | b — U34/U58 | Gesloten zoekicoon bevat bewust verborgen plaatsnaam; scrollWidth van de gesloten input zegt niets over de leesbare open zoekpil. | Gericht verifiëren |
| 18 | freshness-dragging-the-clo-4ee29-anel-shows-the-source-strip / mobile-4g | b — U56/U58 | 1 px binnen de continue bronstrook is mobiel ruim een halve radarstap; correcte cursor rondt naar 1 af. Eindpunt meten op x=0. | Gericht verifiëren |
| 19 | perf-user-journey-measures-performance-and-cache-behaviour / mobile-4g | budget — te onderzoeken | 16 scrubtransfers, budget 11; oorspronkelijke run load onbekend. Geen budgetaanpassing; oorzaak en rustige herhaling volgen. | Gericht verifiëren |
| 20 | pin-navigation-touch-one-f-02986-pinch-and-pan-the-pin-drags / mobile-4g | b — onjuist meetanker | Exact 9 px: test meet SVG-onderkant inclusief schaduw, terwijl MapLibre ankert op elementmidden +14 px. Productpin hoeft niet verschoven te worden. | Gericht verifiëren |
| 21 | table-mobile-previews-the--37ceb-othly-between-table-and-map / mobile-4g | b — U42 | Selector Tabel openen bestaat niet meer; Tabel staat in de koprij en een moduskeuze toont de kaart. | Gericht verifiëren |
| 22 | basemap-cache-warme-basiskaart-zonder-netwerk-390px / mobile-fast-3g | d — testintegratie | 0 PMTiles-responses/cachekeys: standaard e2e-build gebruikt de achtergrond-fixture; U59-tests verwachtten de eigen kaart (MIP-21). | Gericht verifiëren |
| 23 | basemap-cache-warme-basiskaart-zonder-netwerk-1280px / mobile-fast-3g | d — testintegratie | 0 PMTiles-responses/cachekeys: standaard e2e-build gebruikt de achtergrond-fixture; U59-tests verwachtten de eigen kaart (MIP-21). | Gericht verifiëren |
| 24 | basemap-basiskaart-1280px-light / mobile-fast-3g | d — testintegratie | 0 PMTiles-responses/cachekeys: standaard e2e-build gebruikt de achtergrond-fixture; U59-tests verwachtten de eigen kaart (MIP-21). | Gericht verifiëren |
| 25 | basemap-basiskaart-1280px-dark / mobile-fast-3g | d — testintegratie | 0 PMTiles-responses/cachekeys: standaard e2e-build gebruikt de achtergrond-fixture; U59-tests verwachtten de eigen kaart (MIP-21). | Gericht verifiëren |
| 26 | basemap-basiskaart-390px-light / mobile-fast-3g | d — testintegratie | 0 PMTiles-responses/cachekeys: standaard e2e-build gebruikt de achtergrond-fixture; U59-tests verwachtten de eigen kaart (MIP-21). | Gericht verifiëren |
| 27 | basemap-basiskaart-390px-dark / mobile-fast-3g | d — testintegratie | 0 PMTiles-responses/cachekeys: standaard e2e-build gebruikt de achtergrond-fixture; U59-tests verwachtten de eigen kaart (MIP-21). | Gericht verifiëren |
| 28 | freshness-fresh-radar-read-cc8ff-h-the-scan-time-and-its-age / mobile-fast-3g | b — U34/U58 | Gesloten zoekicoon bevat bewust verborgen plaatsnaam; scrollWidth van de gesloten input zegt niets over de leesbare open zoekpil. | Gericht verifiëren |
| 29 | freshness-dragging-the-clo-4ee29-anel-shows-the-source-strip / mobile-fast-3g | b — U56/U58 | 1 px binnen de continue bronstrook is mobiel ruim een halve radarstap; correcte cursor rondt naar 1 af. Eindpunt meten op x=0. | Gericht verifiëren |
| 30 | perf-user-journey-measures-performance-and-cache-behaviour / mobile-fast-3g | budget — te onderzoeken | 16 scrubtransfers, budget 14; oorspronkelijke run load onbekend. Geen budgetaanpassing; oorzaak en rustige herhaling volgen. | Gericht verifiëren |

## 2026-10-08 00:25 CEST — eerste gerichte wijziging

- Pin-nulrun: `cd web && MOTREGEN_E2E_PORT=4396 MOTREGEN_E2E_DATA_PORT=8396 pnpm e2e e2e/pin-navigation.spec.ts --project desktop --project mobile-4g --output tmp/u61-pin-before`, exit 1: dezelfde drie failures (9 px op beide pins, Groningen bij reload); 1 passed, 4 skipped. Reproduceerbaar gedrag, geen flakeclaim.
- `pnpm --dir web typecheck`: exit 0. Gerichte suite van alle zes geraakte specs op de drie profielen gestart; unit loopt. Details en ruwe uitvoer staan in ignored `tmp/u61/` en `web/tmp/u61-*`.
- Coherente eerste commit met testcontract-reparaties en de triagetabel; draft-PR nu openen met verificatie expliciet pending. Volgende stap: gerichte receipts, performance-regressie op rustige host analyseren, één volledige gate.

## 2026-10-08 00:29 CEST — vervolgdiagnose

- Draft-PR: https://github.com/mathijshenquet/motregen/pull/88; eerste push `1129d34` geverifieerd met `git ls-remote`. Unit na synthgen: `pnpm --dir web test`, exit 0, 72 bestanden / 478 tests. Eerste unitpoging liep tegelijk met synthgen en raakte het tijdelijk ontbrekende manifest; herhaling pas na generatie herstelt dat zonder codewijziging.
- PMTiles-beelden desktop 4/4 groen. Cachetest bereikt nu de cross-originstap: de Vite-preview exposeert Content-Range niet aan CORS-responses, zodat de Workbox-plugin ze bewust niet cachet. Productfix in `vite.config.ts`: dezelfde CORS/rangeheaders als de bestaande productie-Caddy. Cachetest controleert de leesbare Content-Range expliciet; bestaande offline-bytevergelijking blijft staan.
- Correctie triage nr 7/20: de 9 px blijken bij nader tracelezen primair een **U44-startopzetfout**: opgeslagen camera (5,18 / 52,1) maar na `reload` wordt `?plaats=De+Bilt` opgelost naar (5,19278915 / 52,10306093). De eerste pin staat daardoor al naast het kaartmidden. `openZoomed` gaat nu met opgeslagen view naar een kale URL. Het correcte MapLibre-anker blijft nuttig voor de absolute klikmeting; het verklaart niet de relatieve 9 px. Geen productpin verplaatst.
- Perf-traces van beide nachtelijke mobiele gevallen: precies 16 requests na Home. De extra zes zijn temp_c, cloud_frac en gust_ms, elk in de historiechunk en de actuele run. Dit past bij de U42/U58-previewrij die de cursor volgt en haar zichtbare velden laadt (`tablePreviewEpoch` / `peekRows` / `loadViewWindow`). Het is geen tijdmeting en wordt niet als load-flake bestempeld. Budgetten 11/14 blijven op expliciet specverzoek onveranderd; rustige herhaling en volledige suite moeten nog volgen.
- Hostload tijdens gerichte functionele suite ~17–22; bot-main heeft een actieve Chromium en de andere track eveneens. Performance-gate wacht op load <8. Volgende stap: gerichte mobiele receipts afronden, cache/pin opnieuw starten met de vervolgreparaties.

## 2026-10-08 00:29 CEST — mobiele voortgang

- U42-touchroute Wind groen in de gerichte mobile-4g-run. Beide basiskaartthema's op 1280/390 px inmiddels 8/8 groen over desktop en mobile-4g. De eerste gerichte suite serveert nog de Vite-config van vóór de CORS-fix; cachefailures aan de cross-originstap zijn daar verwacht en worden in een nieuwe run geverifieerd.
- Browsertrace bewijst de startplek van de pinstest: camera (5,18 / 52,1), locatie (5,19278915 / 52,10306093), zoom 9. De geolocatietest met kale URL is inmiddels groen. Pin-startopzet opnieuw gecorrigeerd vóór de volgende run.
- Productiebuild gestart; deze gebruikt de eigen `web/dist` van de worker en raakt de e2e-preview in `tmp/e2e-dist` niet.

## 2026-10-08 00:33 CEST — eerste brede gerichte receipt

- `cd web && MOTREGEN_E2E_PORT=4396 MOTREGEN_E2E_DATA_PORT=8396 pnpm e2e e2e/basemap.spec.ts e2e/basemap-cache.spec.ts e2e/focus.spec.ts e2e/freshness.spec.ts e2e/pin-navigation.spec.ts e2e/table.spec.ts --project desktop --project mobile-4g --project mobile-fast-3g --output tmp/u61-targeted`: **exit 1**, 44 passed / 9 failed / 34 bestaande skips (8,5 min).
- Daarmee basiskaartbeelden 12/12 groen; alle vier freshness-gevallen op alle drie profielen groen; beide mobiele focusgevallen groen; geolocatie groen. Over: zes cross-origincachegevallen (oude preview-config), twee pincenteringen (oude startopzet), mobiele previewrij-assertie. Alle oorzaken beschreven en vervolgreparaties aanwezig.
- Bij triage nr 21 kwam achter de selectorfout ook een oude geometrie-assertie aan het licht: de huidige rij wordt nu geheel getoond (onderkant 696,5 op 727 px viewport), conform U42's circa 1,2 rij; de volgende is afgesneden. Test controleert nu beide rijen, zonder toleranties/time-outs te vergroten.
- `pnpm --dir web build`: exit 0. Vervolgrun van alleen cache/pin/table op drie profielen gestart met de nieuwe preview-config; ruwe uitvoer `web/tmp/u61-followup.txt`.

## 2026-10-08 00:36 CEST — functionele reparaties groen

- Vervolgrun: `cd web && MOTREGEN_E2E_PORT=4396 MOTREGEN_E2E_DATA_PORT=8396 pnpm e2e e2e/basemap-cache.spec.ts e2e/pin-navigation.spec.ts e2e/table.spec.ts --project desktop --project mobile-4g --project mobile-fast-3g --output tmp/u61-followup`: **exit 0**, 19 passed / 14 bestaande skips (2,2 min).
- Hiermee alle 28 oorspronkelijke functionele failures gericht groen op hun oorspronkelijke profiel. Geen skips toegevoegd en geen asserties/time-outs/budgetten verruimd. De cross-origincache bewijst de CORS-productfix met leesbare Content-Range, gevulde SW-cache en bytegelijke offline-response.
- Load na het sluiten van de suite 8,55; gerichte performance-run wacht buiten de e2e-wrapper tot 1-minuut-load <8. Startload staat in `web/tmp/u61-perf-quiet.txt`; command: `MOTREGEN_E2E_PORT=4396 MOTREGEN_E2E_DATA_PORT=8396 pnpm e2e e2e/perf.spec.ts --project mobile-4g --project mobile-fast-3g --output tmp/u61-perf`.
- Daarna één volledige suite, eveneens pas bij load <8; nog geen volledige run op deze branch gestart.

## 2026-10-08 00:38 CEST — rustige performance-receipt

- Gerichte mobiele perf-run: **exit 1**, 2 passed / 2 failed (49 s), startload 5,18; load na afloop 7,62. Beide failures opnieuw exact **16 scrubtransfers**, tegenover bestaande budgetten 11 (4G) en 14 (Fast 3G), bij `perf.spec.ts:147`.
- Dit is dus geen bewezen timing-/load-flake: de 16 transfers herhalen de nachtelijke traces. De zes tabelrij-requests bevatten samen 24.320 B payload (temp_c, cloud_frac en gust_ms, historie + actuele run). U51 kalibreerde vóór de U42-preview; die preview vraagt nu bij Home ook haar zichtbare waarden. Geen overbodige dubbele Range gevonden in die zes requests.
- Budgetten en `perf.spec.ts` blijven ongewijzigd volgens de expliciete opdracht. De volledige gate kan hierdoor nog rood blijven; dat zal als open budgetpunt worden gerapporteerd, zonder groene claim.
- Tweede coherente commit/push: Vite-CORS-productfix plus vervolgcorrecties aan teststart en previewrij. Volgende stap: volledige suite één keer, start bij load <8, met loadlog en geobserveerde exitstatus.

## 2026-10-08 00:39 CEST — volledige gate gestart

- Volledige suite op codecommit `df1f8b8`, drie profielen, gestart bij 1-minuut-load **3,63**. Repro: `cd web && MOTREGEN_E2E_PORT=4396 MOTREGEN_E2E_DATA_PORT=8396 pnpm e2e --output tmp/u61-full`; runner bewaart status, print `FULL-E2E-EXIT` en verlaat met dezelfde status. Eén volledige run op deze branch.
- Load elke 20 s naar `web/tmp/u61-full-load.txt` (UTC-tijdstempels); quiet-start naar `web/tmp/u61-full-quiet.txt`; suite-uitvoer naar `web/tmp/u61-full.txt`. Nog geen exitstatus ontvangen.
- Rustige gerichte perf-coldmetingen: 4G 1.812,1 ms / 654.439 B passief; Fast 3G 5.080 ms / 672.265 B passief. Deze grenzen passeren; alleen het scrubtransferbudget faalt in beide profielen.
- Tweede push `df1f8b8` bevestigd; draft-PR #88 bijgewerkt met de functionele receipts en expliciet rode budgetstatus. Geen merge uitgevoerd.

## 2026-10-08 00:50 CEST — definitieve triage en volledige receipt

- Volledige suite op codecommit `df1f8b8`: **112 passed / 2 failed / 63 bestaande skips (10,0 min), SYNCHROON waargenomen exit 1, FULL-E2E-EXIT: 1**. Geen nieuwe skips. Alle 30 oorspronkelijke gevallen hieronder expliciet tegen de volledige uitvoer gematcht: 28 groen, 2 budgetfailures.
- Repro: `cd web && MOTREGEN_E2E_PORT=4396 MOTREGEN_E2E_DATA_PORT=8396 pnpm e2e --output tmp/u61-full`. Ruwe uitvoer `web/tmp/u61-full.txt`, failuretraces/screenshots/error-contexts in `web/tmp/u61-full/`; eenmalige volledige run.
- Load: gestart bij 3.63, tijdens de run 3.63–21.39 (20 s samples). De host bleef gedurende de browserrun dus niet continu onder 8. De losse mobiele perf-herhaling startte wel bij 5,18 en eindigde bij 7,62; ook daar beide keren exact 16 transfers. Geen load-/timing-flakeclaim.
- mobile-4g perf-navigatie 2026-10-07T22:45:47.854Z: dichtstbijzijnde loadsample 21.39 op 2026-10-07T22:45:44Z.
- mobile-fast-3g perf-navigatie 2026-10-07T22:48:27.217Z: dichtstbijzijnde loadsample 15.38 op 2026-10-07T22:48:24Z.
- Volledige cold/passief: desktop 362,6 ms / 880.002 B, 4G 1.789,4 ms / 654.439 B, Fast 3G 5.036 ms / 672.265 B. Desktop warm 332,5 ms / 0 B, scrub 15 (budget 19), sessie 2.065.711 B. Geen tijd- of bytebudgetfailure; de mobiele journeys stoppen bij scrubtransfers 16 >11/>14 en leveren daarom geen latere warm-/sessiemeting.
- Web-gates: `pnpm --dir web typecheck` exit 0; `pnpm --dir web test` exit 0 (72 bestanden, 478 tests); `pnpm --dir web build` exit 0. Build bevat de uiteindelijke Vite-headerfix. Latere wijzigingen betreffen alleen testopzet/documentatie/LOG; alle uiteindelijke tests zijn door de volledige suite uitgevoerd.
- `docs/perf.md` beschrijft de uitzondering voor eigen PMTiles-stijl in kaart-/cachespecs. Geen nieuwe feature, timeoutverruiming of budgetaanpassing.

| Profiel | Groen | Rood | Bestaande skips |
| --- | ---: | ---: | ---: |
| desktop | 53 | 0 | 6 |
| mobile-4g | 34 | 1 | 24 |
| mobile-fast-3g | 25 | 1 | 33 |

| Nr | Oorspronkelijke rode test | Profiel | Klasse / oorzaak | Volledige suite |
| --- | --- | --- | --- | --- |
| 1 | basemap-cache.spec.ts: warme basiskaart zonder netwerk 390px | desktop | d + a: verkeerde achtergrond-fixture (U59/MIP-21); vervolgens echte Vite-CORS-fout met verborgen Content-Range, nu hersteld. | Groen |
| 2 | basemap-cache.spec.ts: warme basiskaart zonder netwerk 1280px | desktop | d + a: verkeerde achtergrond-fixture (U59/MIP-21); vervolgens echte Vite-CORS-fout met verborgen Content-Range, nu hersteld. | Groen |
| 3 | basemap.spec.ts: basiskaart 1280px light | desktop | d: U59/MIP-21 verwacht PMTiles maar kreeg achtergrond-fixture; test laadt nu eigen stijl. Geen CDP- of cachenaamfout. | Groen |
| 4 | basemap.spec.ts: basiskaart 1280px dark | desktop | d: U59/MIP-21 verwacht PMTiles maar kreeg achtergrond-fixture; test laadt nu eigen stijl. Geen CDP- of cachenaamfout. | Groen |
| 5 | basemap.spec.ts: basiskaart 390px light | desktop | d: U59/MIP-21 verwacht PMTiles maar kreeg achtergrond-fixture; test laadt nu eigen stijl. Geen CDP- of cachenaamfout. | Groen |
| 6 | basemap.spec.ts: basiskaart 390px dark | desktop | d: U59/MIP-21 verwacht PMTiles maar kreeg achtergrond-fixture; test laadt nu eigen stijl. Geen CDP- of cachenaamfout. | Groen |
| 7 | pin-navigation.spec.ts: desktop: dragging the pin moves the location, the map only follows at the edge, a double click centres | desktop | b, U44: reload lost De Bilt opnieuw op naast opgeslagen kaartmidden; kale start behoudt exacte camera/startlocatie. Anker correct gemeten. | Groen |
| 8 | pin-navigation.spec.ts: with geolocation already granted the current position is the start location, without a prompt | desktop | b, U44: reload heropent plaats-permalink; kale start met opgeslagen view toetst U26-geolocatievoorrang. | Groen |
| 9 | basemap-cache.spec.ts: warme basiskaart zonder netwerk 390px | mobile-4g | d + a: verkeerde achtergrond-fixture (U59/MIP-21); vervolgens echte Vite-CORS-fout met verborgen Content-Range, nu hersteld. | Groen |
| 10 | basemap-cache.spec.ts: warme basiskaart zonder netwerk 1280px | mobile-4g | d + a: verkeerde achtergrond-fixture (U59/MIP-21); vervolgens echte Vite-CORS-fout met verborgen Content-Range, nu hersteld. | Groen |
| 11 | basemap.spec.ts: basiskaart 1280px light | mobile-4g | d: U59/MIP-21 verwacht PMTiles maar kreeg achtergrond-fixture; test laadt nu eigen stijl. Geen CDP- of cachenaamfout. | Groen |
| 12 | basemap.spec.ts: basiskaart 1280px dark | mobile-4g | d: U59/MIP-21 verwacht PMTiles maar kreeg achtergrond-fixture; test laadt nu eigen stijl. Geen CDP- of cachenaamfout. | Groen |
| 13 | basemap.spec.ts: basiskaart 390px light | mobile-4g | d: U59/MIP-21 verwacht PMTiles maar kreeg achtergrond-fixture; test laadt nu eigen stijl. Geen CDP- of cachenaamfout. | Groen |
| 14 | basemap.spec.ts: basiskaart 390px dark | mobile-4g | d: U59/MIP-21 verwacht PMTiles maar kreeg achtergrond-fixture; test laadt nu eigen stijl. Geen CDP- of cachenaamfout. | Groen |
| 15 | focus.spec.ts: tapping the wind heading pins wind focus on touch | mobile-4g | b, U42: Tabel-kop en moduskeuze vervangen losse open/sluitknoppen. | Groen |
| 16 | focus.spec.ts: tapping the column heading pins focus on touch, and measures frame rate | mobile-4g | b, U42: Tabel-kop en moduskeuze vervangen losse open/sluitknoppen. | Groen |
| 17 | freshness.spec.ts: fresh radar reads as current, with the scan time and its age | mobile-4g | b, U34/U58: zoekicoon in rust, leesbaar veld pas bij openen; open breedte op 320 px getoetst. | Groen |
| 18 | freshness.spec.ts: dragging the clock scrubs the time and the unrolled panel shows the source strip | mobile-4g | b, U56/U58: continue tijdstrook; 1 px mobiel is voorbij halve radarstap. Exact begin op rand x=0. | Groen |
| 19 | perf.spec.ts: user journey measures performance and cache behaviour | mobile-4g | Open budgetpunt: 16 transfers tegen 11; zes legitieme U42/U58-previewrij-ranges (24.320 B). Opdracht: budget behouden. | Rood: 16 transfers |
| 20 | pin-navigation.spec.ts: touch: one finger scrolls past the map, two fingers pinch and pan, the pin drags | mobile-4g | b, U44: reload lost De Bilt opnieuw op naast opgeslagen kaartmidden; kale start behoudt exacte camera/startlocatie. Anker correct gemeten. | Groen |
| 21 | table.spec.ts: mobile previews the heading and current row, then scrolls smoothly between table and map | mobile-4g | b, U42: Tabel-kop plus hele huidige rij en deels volgende rij (circa 1,2 rij), beide nu getoetst. | Groen |
| 22 | basemap-cache.spec.ts: warme basiskaart zonder netwerk 390px | mobile-fast-3g | d + a: verkeerde achtergrond-fixture (U59/MIP-21); vervolgens echte Vite-CORS-fout met verborgen Content-Range, nu hersteld. | Groen |
| 23 | basemap-cache.spec.ts: warme basiskaart zonder netwerk 1280px | mobile-fast-3g | d + a: verkeerde achtergrond-fixture (U59/MIP-21); vervolgens echte Vite-CORS-fout met verborgen Content-Range, nu hersteld. | Groen |
| 24 | basemap.spec.ts: basiskaart 1280px light | mobile-fast-3g | d: U59/MIP-21 verwacht PMTiles maar kreeg achtergrond-fixture; test laadt nu eigen stijl. Geen CDP- of cachenaamfout. | Groen |
| 25 | basemap.spec.ts: basiskaart 1280px dark | mobile-fast-3g | d: U59/MIP-21 verwacht PMTiles maar kreeg achtergrond-fixture; test laadt nu eigen stijl. Geen CDP- of cachenaamfout. | Groen |
| 26 | basemap.spec.ts: basiskaart 390px light | mobile-fast-3g | d: U59/MIP-21 verwacht PMTiles maar kreeg achtergrond-fixture; test laadt nu eigen stijl. Geen CDP- of cachenaamfout. | Groen |
| 27 | basemap.spec.ts: basiskaart 390px dark | mobile-fast-3g | d: U59/MIP-21 verwacht PMTiles maar kreeg achtergrond-fixture; test laadt nu eigen stijl. Geen CDP- of cachenaamfout. | Groen |
| 28 | freshness.spec.ts: fresh radar reads as current, with the scan time and its age | mobile-fast-3g | b, U34/U58: zoekicoon in rust, leesbaar veld pas bij openen; open breedte op 320 px getoetst. | Groen |
| 29 | freshness.spec.ts: dragging the clock scrubs the time and the unrolled panel shows the source strip | mobile-fast-3g | b, U56/U58: continue tijdstrook; 1 px mobiel is voorbij halve radarstap. Exact begin op rand x=0. | Groen |
| 30 | perf.spec.ts: user journey measures performance and cache behaviour | mobile-fast-3g | Open budgetpunt: 16 transfers tegen 14; zes legitieme U42/U58-previewrij-ranges (24.320 B). Opdracht: budget behouden. | Rood: 16 transfers |

- **Eindstand:** functionele reparaties volledig geverifieerd, gate blijft rood op twee expliciet behouden performance-budgetten. Draft-PR #88 blijft draft; geen merge. De orkestrator heeft hiermee de concrete oorzaak en meetdata voor een aparte budgetbeslissing, zonder dat U61 die productkeuze maakt.

## 2026-10-08 00:55 CEST — nieuwe instructie: mainfix integreren

- Orkestrator meldt `5ba8c171`: lokale PMTiles-plugin alleen actief bij https-data-origin; unit-pretest genereert voortaan synthfixtures. Main zonder conflicten gemerged. De vorige eindstand wordt hiermee aangevuld; nog geen nieuwe groene claim.
- Voor onafhankelijke herhaling de twee basiskaartspecs en Vite-config exact teruggezet naar de mainversie; U61-versies veilig in ignored `tmp/u61/pre-main-fix/`. Zo beïnvloeden de eigen stijl-fixture en CORS-headerwijziging de nulmeting niet. Eerst main-specs op alle drie profielen herhalen, daarna alleen bewezen resterende aanpassingen behouden.
- De pluginoorzaak wordt in de aanvullende triagetabel expliciet als "orkestrator-plugin, gefixt op main" vastgelegd. De achtergrondstijl in gewone e2e-config blijft een tweede mogelijke oorzaak; die wordt opnieuw gemeten vóór verdere aanpassing.

## 2026-10-08 00:57 CEST — onafhankelijke main-herhaling: tweede oorzaak bevestigd

- Trace van eerste main-cachefailure: GET `http://127.0.0.1:8396/style.json` geeft 200 met `sources: {}` en alleen de achtergrondlaag; **0 PMTiles-requests**. Screenshot bevestigt ontbreken van basiskaartlabels/wegen. Dit is onafhankelijk van de inmiddels inactieve lokale archiefplugin: die krijgt geen tegelrequests om te onderscheppen.
- Dus naast "oorzaak: orkestrator-plugin, gefixt op main" blijft de gewone e2e-achtergrondfixture aantoonbaar een integratieprobleem voor deze U59-tests. De eerdere U61-stijl-fixture was daarvoor nodig; pas na de volledige main-nulmeting terugzetten. Main neemt de CORS-proxyroute over, dus de eigen Vite-headerfix voorlopig verwijderen en zonder die fix opnieuw verifiëren.
- Cloud-section en dev-panel waren in de volledige run groen in alle drie profielen; isobars was desktop 3/3 groen, mobiele profielen hebben al bestaande skips. Op verzoek ook die specs in de gerichte vervolgcontrole meenemen; geen skips veranderen.

## 2026-10-08 01:00 CEST — main-nulmeting compleet en zelfstandige fixture

- Orkestrator corrigeert zijn oorzaak: "basemap: testomgeving niet zelfvoorzienend; oorzaak U59-spec, gefixt door U61". Dit vervangt de eerdere attributie aan alleen de plugin; de LOG blijft append-only.
- Main-nulmeting met beide originele main-specs en originele Vite-config: `cd web && MOTREGEN_E2E_PORT=4396 MOTREGEN_E2E_DATA_PORT=8396 pnpm e2e e2e/basemap.spec.ts e2e/basemap-cache.spec.ts --project desktop --project mobile-4g --project mobile-fast-3g --output tmp/u61-main-basemap`, **exit 1, 18 failed**. Stijl zonder PMTiles-bron; daarnaast ontbreekt `public/data/basemap` ook na synthgen. Ruwe uitvoer/traces: `web/tmp/u61-main-basemap*`.
- Zelfvoorzienende reparatie: standaard e2e-webserver voert na synthgen `scripts/e2e-basemap.ts` uit, kopieert de meegecommitteerde archieven naar de eigen Caddy-data-origin. Basiskaartspecs krijgen de bestaande U61-stijl-fixture terug (licht/donker + fonts uit meegecommitteerde public/basemap). Geen handmatig publiceren/snapshot en geen skips nodig.
- U61-Vite-headerfix verwijderd: main's pluginvoorwaarde voorkomt onderscheppen van de e2e-data-origin, waar Caddy de juiste CORS/Range-headers al levert. Daarmee resteert geen U61-productwijziging in Vite.
- Gerichte nieuwe run: basiskaart, cache, cloud-section, dev-panel, isobars op alle drie profielen. Synthgen verwijdert eerst de datadir en de webserver bereidt hem daarna zelf opnieuw voor: dit controleert de verse werkboom zonder voorbereid basemaparchief. Nog geen receipt.

## 2026-10-08 01:03 CEST — zelfstandige e2e-omgeving groen

- `cd web && MOTREGEN_E2E_PORT=4396 MOTREGEN_E2E_DATA_PORT=8396 pnpm e2e e2e/basemap.spec.ts e2e/basemap-cache.spec.ts e2e/cloud-section.spec.ts e2e/dev-panel.spec.ts e2e/isobars.spec.ts --project desktop --project mobile-4g --project mobile-fast-3g --output tmp/u61-self-contained`: **exit 0, 27 passed / 6 bestaande isobarenskips (2,9 min)**. Alle 18 basiskaart-/cachegevallen groen; cloud-section + dev-panel elk drie profielen groen; isobars desktop 3/3 groen.
- Deze run begon zonder `public/data/basemap`; webserver genereert synthdata, kopieert daarna het gecommitteerde archief. De definitieve kopieerscriptversie kiest het archief via `tools/basemap/tiles/manifest.json` en gebruikt copyFileSync: ontbrekend archief geeft meteen een duidelijke bestandsfout bij opstarten, geen stille nulmeting in de browser. Die scriptversie afzonderlijk gestart: exit 0.
- Push `10ac4f0` bevestigd met ls-remote; PR #88 heeft de gecorrigeerde titel/oorzaak, verificatie na main deels nog pending. Geen U61-Vite-diff meer ten opzichte van main. Volgende stap: unit-pretest + typecheck/build; vervolgens de twee kaartspecs opnieuw met verdwenen generated-basemapdir om exact de definitieve startup te toetsen.

## 2026-10-08 01:04 CEST — web-gates na mainfix; nieuwere main/U60

- `pnpm --dir web test`: **exit 0, 72 files / 478 tests**, inclusief automatisch gestarte pretest/synthgen. `public/data/basemap` is daarna aantoonbaar afwezig (test ! -d exit 0). `pnpm --dir web typecheck`: exit 0; `pnpm --dir web build`: exit 0. Uitvoer in ignored `tmp/u61/{unit,typecheck,build}-after-main.txt`.
- Origin/main is intussen verdergegaan met U60 (`e37731b`) en logcommit `482660a`; manifest verwijst nu naar `nl-91e2043db5c73799.pmtiles` (24.301.762 B). Niet de eerdere basis gebruiken voor de laatste kaartreceipt: actuele main eerst mergen, daarna dezelfde standaard e2e-opstart met de actuele manifesthash controleren. De U61-diff blijft beperkt tot de trackfiles; geen U60-werk terugdraaien.

## 2026-10-08 01:05 CEST — U60 geïntegreerd

- Actuele main `482660a` inclusief U60 gemerged zonder conflicten; codehead/push `7377965` bevestigd via ls-remote. De PR-diff tegenover main blijft de twaalf U61-bestanden; U60-artefacten zijn uitsluitend via de main-merge meegekomen.
- `pnpm --dir web test` na U60: **exit 0, 72 files / 478 tests**. Datadir opnieuw door pretest/synthgen gewist; `test ! -d web/public/data/basemap` exit 0. `pnpm --dir web typecheck` exit 0. Build loopt, daarna laatste gerichte kaartreceipt op exact deze codehead en huidige manifesthash.
- Geen tweede volledige suite gestart: opdracht vraagt één volledige run; de reeds ontvangen volledige receipt blijft expliciet die van `df1f8b8`, vóór de latere mainfix/U60-merges. Nieuwe kaart-/cacheverificatie wordt afzonderlijk gerapporteerd.

## 2026-10-08 01:08 CEST — definitieve eindstand na orkestratorcorrectie en U60

- Finale kaart-/cachecontrole op codehead `7377965`, actuele main `482660a` inclusief U60: **exit 0, 18 passed / 0 skips (2,1 min)**. Repro: `cd web && MOTREGEN_E2E_PORT=4396 MOTREGEN_E2E_DATA_PORT=8396 pnpm e2e e2e/basemap.spec.ts e2e/basemap-cache.spec.ts --project desktop --project mobile-4g --project mobile-fast-3g --output tmp/u61-final-basemap`. Uitvoer `web/tmp/u61-final-basemap.txt`.
- Vóór opstart expliciet `test ! -d web/public/data/basemap`: exit 0. Tijdens run is SHA256 van het klaargezette archief identiek aan bron en manifest: `91e2043db5c73799861adc5ee715b34c2fddc4ab620e55927f6a3149a55b53db`. Alle Range-, CORS-, serviceworker- en offline-bytechecks groen op alle profielen. Geen stille achtergrondtest meer.
- Laatste web-gates na U60: typecheck exit 0; unit exit 0 (72 bestanden / 478 tests); build exit 0. Uitvoer `tmp/u61/{typecheck,unit,build}-after-u60.txt`. Nieuwe startup en tests zijn hiermee geverifieerd; de nog volgende eindcommit wijzigt alleen de LOG.
- Aanvullende cloud-section/dev-panel (alle drie profielen) en desktop-isobars waren in de gerichte run na `5ba8c171` groen: 27 passed / 6 bestaande skips, exit 0. Geen wijzigingen nodig. De onderstaande tabel vervangt de eerdere basemap-attributie en vermeldt per oorspronkelijk geval de concrete bewijsrun.
- Eén volledige suite is uitgevoerd op `df1f8b8`, vóór de latere mainmerges: **112 passed / 2 failed / 63 bestaande skips, exit 1**. Geen tweede volledige suite. De twee mobiele budgetfailures blijven 16 scrubtransfers tegen 11/14, ook rustig gereproduceerd; budgetten blijven onaangeroerd. De latere mobiele warm-/sessiechecks zijn niet bereikt. Nieuwe U60-A/B-tests zijn via main meegekomen en zijn geen deel van die oudere volledige receipt.

| Nr | Oorspronkelijke rode test | Profiel | Klasse / oorzaak (gecorrigeerd) | Resultaat / bewijs |
| --- | --- | --- | --- | --- |
| 1 | basemap-cache.spec.ts: warme basiskaart zonder netwerk 390px | desktop | d — basemap: testomgeving niet zelfvoorzienend; oorzaak U59-spec, gefixt door U61. Webserver bereidt archief voor, spec laadt eigen stijl. | Groen: finale gerichte run na main/U60 |
| 2 | basemap-cache.spec.ts: warme basiskaart zonder netwerk 1280px | desktop | d — basemap: testomgeving niet zelfvoorzienend; oorzaak U59-spec, gefixt door U61. Webserver bereidt archief voor, spec laadt eigen stijl. | Groen: finale gerichte run na main/U60 |
| 3 | basemap.spec.ts: basiskaart 1280px light | desktop | d — basemap: testomgeving niet zelfvoorzienend; oorzaak U59-spec, gefixt door U61. Webserver bereidt archief voor, spec laadt eigen stijl. | Groen: finale gerichte run na main/U60 |
| 4 | basemap.spec.ts: basiskaart 1280px dark | desktop | d — basemap: testomgeving niet zelfvoorzienend; oorzaak U59-spec, gefixt door U61. Webserver bereidt archief voor, spec laadt eigen stijl. | Groen: finale gerichte run na main/U60 |
| 5 | basemap.spec.ts: basiskaart 390px light | desktop | d — basemap: testomgeving niet zelfvoorzienend; oorzaak U59-spec, gefixt door U61. Webserver bereidt archief voor, spec laadt eigen stijl. | Groen: finale gerichte run na main/U60 |
| 6 | basemap.spec.ts: basiskaart 390px dark | desktop | d — basemap: testomgeving niet zelfvoorzienend; oorzaak U59-spec, gefixt door U61. Webserver bereidt archief voor, spec laadt eigen stijl. | Groen: finale gerichte run na main/U60 |
| 7 | pin-navigation.spec.ts: desktop: dragging the pin moves the location, the map only follows at the edge, a double click centres | desktop | b, U44: reload lost De Bilt opnieuw op naast opgeslagen kaartmidden; kale start behoudt exacte camera/startlocatie. Anker correct gemeten. | Groen: volledige run vóór main/U60 |
| 8 | pin-navigation.spec.ts: with geolocation already granted the current position is the start location, without a prompt | desktop | b, U44: reload heropent plaats-permalink; kale start met opgeslagen view toetst U26-geolocatievoorrang. | Groen: volledige run vóór main/U60 |
| 9 | basemap-cache.spec.ts: warme basiskaart zonder netwerk 390px | mobile-4g | d — basemap: testomgeving niet zelfvoorzienend; oorzaak U59-spec, gefixt door U61. Webserver bereidt archief voor, spec laadt eigen stijl. | Groen: finale gerichte run na main/U60 |
| 10 | basemap-cache.spec.ts: warme basiskaart zonder netwerk 1280px | mobile-4g | d — basemap: testomgeving niet zelfvoorzienend; oorzaak U59-spec, gefixt door U61. Webserver bereidt archief voor, spec laadt eigen stijl. | Groen: finale gerichte run na main/U60 |
| 11 | basemap.spec.ts: basiskaart 1280px light | mobile-4g | d — basemap: testomgeving niet zelfvoorzienend; oorzaak U59-spec, gefixt door U61. Webserver bereidt archief voor, spec laadt eigen stijl. | Groen: finale gerichte run na main/U60 |
| 12 | basemap.spec.ts: basiskaart 1280px dark | mobile-4g | d — basemap: testomgeving niet zelfvoorzienend; oorzaak U59-spec, gefixt door U61. Webserver bereidt archief voor, spec laadt eigen stijl. | Groen: finale gerichte run na main/U60 |
| 13 | basemap.spec.ts: basiskaart 390px light | mobile-4g | d — basemap: testomgeving niet zelfvoorzienend; oorzaak U59-spec, gefixt door U61. Webserver bereidt archief voor, spec laadt eigen stijl. | Groen: finale gerichte run na main/U60 |
| 14 | basemap.spec.ts: basiskaart 390px dark | mobile-4g | d — basemap: testomgeving niet zelfvoorzienend; oorzaak U59-spec, gefixt door U61. Webserver bereidt archief voor, spec laadt eigen stijl. | Groen: finale gerichte run na main/U60 |
| 15 | focus.spec.ts: tapping the wind heading pins wind focus on touch | mobile-4g | b, U42: Tabel-kop en moduskeuze vervangen losse open/sluitknoppen. | Groen: volledige run vóór main/U60 |
| 16 | focus.spec.ts: tapping the column heading pins focus on touch, and measures frame rate | mobile-4g | b, U42: Tabel-kop en moduskeuze vervangen losse open/sluitknoppen. | Groen: volledige run vóór main/U60 |
| 17 | freshness.spec.ts: fresh radar reads as current, with the scan time and its age | mobile-4g | b, U34/U58: zoekicoon in rust, leesbaar veld pas bij openen; open breedte op 320 px getoetst. | Groen: volledige run vóór main/U60 |
| 18 | freshness.spec.ts: dragging the clock scrubs the time and the unrolled panel shows the source strip | mobile-4g | b, U56/U58: continue tijdstrook; 1 px mobiel is voorbij halve radarstap. Exact begin op rand x=0. | Groen: volledige run vóór main/U60 |
| 19 | perf.spec.ts: user journey measures performance and cache behaviour | mobile-4g | Open budgetpunt: 16 transfers tegen 11; zes legitieme U42/U58-previewrij-ranges (24.320 B). Opdracht: budget behouden. | Rood: 16 transfers |
| 20 | pin-navigation.spec.ts: touch: one finger scrolls past the map, two fingers pinch and pan, the pin drags | mobile-4g | b, U44: reload lost De Bilt opnieuw op naast opgeslagen kaartmidden; kale start behoudt exacte camera/startlocatie. Anker correct gemeten. | Groen: volledige run vóór main/U60 |
| 21 | table.spec.ts: mobile previews the heading and current row, then scrolls smoothly between table and map | mobile-4g | b, U42: Tabel-kop plus hele huidige rij en deels volgende rij (circa 1,2 rij), beide nu getoetst. | Groen: volledige run vóór main/U60 |
| 22 | basemap-cache.spec.ts: warme basiskaart zonder netwerk 390px | mobile-fast-3g | d — basemap: testomgeving niet zelfvoorzienend; oorzaak U59-spec, gefixt door U61. Webserver bereidt archief voor, spec laadt eigen stijl. | Groen: finale gerichte run na main/U60 |
| 23 | basemap-cache.spec.ts: warme basiskaart zonder netwerk 1280px | mobile-fast-3g | d — basemap: testomgeving niet zelfvoorzienend; oorzaak U59-spec, gefixt door U61. Webserver bereidt archief voor, spec laadt eigen stijl. | Groen: finale gerichte run na main/U60 |
| 24 | basemap.spec.ts: basiskaart 1280px light | mobile-fast-3g | d — basemap: testomgeving niet zelfvoorzienend; oorzaak U59-spec, gefixt door U61. Webserver bereidt archief voor, spec laadt eigen stijl. | Groen: finale gerichte run na main/U60 |
| 25 | basemap.spec.ts: basiskaart 1280px dark | mobile-fast-3g | d — basemap: testomgeving niet zelfvoorzienend; oorzaak U59-spec, gefixt door U61. Webserver bereidt archief voor, spec laadt eigen stijl. | Groen: finale gerichte run na main/U60 |
| 26 | basemap.spec.ts: basiskaart 390px light | mobile-fast-3g | d — basemap: testomgeving niet zelfvoorzienend; oorzaak U59-spec, gefixt door U61. Webserver bereidt archief voor, spec laadt eigen stijl. | Groen: finale gerichte run na main/U60 |
| 27 | basemap.spec.ts: basiskaart 390px dark | mobile-fast-3g | d — basemap: testomgeving niet zelfvoorzienend; oorzaak U59-spec, gefixt door U61. Webserver bereidt archief voor, spec laadt eigen stijl. | Groen: finale gerichte run na main/U60 |
| 28 | freshness.spec.ts: fresh radar reads as current, with the scan time and its age | mobile-fast-3g | b, U34/U58: zoekicoon in rust, leesbaar veld pas bij openen; open breedte op 320 px getoetst. | Groen: volledige run vóór main/U60 |
| 29 | freshness.spec.ts: dragging the clock scrubs the time and the unrolled panel shows the source strip | mobile-fast-3g | b, U56/U58: continue tijdstrook; 1 px mobiel is voorbij halve radarstap. Exact begin op rand x=0. | Groen: volledige run vóór main/U60 |
| 30 | perf.spec.ts: user journey measures performance and cache behaviour | mobile-fast-3g | Open budgetpunt: 16 transfers tegen 14; zes legitieme U42/U58-previewrij-ranges (24.320 B). Opdracht: budget behouden. | Rood: 16 transfers |

- **Klaar met U61-triage binnen de opdracht:** alle 28 functionele gevallen hersteld; zelfstandige kaartomgeving op actuele main/U60 groen; de twee expliciet behouden performance-budgetpunten zijn open. Draft-PR #88 blijft draft en de gate wordt niet groen genoemd. Geen merge uitgevoerd.

## 2026-10-08 01:11 CEST — orkestratorbesluit: mobiele scrubbudgetten herijken

- Nieuwe expliciete instructie vervangt het eerdere budgetbehoud: mobile-4g 11 → 16 en mobile-fast-3g 14 → 16. Zes extra transfers zijn de bedoelde U42/U58-previewrij-ranges (24.320 B); reden bij beide budgetten en één regel in docs/perf.md, met de actuele tabelwaarden.
- Gerichte controle van uitsluitend perf.spec op beide mobiele profielen via het e2e-slot en eigen poorten 4396/8396; starten bij 1-minuut-load <8. Deze run bereikt nu ook de eerder niet uitgevoerde warme navigatie en sessiebudgetten. Nog geen receipt; onafhankelijke gate/merge blijven bij de orkestrator.

## 2026-10-08 01:18 CEST — performancecontrole wacht op rustige host

- Budgetten/codecommentaren en documentatie gereed; diff-check schoon. De gerichte run wacht buiten het e2e-slot sinds 01:11 CEST op load <8. Andere Chromiumprocessen hielden de 1-minuut-load op circa 14–20; geen test gestart en geen receipt geclaimd. Quiet-wachtlog: `web/tmp/u61-perf-recalibrated-quiet.txt`.

## 2026-10-08 01:19 CEST — budgetherijking als WIP publiceren

- De rustige-hostwacht loopt nog (load circa 12). Coherente budgetwijziging nu commit/push met verificatie expliciet pending, zodat de 15–20-minutencadans en GitHub-zichtbaarheid behouden blijven. Twee mobiele budgetten =16; reden in de code en docs. De test-run blijft klaarstaan; daarna volgt een aparte receiptcommit.

## 2026-10-08 01:23 CEST — mobiele perf-receipt na toegestane budgetherijking

- Gerichte run op budgetcommit `ecee95f`: **SYNCHROON waargenomen exit 0, 4 passed / 0 skips (59,8 s)**. Repro: `cd web && MOTREGEN_E2E_PORT=4396 MOTREGEN_E2E_DATA_PORT=8396 pnpm e2e e2e/perf.spec.ts --project mobile-4g --project mobile-fast-3g --output tmp/u61-perf-recalibrated`. Uitvoer `web/tmp/u61-perf-recalibrated.txt`.
- Start bij load **5,99** om 01:21:46 CEST, na ruim tien minuten buiten het e2e-slot wachten. Eindsample: ` 01:22:46  up 7 days 17:34,  1 user,  load average: 6.75, 11.15, 11.74`. Quiet-wachtlog: `web/tmp/u61-perf-recalibrated-quiet.txt`.
- Beide journeys meten **16 scrub-transfers**, passend in het expliciet toegestane nieuwe budget 16. Ook de eerder niet bereikte manifestrefresh, warme navigatie en volledige sessie zijn nu daadwerkelijk geverifieerd; geen verdere budgetwijziging nodig.

| Profiel | Cold TTFR | Passieve chunks | Scrub transfers | Scrub p50/p95 | Warm TTFR | Warme chunks | Sessiebytes |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| mobile-4g | 1.804,6 ms | 654.439 B | 16 | 9,5 / 21,2 ms | 1.040,5 ms | 0 B | 1.272.178 B |
| mobile-fast-3g | 5.068,3 ms | 672.265 B | 16 | 17,8 / 25,6 ms | 1.125,3 ms | 0 B | 1.272.178 B |

| Nr | Oorspronkelijk open geval | Gecorrigeerde oorzaak / besluit | Definitieve gerichte receipt |
| --- | --- | --- | --- |
| 19 | perf-journey / mobile-4g | U42/U58-previewrij vraagt zes bedoelde ranges (24.320 B); orkestrator herijkt 11 → 16. | Groen, exit 0; volledige mobiele journey doorlopen |
| 30 | perf-journey / mobile-fast-3g | U42/U58-previewrij vraagt zes bedoelde ranges (24.320 B); orkestrator herijkt 14 → 16. | Groen, exit 0; volledige mobiele journey doorlopen |

- Hiermee zijn de twee resterende oorspronkelijke gevallen gericht groen. De oudere volledige-suite-receipt blijft historisch ongewijzigd; geen nieuwe volledige suite gedraaid. Reden staat bij beide budgetten en als één regel in docs/perf.md; tabelwaarden bijgewerkt. Eindcommit bevat alleen deze receipt. PR #88 blijft beschikbaar voor de onafhankelijke gate en merge door de orkestrator. **Klaar.**
