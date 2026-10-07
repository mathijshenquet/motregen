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
