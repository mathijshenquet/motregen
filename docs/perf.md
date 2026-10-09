# Performance

De performance-aanpak volgt MIP-7: dezelfde browsermetingen voeden de
apparaat-HUD en de deterministische Playwright-gate. Alleen een expliciete klik op *Stuur* in
profielmodus verstuurt een opname naar de lokale dev/preview-sink; er gaat nooit automatisch een
meting naar een server.

## Profielmodus (MIP-16)

`?perf=start` opent de HUD en start direct een koude-startopname van deze lading (de eerste 30 s
na `timeOrigin`), zonder eerst op *Koude start* te tikken; handig omdat veel effecten op pageload
zitten (PO 2026-10-07).

`?perf` opent de compacte HUD en houdt de fase-instrumentatie aan; een kale URL sluit eventuele
oude profielstaat en `?perf=0` wist die eveneens expliciet. Alleen *Koude start* gebruikt kort een
`localStorage`-vlag om de profielmodus één herlaadbeurt mee te nemen. De HUD toont per fase count/p50/p95 over de laatste
30 seconden en maximaal vijf lange animatieframes. *Opname 30 s* combineert die tijdvakken met de
JS Self-Profiling-stacks (als de browser de API biedt) tot Chrome Trace Event-JSON. *Koude start*
herlaadt en neemt het venster vanaf `performance.timeOrigin` op. Zonder Self-Profiling blijven
fasen en lange frames beschikbaar.

Vite dev en preview zetten hiervoor `Document-Policy: js-profiling` en proxyen `/prof` naar
`pnpm prof:sink` (standaard `127.0.0.1:4331`). De sink accepteert uitsluitend `POST /prof`,
valideert het formaat en schrijft mode 0600 naar
`~/motregen-profiles/<ISO>-<platform>.json`. `pnpm prof:check <bestand>` valideert een export los.
`pnpm prof:import <bestand>` opent dezelfde export headless in Firefox Profiler en controleert de
call-tree-import.
`pnpm prof:top <bestand> [top-N] [--json] [--dist <buildmap>]` rangschikt functies op self-time uit `ProfileChunk`
en toont hun self- en stack-sample-aandeel (inclusief aangeroepen functies). De JSON-uitvoer bevat
alle functies. In JS Self-Profiling ontbreken idle-samples; tijd tussen samples is daarom
intervalattributie, geen exacte CPU-tijd. Gebruik het stack-sample-aandeel om een fase vóór en na
een wijziging te vergelijken.
Met `--dist dist-preview` vertaalt hij de 0-based Chrome-callFrame-posities via de sourcemaps
naar bronbestand, functie en positie. Hij gebruikt ook `sourcesContent` voor functienamen
(de map-name kan bijvoorbeeld een parameter zijn). Zonder embedded bron blijft de map-name of
gegenereerde naam beschikbaar. Bewaar de dist van elke meetbuild: bundelnaam inclusief hash,
`sourceMappingURL` en de `file` in de map moeten overeenkomen; een andere build geeft exit 1,
geen gok naar de nieuwste map. Voor gecompileerde dependencybundels kan de bron nog steeds
de gebundelde packagecode zijn.

`scripts/e2e-slot.sh pnpm prof:capture ORIGIN UITVOER.json --water-mask` neemt in een nieuwe
desktop-Chromiumcontext de koude start op, met daarna tien seconden pan/zoom en tien seconden
rust. De opname loopt dertig seconden vanaf pageload; kaart en weerdata moeten beschikbaar zijn.
Zonder `--water-mask` blijft het algemene wind/gevoel/scrub-scenario beschikbaar. Met een
uitvoerpad wordt de opname lokaal gedownload; zonder uitvoerpad gaat hij naar de preview-sink.
`scripts/e2e-slot.sh pnpm exec tsx scripts/verify-water-mask.ts ORIGIN [SCREENSHOT.png]`
vergelijkt het masker met de oorspronkelijke rastering van dezelfde geladen waterpolygonen en
controleert de factor 0,67 op Noordzee/IJsselmeer en 1 op land. Met `--fallback` controleert hij
het pad zonder OffscreenCanvas. De windlaag gebruikt MapLibre 5.24-tegelbytes voor decode en
rastering in een worker; zonder die internals, bij MLT, of zonder workerondersteuning blijft het
cachepad op de hoofddraad actief.
De productie-Caddyconfiguratie heeft bewust géén profilingheader en géén `/prof`-route; daar blijven
lokale kopie en download wel bruikbaar.

## Decode-budget (U49)

Bijna alle frame-decodes zijn *puntreeksen*: histogram, tabel en wolkenbanden pakken een heel
rooster uit om één pixel (de gekozen locatie) te lezen. De kaart zelf vraagt er per koude start
een stuk of twintig. `decodeBudget` (`web/src/core/decode-budget.ts`) kiest daarom per apparaat:

| | ruim (desktop) | krap |
| --- | --- | --- |
| wanneer | al het andere | ≤ 4 kernen, ≤ 4 GB `deviceMemory` of `(pointer: coarse)` |
| decode-workers | min(4, kernen − 1) | 2 (1 bij ≤ 2 kernen) |
| puntreeksen | `eager`: tabel t/m +18 u, hele regentijdlijn, alles bij de eerste aanraking van de scrubber | `in-view`: alleen het scrubbervenster (8 u rond de cursor + een halfuur lucht) en de tabelrijen zodra die in beeld zijn |

De aanwijzerregel staat erin omdat kernen en geheugen de telefoons missen waar het om gaat: een
recente Android meldt acht kernen en Firefox kent geen `deviceMemory`. In `in-view` volgt het
laadvenster de cursor (afspelen, scrubben); tabelvelden die de scrubber zelf tekent laden per
modus (UV altijd, wind in windmodus, temperatuur in gevoelsmodus). De rest van de tabel laadt
als de rijen in beeld komen, en verder dan +18 u zoals voorheen op `onNeedRows`.

Los daarvan, voor ieder apparaat: `MrfClient` geeft werk via een wachtrij aan de workers
(`decode-queue.ts`), één decode per worker tegelijk. De volgorde is sinds U52 tijd-majeur; zie
de volgende sectie. `getFrames` neemt een `AbortSignal`: een wachtende request of decode waar
geen enkele vrager meer op wacht (het venster is verder geschoven) vervalt met
`DecodeCancelled`; al gedownloade bytes blijven staan.

Meten: `pnpm prof:capture [origin] [uitvoer.json] [--profile=desktop|mobile-4g|mobile-fast-3g] [--passive] [--decode-cost=<ms>] [--no-send]`
neemt een koude start op (`?perf=start`, 30 s) onder het e2e-profiel en print aantal decodes,
totale decodetijd, p50/p95, scrub-latency en de verdeling per laag en per veld (elke
`frame-decode`-fase draagt `field` en `layer`). CDP kan workers niet remmen
(`Emulation.setCPUThrottlingRate`: "only supported for pages"), dus de decode*tijd* onder
`mobile-4g` is die van de meethost; het *aantal* is de maat, en de telefoontijd volgt uit een
echte opname. Metingen van 2026-10-07 (prod-data, eerste 30 s):

| profiel | vóór | ná |
| --- | ---: | ---: |
| mobile-4g, alleen kijken | 492 decodes / 4,2 s | 223 / 1,9 s |
| mobile-4g, journey (wind, gevoel, zoom, scrub) | 801 / 6,7 s; scrub-p95 1.439 ms (2 samples) | 309 / 2,5 s; scrub-p95 73 ms (20 samples) |
| desktop, journey | 833 / 9,2 s | 830 / 8,8 s (ongewijzigd, `eager`) |

Wat er op een krap apparaat overblijft is het zichtbare werk zelf: ~110 regenframes (het
histogram toont 8 uur op 5-minutenresolutie en het afspelen loopt erdoorheen), ~45–60
motion-annexen (één per afgespeeld framepaar) en 3 × 12 wolkenframes.

**Kosten per decode.** De ingest schrijft niet-predictieve frames en motion-annexen met
`zstd::stream::encode_all`: geen content size in de frameheader en een venster van 8 MB.
`fzstd` alloceert en verschuift dat venster bij elke decode, ook voor een wolkenframe van
6,7 kB. Dezelfde frames mét content size (zoals de predictieve frames al hebben) decoderen in
node 2,2–2,5× (regen), 4,5–5× (temperatuur, wind) tot 20× (wolkenlagen) sneller, bij +3 B per
frame. Dat is een ingest-wijziging (`crates/mrf/src/lib.rs`: `zstd::bulk::compress`) en staat
als vervolg open.

## Intent-gedreven laden (U52, MIP-19 punt 4, MIP-20 stap 1)

Eén `Intent` (`web/src/core/intent.ts`) beschrijft wat de gebruiker nu wil zien: de cursor, het
zichtbare venster van de scrubber, afspelen met richting, de scrubsnelheid en de velden die
getoond worden. `App.tsx` zet hem bij elke wijziging (`client.setIntent`); hij stuurt twee
wachtrijen met dezelfde rangorde (`IntentRanker`):

1. **Idle of niet.** Een frame meer dan een uur buiten het venster, of van een veld dat nu
   nergens getekend wordt, is idle-werk: het komt pas aan de beurt als er binnen het venster
   niets meer loopt of wacht.
2. **Afstand tot het doel**, in stappen van 5 minuten. Het doel is de cursor, tijdens scrubben
   400 ms verder in de scrubrichting (binnen het venster). De afstand telt vanaf het interval
   waarin het frame getekend wordt (frametijd ± de stap van zijn veld): de twee frames waartussen
   de cursor staat liggen op afstand 0, ook van een uurveld. In de afspeel- of scrubrichting
   telt de afstand ×0,8.
3. **Bij gelijke afstand** regen eerst, daarna het veld dat het langst niet aan de beurt was
   (round-robin), daarna volgorde van aankomst.

De **decodewachtrij** (`decode-queue.ts`) bepaalt de volgorde bij elke vrije worker opnieuw, dus
een cursorsprong herordent wat nog wacht. De **fetch-planner** (`fetch-planner.ts`) doet
hetzelfde voor elke Range (ook headers: een header telt als de frames van zijn chunk):

- hooguit `requests` grote overdrachten (≥ 64 kB) tegelijk — 3 op een krap apparaat (2 bij
  ≤ 2 kernen), 6 op een ruim; kleine requests (een header, één uurframe, een wolkenpayload) zijn
  vertraging en geen bandbreedte en lopen ernaast, tot zes requests in totaal;
- één Range tegelijk per chunk-URL (Chromium cachet een tweede gelijktijdige Range op dezelfde
  cache-entry niet);
- een nieuwe intent laat wensen vervallen waar niemand meer op wacht en herordent de rest.

Op een krap apparaat (`rangeBytes` = 256 kB in `decode-budget.ts`) wordt een reeks frames niet
meer als één omvattende Range per chunk gehaald maar in stukken: 256 kB binnen een uur van de
cursor, 1 MB daarbuiten, de motion-annexen van de chunk als één klein blok. Zo komen de frames
rond "nu" eerst, ook als ze achteraan in het bestand staan (rtcor), en deelt een verre chunk
(seamless, 4–6 MB) de lijn niet met wat in beeld is. Een ruim apparaat houdt de omvattende
Range (bulk-prefetch; de warme-cache-eigenschappen uit U1 blijven daar ongewijzigd).

In `App.tsx` vervalt daarmee het veld-voor-veld-wachten: wolkenlagen en `uv_clear` worden
gevraagd bij de eerste locatiekeuze (niet pas na de fase `direct`), wolken per chunk, en
tabelreeksen en wolkenbanden verschijnen per frame (één publicatie per animatieframe) in
plaats van als blok per veld. De fase `direct` wacht alleen nog op de rijen binnen nu ± 1 u.

Meting van 2026-10-07 (prod-data, vóór = main `234c8ad` + alleen het meetpunt, om en om
gemeten; ms na de eerste regen-draw tot nu ± 1 u compleet):

| scenario | wolkenlagen vóór → ná | regen-histogram vóór → ná | tabel/modus vóór → ná |
| --- | ---: | ---: | ---: |
| mobile-4g, alleen kijken | +1.300…1.450 → +250…470 | +4.420…4.450 → +2.340…2.430 | uv +280…450 → +410…750 |
| mobile-4g, journey | +2.900…2.980 → +470…820 | +5.280…5.410 → +3.500…3.790 | wind +1.840…2.060 → +650…760 |
| desktop, alleen kijken | +2.390 → +770 | +1.560 → +1.360 | temp +1.170 → +780 |
| desktop, 26 ms per decode (`--decode-cost=26`) | +5.160 → +1.510…1.710 | +3.260 → +2.490 | temp +1.610 → +1.710 |

Decodes en decodetijd zijn gelijk gebleven; de chunkbytes volgens de laadtrace dalen op mobiel
(9,58 → 8,99 MB passief) bij meer Range-requests (35 → 45). Twee dingen zijn trager: uv (het
jongste frame is 35–70 min oud en staat dus zover van de cursor) en op desktop de fase `window`
(start van automatisch afspelen: 2,9 → 3,7 s), omdat de regenreeks de workers nu deelt.

**Valkuil bij wire weight.** Resource Timing telt een Range die een al gecachet stuk van dezelfde
chunk overlapt niet volledig: op de synth-fixture stond de omvattende nowcast-Range van 113 kB
voor ~0 B, in totaal 549 kB waar de laadtrace 689 kB telt. Bytebudgetten die op Resource Timing
zijn gekalibreerd terwijl de client omvattende Ranges gebruikte, onderschatten die stand.

## Meetpunten

- **Window-ready per veld** (U52): het eerste moment waarop een veld al zijn waarden binnen
  nu ± 1 u heeft (`core/window-ready.ts`; regen = geladen histogrambalken, wolkenlagen = hun
  frames, tabelvelden = de uurrijen in dat venster). In de snapshot als `windowReadyMs`, als
  user-timing `motregen:window-ready:<veld>` en in de `?perf`-trace als balk
  `window-ready:<veld>` van 0 tot gereed. Het verschil met TTFR is het "jarring"-getal uit
  MIP-19. Elke `frame-decode`-fase draagt daarnaast `waitMs`: hoe lang het frame op een vrije
  worker wachtte.

- **TTFR** loopt vanaf `navigationStart` (`performance.timeOrigin`) tot de eerste
  beweging van de gezamenlijke afspeelklok (`firstCursorMs`), na `mapReady`.
  Bij een gepauzeerde start telt de eerste regentekenbeurt (`firstRainMs`). De
  splash-onthulling is geen voorwaarde. `styleReadyMs`, `firstBasemapTileMs`,
  `basemapReadyMs` en `mapRevealedMs` meten de kaartopzet en onthulling apart.
- **Scrub-latency** loopt vanaf de laatste expliciete histograminput tot de
  MapLibre-`render` van het bijbehorende niet-verouderde regenframe. De HUD
  bewaart maximaal 256 samples en toont p50/p95.
- **FPS** is het aantal rAF-callbacks in een lopend venster van één seconde.
  Achtergrondpauzes langer dan 2,5 seconden resetten het venster.
- **Netwerk** komt uit Resource Timing. `bytes` is `transferSize` en telt dus
  alleen werkelijk overgedragen bytes; een cache-hit heeft nul bytes.
  Requests en bytes zijn uitgesplitst in manifest, chunks, tiles en overig.
- **Manifestleeftijd** is `Date.now() - manifest.generated`.
  De monitor neemt een geaccepteerde automatische manifestrefresh meteen over,
  zodat een lang openstaande tab niet de leeftijd van zijn mountmoment blijft
  rapporteren.

De HUD opent met drie tikken binnen 700 ms op het logo, met `?perf`, of met de knop *Perf-HUD* in
het `?dev`-paneel. De knop
`Kopieer JSON` kopieert de volledige actuele snapshot.

De windknoppen staan sinds U30 (MIP-12) in de groep *Wind* van het `?dev`-paneel: alleen
Dichtheid, Intensiteit, Lijnbreedte en Tempo (`WIND_TUNING_CONTROLS` in
`web/src/core/wind-layer.ts`); de overige parameters zijn constanten in `WIND_PARAMETERS`.
Alleen afwijkingen van de defaults worden per apparaat bewaard in
`localStorage['motregen-wind-tuning-v4']` (v3 wordt eenmalig gemigreerd);
*Kopieer wind als JSON* levert de actuele set om terug te sturen.

## Windlaag

Sinds track U3b tekent de windlaag weer in een trailbuffer (ping-pong-FBO,
hooguit 1,5 device-px per CSS-px via de knop *Buffer-DPR max*; op volle
Pixel 5-resolutie kostte hij ~1 s warme TTFR in de 4G-gate): per frame
één fullscreen fadepass, dan per particle één instanced, analytisch
gefeatherd segment van de vorige naar de huidige kop, en één fullscreen
compositepass. De staart is dus buffer, niet geometrie. De fade is een rest
per seconde (`rest^dt` per frame), zodat de staart niet van de framerate
afhangt; de vloer tegen 8-bit-ghosts (t3i) blijft. Het leven is in CSS-px:
iedere particle legt ~*Afstand per leven* af, de kop faded in over de eerste
en uit over de laatste pixels, waarna de buffer de staart laat uitsterven.
Respawn gebeurt in de leegste cel van een bezettingsraster met ~1 particle
per cel, op een positie binnen die cel (*Spawn-jitter*: 0 = celmidden, 1 =
uniform binnen de cel). Dat houdt de koppendichtheid gelijkmatig, maar omdat
iedere particle ~dezelfde inkt per leven neerlegt en snelle particles vaker
respawnen, wordt inkt dan ∝ windsnelheid; *Snelheidsdemping* γ dimt de kop
boven 3 m/s met (3/v)^γ (default 0,7) zodat zee niet drukker oogt dan land.
*Lijnbreedte* is in device-px, zoals vóór U3.

Vier meetscripts horen erbij, alle tegen een draaiende preview
(`MOTREGEN_DATA_ORIGIN=https://motregen.nl/data pnpm preview`):

- `pnpm exec tsx scripts/measure-wind.ts ORIGIN OUT LABEL` — rAF-intervallen en
  renderer-busy% op Pixel 5 + CPU 4× en desktop, plus screenshots licht/donker.
  `MEASURE_PROFILES=mobile` en `MEASURE_SCREENSHOTS=0` beperken de run.
- `pnpm exec tsx scripts/wind-ink.ts ORIGIN before|after` — gemiddelde
  RGB-bijdrage van de trails per land- en zeepixel (autoplay gepauzeerd,
  referentie = dezelfde pagina met wind onzichtbaar). `before` stuurt de
  `?dev`-slider van builds vóór U3 aan, `after` de `?dev`-knop *Intensiteit* (sinds U30).
- `pnpm exec tsx scripts/wind-density.ts ORIGIN OUT [JITTERS]` —
  spreidingsindex (variantie/gemiddelde per cel) van de zichtbare koppen via
  de meethaak `__motregenWind.dispersion()`, per spawn-jitter, met screenshots.
- `pnpm exec tsx scripts/wind-video.ts ORIGIN OUT [LABEL] [light|dark]` — korte
  ingezoomde video van spawn tot uitsterven.

`measure-wind` en `wind-ink` nemen `WIND_TUNING='{"…":…}'` om tuning zonder rebuild te zetten.

In headless SwiftShader verlaagt het adaptieve particlebudget het aantal
particles meteen naar het minimum (96); voor screenshots en inkt op volle
dichtheid is dat budget in een wegwerpbuild uitgezet. Metingen van U3
(polylines) en U3b (buffer) staan in `.dev/tracks/u3-wind-trails/LOG.md` en
`.dev/tracks/u3b-wind-middenweg/LOG.md`.

## Lab-gates

`cd web && pnpm e2e` maakt zelf synthdata, bouwt de productiefrontend en start
een preview plus een Caddy-dataserver. De lokale basemap bevat alleen een
achtergrondlaag; daardoor zijn OpenFreeMap en externe tilelatency geen bron van
flakiness, terwijl de echte Range- en cachepaden wel worden gebruikt. Een
uitzondering zijn `basemap.spec.ts` en `basemap-cache.spec.ts`: die laden via
`e2e/basemap-fixture.ts` de eigen PMTiles-stijl, zodat dezelfde suite ook de
kaartbereiken, CORS-headers en offline serviceworker-cache toetst. De
e2e-webserver kopieert daarvoor na synthgen het meegecommitteerde archief uit
`tools/basemap/tiles` naar zijn eigen data-origin; vooraf publiceren is niet nodig. De
performance-journey behoudt de achtergrondstijl en zijn bestaande budgetten. Een
warmmeting is een normale tweede navigatie in dezelfde browsercontext. Een
geforceerde browser-reload wordt niet gebruikt, omdat die cachevalidatie
expliciet kan forceren en daarmee een ander scenario meet.

| Gate | Budget | Kalibratie |
| --- | ---: | --- |
| cold TTFR | profielafhankelijk, zie hieronder | per profiel op het gemeten maximum + 10% |
| warm TTFR | profielafhankelijk, zie hieronder | per profiel op het gemeten maximum + 10% |
| warm chunks | 0 B | cache-invariant in de huidige journey, geen marge op nul |
| passief geopende chunks | profielafhankelijk, zie hieronder | desktop `eager`; mobiel `in-view` (U49), per profiel + 10% |
| scrubtransfers | profielafhankelijk, zie hieronder | dezelfde journey, per profiel + 10% |
| locatie via zoekpil | desktop 0 data-transfers | desktop is na sliderintentie volledig gedecodeerd; mobiele profielen wachten op hun zichtbare venster |
| volledige sessie | profielafhankelijk, zie hieronder | per profiel op het gemeten maximum + 10% |
| browserfouten | 0 | console, page errors en mislukte requests |

FPS wordt alleen gelogd: headless Chromium gebruikt SwiftShader en is geen
zinvolle GPU-gate. De twee verplichte opeenvolgende runs op 2026-08-31 waren:

| Run | cold TTFR | warm TTFR | scrub p50/p95 | scrub transfers | sessie | fps-indicatie |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| synth 1 | 461,3 ms | 520,2 ms | 10,0 / 19,3 ms | 23 / 83 | 1.310.182 B | 45–58 |
| synth 2 | 474,9 ms | 548,4 ms | 8,2 / 21,9 ms | 23 / 83 | 1.310.182 B | 40–56 |

De resterende meetruis komt vooral van SwiftShader-initialisatie, hostbelasting
en rAF-cadans. De budgetten vermijden daarom assertions op losse fps-waarden.

## Mobiele labprofielen

Dezelfde journey draait in drie Playwrightprojecten. Beide mobiele projecten
gebruiken de Pixel 5-emulatie van Playwright: viewport 393×727, Android-UA,
touch, DPR 2,75 en mobiel layoutgedrag. CDP zet de CPU op 4× vertraging. De
moderne combinatie `Network.emulateNetworkConditionsByRule` en
`Network.overrideNetworkState` emuleert daarnaast de verbinding in de browser:

| Profiel | CPU | Download / upload | RTT | Cold | Warm | Passief | Scrub | Sessie |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Desktop | 1× | geen emulatie | — | < 1.210 ms | < 890 ms | ≤ 1.155.000 B | ≤ 19 | ≤ 2.640.000 B |
| Mobiel 4G | 4× | 9 / 1,5 Mbps | 60 ms | < 4.915 ms | < 1.545 ms | ≤ 686.000 B | ≤ 16 | ≤ 1.345.000 B |
| Mobiel Fast 3G | 4× | 1,6 / 0,75 Mbps | 150 ms | < 5.360 ms | < 1.690 ms | ≤ 686.000 B | ≤ 16 | ≤ 1.355.000 B |

Het mobiele passieve budget is bij de U52-merge (2026-10-07) van 587.000 op 686.000 B gezet:
gemeten 623.200 B op beide mobiele profielen + 10 %. De stijging in Resource Timing is geen
extra draadverkeer (de U53-rig meet 4–10 % mínder bytes): Resource Timing telt een Range die
een al gecachet stuk overlapt niet volledig, en U52 haalt rond de cursor kleinere, niet-
overlappende stukken. Voor wire weight is de rig de maat, dit budget bewaakt alleen regressies
in dezelfde meetwijze.

U61 herijkt op orkestratorbesluit (2026-10-08) de mobiele scrub-transferbudgetten van 11 (4G) en 14 (Fast 3G) naar 16: de zes extra ranges laden de bedoelde U42/U58-previewrij (24.320 B).

`warm chunks` blijft op ieder profiel exact 0 B. Een niet-nul resultaat is een
cache-regressie, geen meetruis die een 10%-marge rechtvaardigt.

### U51-kalibratie

Gemeten op `00cb6a2`, 2026-10-07, met synthdata en de e2e-poorten 4390/8390.
De volledige journey is koud openen → TTFR → Home + twaalf toetsen op de
scrubber → spatie-afspelen → Utrecht kiezen via de zoekpil → desktop `complete`
of mobiel `window` → manifestrefresh → warme navigatie. Elke positieve grens is
het hoogste resultaat uit de kalibratie plus 10%, naar boven afgerond.

| Ronde / profiel | Cold | Passief | Laadstadium | Scrub | Warm | Warme chunks | Sessie |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 / Desktop | 391,4 ms | 1.049.415 B | complete 1.572,9 ms | 17 | 518,1 ms | 0 B | 2.398.975 B |
| 2 / Desktop | 391,1 ms | 1.049.415 B | complete 1.420,6 ms | 17 | 367,3 ms | 0 B | 2.398.975 B |
| 1 / Mobiel 4G | 1.998,2 ms | 533.041 B | window 2.821,6 ms | 10 | 1.275,6 ms | 0 B | 1.220.207 B |
| 2 / Mobiel 4G | 1.704,2 ms | 533.041 B | window 2.482,5 ms | 10 | 1.080,4 ms | 0 B | 1.220.207 B |
| 1 / Mobiel Fast 3G | 4.805,7 ms | 533.041 B | window 2.322,7 ms | 10 | 1.015,9 ms | 0 B | 1.220.207 B |
| 2 / Mobiel Fast 3G | 4.852,8 ms | 533.041 B | window 2.363,7 ms | 10 | 1.173,5 ms | 0 B | 1.220.207 B |

Na integratie van de standaard autoplay en de verkorte scrubberhorizon bleek
die desktopnulgrens intermitterend te falen. Een falende run droeg 2.663 B
opnieuw over: drie motion-ranges van elk 63 B plus 1.274 B uit een grotere
nowcastrange. De horizon was niet de oorzaak. De eerste kaartframe prefetchte
buurframes als losse 206-ranges, terwijl de direct daarop gestarte
locatiereeks dezelfde immutable MRF-payload in bulk ophaalde. Die overlappende
responses leverden soms een onvolledige sparse Chromium-cache-entry op. De
redundante prefetch vóór de eerste locatiereeks is daarom verwijderd; latere
prefetch blijft ongewijzigd. Zes verse desktopjourneys daarna maten elk 0 B
warm en 1.282.633 B voor de volledige sessie, 6.865 B minder dan vóór de fix.
Het desktopbudget blijft dus bewust de strenge 0 B in plaats van de regressie
met een ruimer budget te maskeren. Bij een toekomstige failure logt de suite
de overgedragen chunk-URL en Resource Timing-bytevelden direct.

De passieve snapshot wordt pas gemaakt nadat TTFR is vastgelegd, L0 gereed is,
het L1-venster rond nu is ingevuld en het netwerk idle is. Daarna pauzeert de
suite de tijdslider, gaat met Home en twaalf toetsen vooruit, speelt met spatie
af en kiest Utrecht via de zoekpil. De daaropvolgende sliderintentie moet op
desktop `complete` bereiken; mobiel hoeft uitsluitend het zichtbare `window` te
vullen. De warmbyte-snapshot wacht opnieuw op het L1-stadium en netwerk-idle.
Deze historische reeks gebruikt het toenmalige eerste-rendermeetpunt van TTFR;
passief, intentie en warm cachegebruik zijn drie afzonderlijke meetfasen.

### Progressieve laadbaseline

T3h voert MIP-8 §7 uit. L0 haalt alle headers, het regenpaar rond nu en de
uurvelden voor de volledige tabel. L1 vult tijdens browser-idle het eerlijke
histogramvenster van −1 tot +2 uur; niet-geladen posities blijven als neutraal
skeleton herkenbaar. L2 haalt de resterende reeks bij scrub-/playintentie of na
30 seconden diepe idle. Autoplay en buurprefetch wachten tot L1 klaar is, zodat
zij niet opnieuw de door T3g opgeloste overlappende-Range-race introduceren.

T3h2 verwijdert de publicatiebarrière binnen L1/L2. De gecoalesceerde
Range-request blijft één transfer, maar de responsebody vult een oplopende
payloadspan. Ieder zelfstandig zstd-member decodeert zodra zijn eigen bytes
compleet zijn; een later frame of trage chunk blokkeert reeds complete balken
niet. De UI bundelt voortgang maximaal eenmaal per animation frame. Na een
volledige load gebruikt een locatiewissel uitsluitend de decoded framecache:
de serie is in dezelfde tick compleet, `data-load-stage` blijft `complete` en
er verschijnt geen skeleton.

De twee verplichte opeenvolgende T3h2-runs bleven binnen alle bestaande
budgetten. De nieuwe locatiewisselassertie zag in ieder profiel nul
datarequests, nul pending balken en geen enkele mutatie weg van `complete`.

| Run / profiel | Cold TTFR | Passieve chunks | L2 tijd-tot-compleet | L2/scrubtransfers | Warm chunks | Sessie |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 / Desktop | 495,3 ms | 547.578 B | 197,5 ms | 4 / 85 | 0 B | 1.246.392 B |
| 1 / Mobiel 4G | 1.641,8 ms | 564.346 B | 914,6 ms | 4 / 85 | 5.430 B | 1.256.330 B |
| 1 / Mobiel Fast 3G | 3.606,3 ms | 631.607 B | 1.703,5 ms | 7 / 85 | 5.879 B | 1.302.354 B |
| 2 / Desktop | 428,6 ms | 547.578 B | 176,4 ms | 4 / 85 | 0 B | 1.246.392 B |
| 2 / Mobiel 4G | 1.619,2 ms | 564.835 B | 1.094,0 ms | 4 / 85 | 5.430 B | 1.256.843 B |
| 2 / Mobiel Fast 3G | 3.623,9 ms | 631.607 B | 1.591,0 ms | 6 / 85 | 8.454 B | 1.286.698 B |

T3l voegt aan dezelfde journey een manifestwissel toe: na een gesimuleerde
zichtbaarheidsterugkeer schuift `now` vijf minuten, terwijl cursortijd,
`complete`-status en alle bestaande balken behouden blijven. In twee direct
opeenvolgende runs vroeg die wissel in alle profielen nul chunktransfers.

| Run / profiel | Cold TTFR | Passieve chunks | L2 compleet / transfers | Manifest→scherm | Warm chunks | Sessie |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 / Desktop | 504,6 ms | 547.578 B | 192,0 ms / 4 | 41,7 ms | 0 B | 1.257.022 B |
| 1 / Mobiel 4G | 1.651,7 ms | 559.656 B | 909,4 ms / 4 | 151,4 ms | 5.430 B | 1.266.508 B |
| 1 / Mobiel Fast 3G | 3.765,8 ms | 661.976 B | 1.624,9 ms / 3 | 145,2 ms | 5.879 B | 1.314.418 B |
| 2 / Desktop | 442,2 ms | 547.578 B | 179,0 ms / 4 | 49,5 ms | 0 B | 1.257.022 B |
| 2 / Mobiel 4G | 1.769,9 ms | 559.656 B | 1.051,9 ms / 4 | 143,4 ms | 5.430 B | 1.266.508 B |
| 2 / Mobiel Fast 3G | 3.714,8 ms | 631.545 B | 1.994,1 ms / 7 | 118,3 ms | 5.879 B | 1.313.459 B |

Het synthetische passiefbudget is na desktop, 4G en Fast 3G gekalibreerd op
**800.000 chunkbytes**. De hoogste waarneming tijdens ontwikkeling was 698.659
B onder Fast 3G; de twee definitieve gateruns bleven op maximaal 631.607 B. Deze grens is ruim
strenger dan MIP-8's maximum van 3 MB, maar houdt marge voor de bekende
throttling-herhalingen. De smaaktest koos het progressieve skeleton; de
wacht-overlay (`?histogram=wait` en de `?dev`-toggle) verviel in U30 (MIP-12).

| Run / profiel | Cold TTFR | Passieve chunks | L2 tijd-tot-compleet | L2/scrubtransfers | Warm chunks | Sessie | Tweede klik |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 / Desktop | 469,6 ms | 547.578 B | 202,5 ms | 4 / 85 | 0 B | 1.245.200 B | 0 |
| 1 / Mobiel 4G | 1.672,3 ms | 559.471 B | 1.077,4 ms | 4 / 85 | 5.430 B | 1.262.647 B | 0 |
| 1 / Mobiel Fast 3G | 3.623,3 ms | 631.607 B | 1.409,3 ms | 5 / 85 | 10.451 B | 1.363.887 B | 0 |
| 2 / Desktop | 428,7 ms | 547.578 B | 178,8 ms | 4 / 85 | 0 B | 1.245.200 B | 0 |
| 2 / Mobiel 4G | 1.717,9 ms | 559.504 B | 1.243,4 ms | 4 / 85 | 5.430 B | 1.258.521 B | 0 |
| 2 / Mobiel Fast 3G | 3.759,1 ms | 631.607 B | 1.593,4 ms | 7 / 85 | 5.879 B | 1.304.437 B | 0 |

De tijd-tot-compleet loopt vanaf de expliciete L2-intentie tot de client alle
puntreeksen heeft. De sessieduur blijft de bredere journeymaat uit de suite.
De twee runs hierboven zijn opeenvolgend uitgevoerd op de definitieve code. De
synthetische tijdlijn bevat daarbij expliciet een nowcast→seamless-grens zonder
motion-annex op het eerste seamless-frame; het volgende annex wordt voor die
overgang geleend. Historische tabellen hieronder documenteren de
pre-progressieve baselines en blijven daarom ongewijzigd.

Drie opeenvolgende merge-gateruns op de aangescherpte meting waren groen:

| Run | Desktop warm chunks | 4G warm chunks | Fast 3G warm chunks | Desktop sessie |
| --- | ---: | ---: | ---: | ---: |
| 1 | 0 B | 5.430 B | 5.430 B | 1.282.633 B |
| 2 | 0 B | 5.430 B | 5.430 B | 1.282.633 B |
| 3 | 0 B | 5.430 B | 5.430 B | 1.282.633 B |

De mobiele transfer bestaat telkens uit drie `feels_like_c`-ranges; 5.430 B
ligt ruim onder maar blijft expliciet begrensd door het bestaande 12-kB-budget.

De warmbudgetten zijn gekalibreerd tijdens zowel normale hostbelasting als een
load-average van 12 door gelijktijdige ingest. Daarbij werden uitschieters van
1.285 ms desktop en 2.991 ms op 4G gezien; 1.500/3.500 ms blijft streng maar
voorkomt een gate op toevallige hostcontendentie. De gevraagde mobiele
coldgrenzen van 4/8 seconden hoefden niet te worden verruimd. De twee verplichte
opeenvolgende runs na de finale kalibratie waren:

| Run / profiel | cold TTFR | warm TTFR | scrub p50/p95 | scrubtransfers | sessie | downloadtijd | tweede klik |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| synth 1 / desktop | 464,8 ms | 670,7 ms | 10,9 / 22,4 ms | 23 / 83 | 1.310.219 B | 5.692,0 ms | 0 |
| synth 1 / 4G | 1.727,0 ms | 1.232,4 ms | 17,9 / 39,7 ms | 23 / 83 | 1.326.870 B | 14.813,1 ms | 0 |
| synth 1 / Fast 3G | 3.985,2 ms | 1.664,4 ms | 21,9 / 49,4 ms | 22 / 83 | 1.326.870 B | 21.729,1 ms | 0 |
| synth 2 / desktop | 446,7 ms | 574,2 ms | 12,4 / 19,9 ms | 23 / 83 | 1.310.219 B | 5.791,2 ms | 0 |
| synth 2 / 4G | 1.659,9 ms | 1.450,5 ms | 19,2 / 47,0 ms | 23 / 83 | 1.326.870 B | 16.686,0 ms | 0 |
| synth 2 / Fast 3G | 3.984,8 ms | 1.431,0 ms | 17,4 / 46,7 ms | 21 / 83 | 1.326.870 B | 20.753,8 ms | 0 |

`downloadtijd` loopt van de cold navigatie tot de laatste voltooide response in
de gescripte journey. De vaste interactiestappen zitten dus in het interval;
het getal is bedoeld om profielen en latere data-diëten binnen deze suite te
vergelijken, niet als losse netwerkbenchmark.

### U1: zichtbaar bereik direct, geen deep-idle-poort

Het U1-laadprofiel (zie hieronder) toonde dat de histogrambalken buiten −1…+2 u
pas na de vaste deep-idle-timer van 30 s laadden: op prod 100% gevuld na 37,4 s
desktop en 40,7 s op 4G, terwijl netwerk en decode voor die rest samen maar
~1,5 s kostten. Sindsdien:

- L1 is het volledige zichtbare histogrambereik (tijdlijnstart tot de gekozen
  horizon), gestart direct na de locatiekeuze in plaats van na idle, en
  geordend dichtst-bij-nu eerst. Alleen wat buiten de horizon valt (plus de
  volledige uurveldreeksen) blijft L2: intentie of diepe idle.
- Ieder gedecodeerd regenframe vult direct zijn balk, ook als kaart of
  prefetch het opvroeg.
- zstd-decode draait in een pool van maximaal vier workers; met één worker was
  decode de nieuwe poort (alle bytes binnen op 3,3 s, laatste balk op 6,7 s).
- Per chunk-URL loopt één Range tegelijk. Chromium cachet een tweede,
  gelijktijdige Range op dezelfde cache-entry niet betrouwbaar; dit haalde ook de
  bekende mobiele warm-hertransfer van 5.430 B (`feels_like_c`) weg.
- Spans blijven bewust omvattend (één per chunk, incl. motion-annexen). Een
  geïsoleerde probe liet zien dat Chromium gecachte bytes verliest bij
  aangrenzende, apart geschreven Ranges (het gedeelde blok van de oudere Range)
  en bij een EOF-Range met een latere buur, maar niet bij een Range die volledig
  binnen een andere valt. Splitsen rond al geladen frames brak daarom warm 0 B.

Prod (deze build, `/data` van motregen.nl, 2026-09-23 ~13:30Z), koud:

| Profiel | 100% gevuld vóór | 100% gevuld na | /data-requests | /data-bytes |
| --- | ---: | ---: | ---: | ---: |
| Desktop | 37.360 ms | 4.100 ms | 114 → 27 | 6,91 → 6,50 MB |
| Mobiel 4G | 40.737 ms | 9.399 ms | 102 → 27 | 7,01 → 6,50 MB |

Het passieve pad op prod omvat nu het volledige zichtbare bereik (circa
4,7 MB regen + 1,7 MB uurvelden); vóór U1 kwam vergelijkbaar volume binnen de
eerste 40 s alsnog binnen via autoplay-prefetch en de deep-idle-L2. Op de
synthetische gate:

| Run / profiel | Cold TTFR | Passieve chunks | L2 compleet / transfers | Warm chunks | Sessie | Tweede klik |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 / Desktop | 918,7 ms | 719.874 B | 313,0 ms / 1 | 0 B | 1.262.516 B | 0 |
| 1 / Mobiel 4G | 2.387,9 ms | 719.874 B | 1.219,0 ms / 1 | 0 B | 1.262.516 B | 0 |
| 1 / Mobiel Fast 3G | 3.882,6 ms | 719.874 B | 838,6 ms / 1 | 0 B | 1.262.516 B | 0 |
| 2 / Desktop | 707,6 ms | 719.874 B | 238,6 ms / 1 | 0 B | 1.262.516 B | 0 |
| 2 / Mobiel 4G | 2.236,1 ms | 719.874 B | 962,9 ms / 1 | 0 B | 1.262.516 B | 0 |
| 2 / Mobiel Fast 3G | 5.728,4 ms | 719.874 B | 1.352,5 ms / 1 | 0 B | 1.262.516 B | 0 |

De runs liepen terwijl een parallelle track op dezelfde host zijn e2e draaide
(fps-indicatie tot 5,6); de hogere cold-TTFR's vallen binnen de budgetten.

## Nulmeting echte data

Gemeten op 2026-08-31 via productiebuild/preview op `:4186`, met `/data`
geproxyd naar de echte Caddy op `:8080` en dezelfde lokale basemap. Dataset:
12 chunks, 9 velden; manifest ongeveer 1–1,5 minuut oud. Chromium/SwiftShader,
1280×720:

- TTFR: **1.141,2 ms**;
- scrub (13 zichtbare commits over de tijdlijn): **p50 69,1 ms**, **p95 172,7 ms**;
- fps-indicatie na stabiliseren: **60**;
- eindstand Resource Timing: **110 requests / 20.118.133 bytes**, waarvan
  104 chunkrequests / 19.772.524 bytes;
- console-, pagina- en requestfouten: **0**.

De echte nulmeting ligt qua bytes bewust naast de synthetische lab-gate: de
live dataset gebruikt grotere grids en negen velden. De 20,1 MB is de huidige
praktijkbaseline om toekomstige verbeteringen of regressies tegen af te zetten;
de `<8 MB`-assertion blijft de reproduceerbare synth-gate uit MIP-7.

### Mobiele nulmeting

Gemeten op 2026-08-31 met de productiebuild en lokale basemap tegen één
bevroren snapshot van de operationele ingest: gegenereerd om 14:28:36Z,
12 chunks, 9 velden en 121 zichtbare tijdlijnframes. Een lokale Caddy serveerde
de echte immutable chunks met Range-ondersteuning; alle CPU- en
netwerkbeperkingen zijn browser-side toegepast. Daardoor delen de drie
profielen exact dezelfde data en is netwerkruis van de origin geen verborgen
variabele.

| Profiel | cold TTFR | warm TTFR | scrub p50/p95 | scrubtransfers | sessie | downloadtijd | tweede klik | fouten |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Desktop | 1.203,8 ms | 1.425,6 ms | 18,5 / 47,5 ms | 22 / 121 | 20.758.929 B | 15.269,7 ms | 0 | 0 |
| Mobiel 4G | 12.994,9 ms | 2.949,4 ms | 35,4 / 80,2 ms | 22 / 121 | 20.759.059 B | 46.831,6 ms | 0 | 0 |
| Mobiel Fast 3G | 59.534,5 ms | 2.959,5 ms | 34,1 / 63,6 ms | 20 / 121 | 24.090.390 B | 141.760,5 ms | 0 | 0 |

De 4G/Fast-3G cold TTFR's van 13,0 en 59,5 seconden gelden niet als
budgetfailure: live data is informatief. Ze maken wel concreet dat de huidige
sessie van circa 21 MB op een typische mobiele verbinding het data-dieet
domineert. Fast 3G droeg bovendien 3,3 MB extra over door Range-herhalingen
onder throttling. De tweede locatieklik bleef in alle profielen exact nul.

Een directe run tegen `https://motregen.nl` is eveneens geprobeerd. De origin
serveerde op dat moment frontendasset `index-8SfFjKkC.js`, zonder de op `main`
aanwezige MIP-7-API `window.__motregenPerf`; de verse productiedata was wel
bereikbaar. Daarom is geen niet-vergelijkbare TTFR verzonnen en staat de tabel
hierboven expliciet als productiebuild plus operationele ingestsnapshot. Zodra
de frontenddeploy `main` heeft ingehaald, meet dezelfde live-opdracht de origin
zonder budgetasserties.

## Benchmark tegenover Buienradar

Op 2026-08-31 is één geldige cold journey per site en profiel gemeten. De live
Motregen-origin had nog geen `window.__motregenPerf`; daarom draaide Motregen als
lokale productiebuild tegen een bevroren snapshot van echte ingestdata,
gegenereerd om 14:53:14Z: 12 chunks en 9 velden. Een lokale Caddy serveerde de
chunks met Range-ondersteuning en een deterministische basemap zonder externe
tiles. Buienradar draaide rechtstreeks tegen `https://www.buienradar.nl` met
zijn eigen tiles, consent-, advertentie- en derdepartijverkeer.

| Profiel | Site | Eerste radar: tijd / bytes / requests | Netwerkstil: tijd / bytes / requests | LCP | Sessie: tijd / bytes / requests |
| --- | --- | ---: | ---: | ---: | ---: |
| Desktop | Motregen | 0,94 s / 18,71 MB / 37 | 2,95 s / 18,71 MB / 37 | 0,27 s | 7,44 s / 18,83 MB / 47 |
| Desktop | Buienradar | 1,97 s / 3,18 MB / 162 | timeout @ 31,99 s / 6,76 MB / 406 | 1,25 s | timeout @ 65,95 s / 10,23 MB / 511 |
| Pixel 5 4G | Motregen | 2,26 s / 0,54 MB / 35 | 20,02 s / 18,71 MB / 35 | 0,91 s | 25,09 s / 18,83 MB / 45 |
| Pixel 5 4G | Buienradar | 16,71 s / 2,24 MB / 140 | timeout @ 76,73 s / 8,72 MB / 456 | 14,77 s | timeout @ 143,17 s / 15,18 MB / 565 |
| Pixel 5 Fast 3G | Motregen | 5,84 s / 0,54 MB / 35 | timeout @ 65,84 s / 7,05 MB / 35 | 2,42 s | 98,02 s / 18,83 MB / 45 |
| Pixel 5 Fast 3G | Buienradar | 34,15 s / 2,40 MB / 149 | timeout @ 94,25 s / 7,69 MB / 436 | 30,43 s | timeout @ 160,32 s / 13,78 MB / 604 |

Een timeout betekent dat de site sinds de radarmijlpaal binnen 30 seconden op
desktop of 60 seconden op mobiel geen twee seconden netwerkstilte bereikte. De
bytes en requests zijn dan de stand op de timeoutgrens, niet een claim dat de
site volledig geladen was. De korte sessie krijgt dezelfde stiltegrens.

### Vergelijkbaar meetcontract

- Iedere test gebruikt een verse browsercontext met uitgeschakelde cache. De
  drie profielen en CDP-netwerk-/CPU-instellingen zijn gelijk aan de mobiele
  labprofielen hierboven.
- `requests` telt via CDP gestarte requests. `bytes` is
  `Network.loadingFinished.encodedDataLength` en telt alleen responses die op
  het meetmoment voltooid zijn. Een download die bij de eerste radar nog loopt,
  staat dus wel bij requests maar nog niet bij bytes.
- De eerste Motregen-radar vereist de interne TTFR-renderbevestiging én een
  zichtbaar WebGL-canvas. Bij Buienradar vereist hij een volledig geladen,
  zichtbare `leaflet-image-layer` voor regen nadat de verplichte gratis keuze
  en cookietoestemming zijn afgehandeld. Dit zijn implementatiespecifieke
  detectors voor dezelfde gebruikersmijlpaal, geen identieke renderpipeline.
- Netwerkstilte betekent twee seconden zonder requeststart of -einde met
  maximaal twee langlopende verbindingen. Dit is een expliciete proxy voor
  “fully loaded”; advertentiepagina's bereiken de strengere nul-open-requests
  toestand vaak nooit.
- LCP komt uit de gebufferde browser-`PerformanceObserver`. De eerste interactie
  bevriest LCP volgens de web-vitalssemantiek. Bij Buienradar kan het grootste
  element daardoor de verplichte toegangsdialoog zijn in plaats van de kaart;
  dat is onderdeel van de gemeten cold-openervaring.
- De Motregen-journey toont de radar, schuift vijf tijdstappen, speelt twee
  seconden en pauzeert. Buienradar toont de radar, sluit de eventuele
  promotie, kiest `-1u`, keert terug naar `+3u` en kijkt nog twee seconden. De
  compacte Buienradarkaart bood geen gelijkwaardig Play/Pauze-control.

Dit is een richtinggevende momentopname, geen statistische verdeling. Vooral
Buienradars advertenties, campagnes en CDN-responses variëren per bezoek. Ook
heeft de lokale Motregen-origin op desktop geen internetafstand, terwijl de
mobiele profielen wel browser-side RTT en bandbreedte op zowel lokale als
externe requests toepassen. Mislukte diagnostische runs zijn niet in de tabel
opgenomen. De on-demand suite draait alleen met een expliciete origin en schrijft
de ruwe resultaten naar `web/tmp/competitive-benchmark.json`:

```sh
cd web
MOTREGEN_BENCHMARK_ORIGIN=http://127.0.0.1:4192 pnpm e2e:benchmark
```

### Verdict

Motregen wint nu overtuigend op het moment waarop de radar bruikbaar wordt:
ongeveer 2,1× sneller op desktop, 7,4× op 4G en 5,8× op Fast 3G. Ook LCP en het
requestaantal zijn veel lager. Motregen bereikt netwerkstilte op desktop en 4G;
Buienradar bleef in alle profielen verkeer genereren en eindigde na de korte
journey op 511–604 requests tegenover 45–47 voor Motregen.

Buienradar wint op het totale datadieet van deze journey: 10,23–15,18 MB
tegenover Motregens vrijwel vaste 18,83 MB, dus 19–46% minder. Omdat
Buienradar bij de cutoff nog niet stil was, kan zijn uiteindelijke totaal verder
oplopen; de gemeten journey blijft desondanks lichter. Motregen haalt de eerste
mobiele radar slim binnen na slechts 0,54 MB, maar laadt daarna op de achtergrond
alle huidige databundels. Op Fast 3G was na 60 seconden pas 7,05 MB voltooid en
kwam de rest tijdens de interactie alsnog binnen. De prioriteit is daarom niet
de eerste render maar demand-driven laden en een kleiner sessiedatadieet, zonder
de huidige voorsprong in bruikbaarheid en requestdiscipline op te geven.

## Meetoverhead

Wanneer de HUD verborgen is, doet de collector per rAF alleen teller- en
tijdvergelijkingen zonder allocaties. Resource Timing-classificatie en
percentielsortering gebeuren uitsluitend bij een snapshot; een zichtbare HUD
vraagt die twee keer per seconde op. Een microbenchmark op dezelfde host mat
1.000.000 fps-callbacks in 7,14 ms (**0,007 µs/callback**) en 10.000 snapshots
met 120 resource-entries in 549 ms (**0,055 ms/snapshot**). Dit is ruim onder
één promille van een 16,7-ms framebudget; in de labruns was geen afzonderlijk
meetbaar fps-effect zichtbaar.

## Laadprofiel (U1)

`pnpm e2e:profile` (synth) en `pnpm e2e:profile:prod` (deze build, `/data`
geproxyd naar `https://motregen.nl`) openen de app koud voor desktop en mobiel
4G, zonder interactie, en wachten tot alle zichtbare histogrambalken gevuld
zijn (time-out 90/150 s). Met `MOTREGEN_PROFILE_TARGET=origin` draait hetzelfde
rechtstreeks tegen een origin; dan ontbreken de app-interne lagen als die
bundle geen loadtrace heeft. Per run komen een JSON en een leesbare tijdlijn in
`web/e2e/profiles/` (gitignored):

- elke `/data`-request met start, eerste byte, einde, bytes (CDP
  `encodedDataLength`), Range, bron/veld en frame-indexen, plus de laag
  (`header`, `map`, `motion`, `prefetch`, `L0`, `L1`, `L2`, `refresh`) en
  prioriteit uit `window.__motregenPerf.loads`;
- de histogramvulling als tijdreeks (DOM-sampler op iedere wijziging van
  `rect.rain-bar[.pending]`) en de mijlpalen 50/90/100%;
- per zichtbare balk de keten ingepland → queue-start → request → bytes →
  decoded → balk, met het grootste wachtsegment als poort, en de kritieke
  keten van de laatst gevulde balk.

De loadtrace staat altijd aan maar is begrensd (4.000 requests/frames/marks) en
doet per event alleen een push; er wordt niets verstuurd.

`MOTREGEN_E2E_PORT`/`MOTREGEN_E2E_DATA_PORT` verschuiven de preview- en
Caddy-poorten van `pnpm e2e` en het profiel, zodat parallelle tracks op één
host elkaar niet blokkeren.

## Mobiele laadrig

U53 begint met de echte PO-opnames van 2026-10-07. De kleine, gehashte
samenvatting staat in `web/perf/po-fidelity.json`; ruwe opnames blijven lokaal.
De secondehistogrammen beginnen bij het eerste waargenomen event: de export
bevat absolute timestamps maar geen navigatie-timeOrigin.

| Maat | Android Chrome 10:01 | Android Firefox 10:02 | Pixel-emulatie 09:22 | Pixel versus Chrome |
| --- | ---: | ---: | ---: | ---: |
| Decodes | 801 | 903 | 804 | +0,4 % |
| Decode totaal | 21.808 ms | 28.148 ms | 7.785 ms | −64,3 % |
| Decode p50 | 19,1 ms | 21 ms | 9,2 ms | −51,8 % |
| Decode p95 | 74,6 ms | 93 ms | 17,3 ms | −76,8 % |
| Encoded body bytes | onbekend | onbekend | onbekend | niet meetbaar |

De oude Pixel-emulatie reproduceert het aantal, maar mist de gevraagde ±30 %
op decodetijden. CDP's CPU-throttle remt uitsluitend paginawerk; workers
blijven op hostsnelheid. Een hogere throttle is daarom geen kalibratie van
de decoder. De opnames bevatten geen Resource Timing/netwerklog; bytes zijn
dus ontbrekende brondata, geen nul. GPU, thermiek, browserimplementatie en
de inmiddels gewijzigde client/codec beperken de vergelijking verder.
CPU/netwerkvarianten van de nieuwe offline rig worden apart gerapporteerd.

De rig draait vanuit `web` in devenv. Eén commando genereert zijn eigen
synthdata, bouwt deze client, start twee lokale Caddy-servers, neemt de eerste
30 seconden op en schrijft JSON, Markdown, een Chrome-trace en de ruwe bronnen
naar `web/tmp/perf-mobile/`. De poorten zijn per worktree eigen (zie §Laadlat); het bestaande
e2e-slotscript houdt één Chromium per slot. Het Playwrightproject heet
`desktop` voor het worker-regime, maar de context is expliciet Pixel 5.

```sh
pnpm perf:mobile --profile mobile-4g --scenario koud
pnpm perf:mobile --profile mobile-fast-3g --scenario journey
pnpm perf:mobile --profile all --scenario all --repeat 3 --baseline
pnpm perf:mobile --profile all --scenario all --compare
```

`--baseline` vereist minstens drie runs per combinatie. De spreiding is
`100 × (maximum − minimum) / gemiddelde` en moet voor decodes én bodybytes
strikt kleiner dan 5 % zijn. `--compare` vergelijkt iedere run met
`web/perf/baselines/<profiel>-<scenario>.json` en geeft exit 1 zodra bytes of
decodes meer dan de baselinegrens (10 %) stijgen. Een ander meetcontract is een
fout: fixture, scenario, CPU/netwerk en meetcode mogen niet stil veranderen.
De opgeslagen SHA is de gemeten client plus rig; de productbasis voor deze
track is main `234c8ad` (U50/U51, 2026-10-07). De bestaande U51-profielen en
budgetten worden door U53 niet veranderd. U51's absolute bytebudgetten horen
bij zijn eigen journey met HTTP-cache aan; deze rig toetst het hierboven
vastgelegde contract relatief tegen zijn eigen baseline.

De scenario's staan als data in `web/perf/scenarios.json`. `koud` opent op nu
en blijft gepauzeerd. `journey` schuift na 8 s twee uur vooruit, speelt van
9–19 s, kiest Wind en keert naar Weer terug. De storm wisselt binnen 3 s
Weer→Lucht→Gevoel→Wind en keert na 5 s terug naar Weer. Deze main heeft vóór
U42 nog geen zelfstandige Lucht-knop: de adapter gebruikt de bestaande
Weer-wolkenfocus, schrijft dat in de acties/bevindingen, en kiest automatisch
de native Lucht-knop zodra die bestaat. Modeklikken scrollen de tabel in beeld
zoals een normale browserinteractie; eventuele extra tabeldata telt mee.

Alleen `Date` staat vast op het tijdstip van de synthmanifestkopie.
Performance, timers, animaties, profiler en netwerk blijven native.
Vier kernen/4 GB en de coarse pointer kiezen het mobiele `in-view`-budget.
Een verse context, geblokkeerde serviceworker en uitgeschakelde HTTP-cache
maken herhalingen vergelijkbaar. Externe HTTP(S)-requests worden vóór verzending
geblokkeerd en maken de test rood. Er is geen profielsink of live data-origin.
De lokale vectortile heeft water en land en oefent de echte MapLibre-worker,
maar zijn ene kleine body representeert geen OpenFreeMap-kaart.

De rapportmaten betekenen:

- TTFR volgt de definitie onder Meetpunten; de oudere baselines hieronder gebruiken
  de toenmalige eerste-renderdefinitie. Splash-weg is
  de werkelijk verborgen splash na de CSS-reveal, bemonsterd per DOM-mutatie
  en met een timerinterval van 100 ms.
- Ttfh is het eerste complete regenhistogram voor nu ±1 u. De rig gebruikt
  U52's native `windowReadyMs.rain_rate` zodra die aanwezig is; op deze main
  wordt het uit geladen tijdlijnindices in de loadtrace afgeleid. Alle native
  window-ready-velden blijven in JSON staan; ontbrekende meetpunten blijven
  expliciet onbekend. Decodes, totale tijd en nearest-rank-p50/p95 zijn per
  veld beschikbaar; de histogrammen tellen startmomenten per navigatieseconde.
- Wire weight telt encoded **bodybytes**, exclusief headers/TLS. De twee
  bronnen zijn Playwright request/response-sizes plus Range-headers, en native
  Resource Timing van pagina én workers, met hun timeOrigins genormaliseerd.
  De raw-JSON bewaart pagina/worker-RT apart. Navigatie telt bij overig mee.
  Een worker-script dat Playwright als 0 bodybytes rapporteert krijgt uitsluitend
  bij een voltooide response de encoded Content-Length; de oorspronkelijke
  sizes, header en fallbackbron blijven in het requestlog en rapport staan.
- Chromium kan onder interceptie/throttling `ERR_ABORTED` melden nadat een
  body compleet is. De rig leest ook requestfailed-sizes. Alleen wanneer de
  gemeten body gelijk is aan Content-Length én RT dezelfde body bevestigt,
  telt deze response als gemeten; het transportlabel en aantal blijven bewaard.
  Echte onvolledige/onbekende bodies zijn een bevinding. Een verschil >2 %,
  ook per soort of individuele response, wordt nooit weggeafrond en verhindert
  hier baselinevorming.
- Bytes vóór TTFR/ttfh tellen bodies waarvan het response-einde vóór die
  mijlpaal ligt. Een nog lopende body kan Resource Timing niet tussentijds
  meten; dit is een expliciete ondergrens op verkeer tot die mijlpaal.
  Sinds U63 tellen de 30-s-totalen alle requests die binnen die periode **beginnen**, inclusief
  hun volledige body als die vlak na de grens eindigt. De rig laat de waargenomen requests
  maximaal 10 s uitlopen en selecteert Playwright en Resource Timing beide op starttijd. Hij
  verzint geen bodygrootte bij de grens; onvolledige bodies, ontbrekende starttijden of requests
  die niet uitlopen blijven rood. De ruwe bronnen bewaren de echte eindtijd, ook boven 30 s.
- LoAF telt lange frames, totale duur, blokkeertijd en de drie grootste
  scriptbronnen. Hoofddraadbezetting is het aandeel Self-Profiling-samples met
  een stack, inclusief idle samples in de noemer. De top-3 gebruikt dezelfde
  `prof:top`-analyse met passende sourcemaps. Ontbrekende sampleposities houden
  hun bundelpositie; een verkeerde buildhash faalt. Zonder profiler is het
  percentage onbekend.
- De storm rapporteert bodybytes per veld en focusrequests die pas na een
  volgende modusintentie eindigen. Dat zijn kandidaten voor verspild werk:
  tabel/ambient lagen kunnen dezelfde data alsnog nodig hebben. De raw-trace
  bewaart tijdstip, Range, laag en prioriteit voor controle op de latere U52-run.

Voor CPU-kalibratie kan `--cpu-rate 1` of `--cpu-rate 8` worden toegevoegd.
Dat verandert uitsluitend de page-throttle en wordt onderdeel van het
meetcontract. Het is geen vervanging voor een echte worker-CPU-budgettering;
een toegevoegde kunstmatige decodepauze zou de decoderfase niet eerlijk
kalibreren. Baselines zijn geschikt voor wire weight en aantallen op deze
fixture; telefoontijden vereisen een nieuwe echte opname met dezelfde code,
data en netwerklog.

De gemeten CPU/netwerkvarianten staan in `web/perf/calibration.json`, inclusief
alle fase-p50's, secondehistogrammen en delta's ten opzichte van de historische
Chrome-opname. De eerste gecontroleerde varianten op rigcommit `d035d74`:

| profiel | page-CPU | decode p50 / p95 | tabel-render p50 | bodybytes |
| --- | ---: | ---: | ---: | ---: |
| 4G | 1× | 0,2 / 2,4 ms | 0,2 ms | 1.141.260 |
| 4G | 4× | 0,3 / 2,0 ms | 0,8 ms | 1.141.260 |
| 4G | 8× | 0,2 / 1,6 ms | 1,6 ms | 1.141.260 |
| Fast 3G | 1× | 0,2 / 1,6 ms | 0,2 ms | 1.141.260 |
| Fast 3G | 4× | 0,3 / 1,2 ms | 0,7 ms | 1.141.260 |
| Fast 3G | 8× | 0,2 / 1,6 ms | 2,3 ms | 1.141.260 |

Het ±30 %-getrouwheidsdoel is **niet gehaald**. De decoder-p50 wijkt in deze
fixture circa −99 % af van de oude Chrome-opname (19,1 ms); de hoofddraad
reageert wel op de throttle. Dit is een kleinere synthgrid (190×230), een
andere client/codec en een gepauzeerd scenario. De netwerkprofielen blijven
de gekalibreerde U51-referentie; de oude PO-export biedt geen bytebron om
een telefoonspecifieke netwerkcalibratie uit af te leiden. De rigclaim is
reproduceerbare aantallen/bytes en waargenomen fasen op de host, met deze
expliciete grens voor uitspraken over telefoontijden.

Baseline op 2026-10-07, product-main `234c8ad` plus rig `d035d74`. Alle zes
combinaties liepen driemaal achter elkaar onder één e2e-slot (18 opnames,
synchrone exit 0). In **alle** combinaties was de spreiding op decodes én
bytes 0 %. De tabel gebruikt de opgeslagen run met mediane bodybytes (bij
gelijke bodies de tweede run); tijden zijn informatief en afgerond op ms.
JSON bewaart de precieze waarden, faseverdelingen per veld, secondehistogram,
gemiddelde requestgrootte, bytecategorieën uit beide bronnen en bronnen-top-3.

| profiel | scenario | TTFR | splash weg | ttfh | decodes | bodybytes | requests / Range |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 4G | koud | 1.581 ms | 3.486 ms | 2.522 ms | 113 | 1.141.260 | 79 / 67 |
| 4G | journey | 1.625 ms | 3.581 ms | 2.553 ms | 207 | 1.280.402 | 111 / 97 |
| 4G | storm | 1.585 ms | 3.486 ms | 2.587 ms | 280 | 1.741.732 | 107 / 90 |
| Fast 3G | koud | 4.924 ms | 6.811 ms | 6.659 ms | 113 | 1.141.260 | 79 / 67 |
| Fast 3G | journey | 4.787 ms | 6.688 ms | 6.524 ms | 207 | 1.280.402 | 111 / 97 |
| Fast 3G | storm | 4.947 ms | 6.861 ms | 6.718 ms | 280 | 1.741.732 | 107 / 90 |

| profiel / scenario | LoAF | blocking | hoofddraad bezet | late focusrequests |
| --- | ---: | ---: | ---: | ---: |
| 4G / koud | 8 | 375 ms | 11,7 % | 0 |
| 4G / journey | 21 | 472 ms | 20,1 % | 0 |
| 4G / storm | 13 | 556 ms | 20,2 % | 0 |
| Fast 3G / koud | 7 | 411 ms | 11,7 % | 0 |
| Fast 3G / journey | 22 | 445 ms | 21,0 % | 0 |
| Fast 3G / storm | 15 | 785 ms | 19,3 % | 4 |

De Fast-3G-storm liet vier focusrequests (97.493 B) pas na de volgende
modusintentie eindigen: twee temperatuur-Ranges, één cloud-frac-Range en
één druk-Range. Dat is controleerbare transportoverlap; gedeeld gebruik door
de zichtbare tabel voorkomt een harde claim dat al deze bytes nutteloos zijn.
De storm kost in deze fixture 600.472 B extra ten opzichte van koud; de
journey 139.142 B. De RT- en Playwright-totalen waren per soort en per response
exact gelijk. De ontbrekende U52-meetpunten en Lucht-adapter blijven als
bevinding in de baselines staan.

## Laadlat: ttfp naast Buienradar (U54, MIP-19 §De lat)

De maat is `ttfp` (time to first play): van navigatiestart tot de kaart een regenframe toont
én de tijdlijn op het scherm loopt. De client telt de eerste wissel van het linker regenframe
in een getekend beeld terwijl `playing` aan staat (`PerfMonitor.markRainFrameCommitted`); een
bewegende cursor boven een stilstaande kaart telt dus niet. Doel: `ttfp ≤ ttfp-ref`.

Sinds U68 start de gedeelde afspeelklok na de eerste regentekenbeurt (`mapReady`): cursor,
histogram-glide en kaartregen starten vanaf hetzelfde stilstaande moment. De sluier vloeit
onafhankelijk weg en is geen speelpoort (PO 2026-10-09). De speelregel blijft cursorframe +
volgend frame; uurvelden zijn geen voorwaarde. `ttfr` meet bij autoplay de eerste cursorbeweging
(`firstCursorMs`); bij een bewust gepauzeerde start de eerste regentekening. `ttfp` blijft de
eerste daadwerkelijk getekende wissel van het linker regenframe.
`styleReadyMs`, `firstBasemapTileMs` en `mapRevealedMs` maken kaartopzet en onthulling apart zichtbaar.

```sh
pnpm perf:mobile --scenario koud-spelend --repeat 3            # ttfp, ttfr, ttfh, blank-visible, LoAF 12 s
pnpm perf:mobile --scenario referentie-buienradar --repeat 3   # ttfp-ref
pnpm exec tsx scripts/po-reference.ts compare perf/po-android-reference.json tmp/perf-mobile/<rapport>.json
```

- `koud-spelend` opent zonder `?t`, zodat de app vanzelf afspeelt. `koud` heeft een tijdpreset
  en staat daardoor stil; dat scenario kan geen ttfp meten.
- `referentie-buienradar` meet https://www.buienradar.nl met dezelfde Pixel 5-emulatie en
  hetzelfde CDP-profiel, koud (verse context, cache uit), over het echte netwerk. Het
  radarbeeld is een `img.leaflet-image-layer`; een wissel van zijn `src` is een frame-wissel en
  het tijdlabel dient als tweede getuige. De rig klikt de toestemmingsmuur weg zodra de knop er
  staat. Dat is sneller dan een mens, dus de referentie valt eerder gunstig uit voor Buienradar.
  `ttfp-ref zonder iets over de kaart` telt pas vanaf het eerste beeld waar niets overheen ligt.
- De volledige-kaartgereedheid blijft apart meetbaar als `basemapReadyMs`
  (`map.areTilesLoaded()` na een render); historische TTFR-getallen van vóór U68 maten dat
  samen met de eerste regen, en zijn dus niet rechtstreeks vergelijkbaar met de klokstart.
  `ttfh` is `window-ready:rain_rate`;
  `blank-visible-ms` is de tijd na de splash waarin een zichtbaar regenslot van de scrubber geen
  waarde had en ook niet als "komt nog" getekend was (`core/screen-truth.ts`). Main tekent nog
  geen fog, dus daar telt elk ontbrekend slot als leeg. Tabelrijen tellen nog niet mee.

### Wanneer een rig-meting telt

- **Absolute baseline: loadavg ≤8; gepaarde proef: loadavg ≤16** (1 minuut, `scripts/rig-host.ts`, orkestrator/PO 2026-10-08 12:38). Gepaard betekent A/B om en om, dezelfde po-android-cgroupquota, load per run vastgelegd; `--paired` kan geen `--baseline` schrijven. Absolute referentiewaarden voor deze documentatie blijven voor een rustig venster. `perf:mobile` wacht vóór de run tot de host
  zo rustig is (`--load-wait <minuten>`, standaard 20) en schrijft de loadavg bij de start van
  elke run in het rapport. Runs boven de drempel doen niet mee in de mediaan en staan als
  weggegooid in de samenvatting. Op 2026-10-07 draaiden drie tracks tegelijk rigs (loadavg
  13–18): dezelfde code gaf toen een time-out, 2,9 s en 4,5 s.
- **×3, mediaan.** Eén run is geen meting.
- **Eigen poorten per worktree** (4400–4899 / 8400–8899, afgeleid van het pad). Op de oude vaste
  4392/8392 raakten rigs van verschillende tracks elkaars webserver. `MOTREGEN_E2E_PORT` en
  `MOTREGEN_E2E_DATA_PORT` gaan nog steeds voor.
- De rig en `synthgen` draaien via `tsx`, dat een IPC-socket opent; binnen een sandbox zonder
  socketrechten faalt dat met `listen EPERM`.

### perf-lock

Neem locks altijd in dezelfde volgorde: eerst het e2e-slot, daarna de perf-lock.
Ook losse screenshot-/profielharnesses gebruiken `scripts/e2e-slot.sh flock -w 7200 -o
/home/mathijs/motregen-perf.lock <één opname>`. Met de omgekeerde volgorde kan een
harness de perf-lock vasthouden terwijl beide slots op diezelfde lock wachten.
Wacht op load buiten beide locks; na het verkrijgen van de perf-lock controleert
de opname de load opnieuw en geeft hij de locks bij overschrijding direct vrij.

Iedere perf-opname gebruikt `/home/mathijs/motregen-perf.lock`. Wachten op loadavg ≤8 (absolute baseline) of ≤16 (`--paired`, A/B om en om) gebeurt
**buiten** de lock, ook tussen herhalingen. De lock omvat één opname en wordt direct daarna
vrijgegeven. Builds, typecheck, unit-tests en wachten horen buiten dit meetvenster.

Het hostbrede patroon voor een commando dat precies één opname maakt:

```bash
until node --input-type=module -e 'import { loadavg } from "node:os"; process.exit(loadavg()[0] <= 8 ? 0 : 1)'; do
  sleep 30
done
web/scripts/e2e-slot.sh flock -w 7200 -o /home/mathijs/motregen-perf.lock "$@"
```

Na het verkrijgen van de lock wordt de load opnieuw gecontroleerd. Is hij inmiddels boven de gekozen grens,
dan geeft de runner de lock onmiddellijk vrij en wacht hij opnieuw erbuiten. Exit 75 is
uitsluitend die herhaalbare loadweigering vóór een opname; meetfouten houden hun echte exitstatus.
`-o` voorkomt dat achtergebleven browser- of serverprocessen de lock erven.

`pnpm perf:mobile` bouwt één keer en voert dit patroon zelf per profiel/scenario/herhaling uit;
roep de CLI rechtstreeks aan. De U63-runner stelt alleen de eigen poorten in en doet eventuele
codechecks vooraf. Iedere Playwright-aanroep selecteert precies één `run N` en gebruikt een
e2e-slot. De drie rapporten worden daarna samen gecontroleerd met dezelfde 2%/5%/10%-grenzen.

### U63: meetgrens en nieuw po-android-nulpunt (2026-10-08)

**Hoofdbevinding 2026-10-08: warme cache koopt op po-android vrijwel geen starttijd.**
In de afwisselende eigen-kaartcontrole (productbasis98ae6a6 vóór U62/U65, koud/warm elk×3,
quota40%, startload≤16) is warm ttfr3825/ttfp1942ms tegenover koud3816/1819ms.
Netwerkbody daalt van4971712 naar36513B; warm haalt alleen manifest?s=1 nog over de lijn.
Dit zijn gepaarde proefcijfers, geen nieuwe absolute baseline voor deze documentatie.
De CPU-diagnose laat in2204ms wall878ms renderer-CPU zien: vrijwel de volledige40%-quota.
MapLibre-geometrie/buckets, shader/paintersetup, weersdecode en vroege temperatuurblur
concurreren om dat budget. Profiler-tijden blijven afzonderlijke diagnostiek. Daarom komen
kandidaten die werk verminderen of de volgorde verbeteren vóór caching: kale eerste stijl,
minder werkelijk benodigde lagen/features, kaart-/weerworker-volgorde, uitgestelde shaders.
Z4 blijft een zichtbare PO-smaakkeuze: eerste kaart~1,7s eerder, ttfp~0,3s later; proefbranch
en gepaarde koud/warm-cijfers blijven behouden.


De U63-lus rapporteert eerst **ttfr**, daarna **ttfp**. Lange frames ná ttfp zijn een bewaker:
`.dev/tracks/u63-mobiel-ttfp-lus/summarize.mjs <rapportmap>` leest de oorspronkelijke LoAF-entries
van drie rustige opnames en telt frames die vanaf ttfp starten en vóór 30 s eindigen, inclusief
blocking, langste frame en aantallen boven 100/250 ms. Het verandert het rig-meetcontract niet.
Alle trackopnames lopen via `.dev/tracks/u63-mobiel-ttfp-lus/run-perf.sh`: dezelfde loadavg-grens,
eigen poorten en `flock -w 7200 /home/mathijs/motregen-perf.lock` voor hostbrede serialisatie.

De eerste ongewijzigde nulmeting (`bb0792b`, po-android, koud-spelend ×3, loadavg 6,62–7,39)
gaf mediaan ttfp 1728 ms, ttfr 1352 ms en ttfh 4632 ms. De bytegate was rood: in iedere run
begon een feels_like_c-Range vlak vóór 30 s en eindigde erna. Playwright telde die als een
onbekende body terwijl Resource Timing alleen voltooide responses had. Eén nog lopend request
had bovendien tijdelijk `startTime=0`, wat de koppeling van herhaalde requests op dezelfde URL
verschoof en fictieve bodyverschillen gaf. De voltooide byte-totalen waren gelijk in beide bronnen.

U63 laat daarom requests uitlopen en meet hun volledige kosten op request-start binnen het
venster. Dit verandert uitsluitend de byteboekhouding; mijlpalen, decodevenster en LoAF blijven
op 30 s begrensd. De oude 2%-broncontrole, 5%-spreidingsgrens en 10%-regressiegrens blijven
gelijk. Het gewijzigde meetcontract vereist nieuwe baselines; voor po-android/koud-spelend
bestond nog geen baseline. Het nieuwe nulpunt is gemeten vóór productwijzigingen, met dezelfde
fixture en renderer-quota: ×3, loadavg 6,00 / 7,94 / 5,88, alle bronnen sluitend, exit 0.

| maat | run 1 | run 2 | run 3 | mediaan |
| --- | ---: | ---: | ---: | ---: |
| ttfp | 1730 | 1729 | 2031 | 1730 ms |
| ttfr | 1334 | 1364 | 1606 | 1364 ms |
| ttfh | 4278 | 4253 | 5131 | 4278 ms |
| blank-visible-oppervlak | 168,1 | 157,1 | 193,8 | 168,1 slot-s |
| blank-visible, volledig-leeg-equivalent | 2,63 | 2,46 | 3,04 | 2,63 s |
| LoAF eerste 12 s | 3183 | 2993 | 3724 | 3183 ms |
| decodes / bodybytes | 226 / 4824523 | 226 / 4824523 | 220 / 4809911 | 226 / 4824523 |

Spreiding decodes 2,679%, bytes 0,303%; baseline `po-android-koud-spelend.json` houdt de
bestaande 10%-regressiegrens. Nieuwe Buienradar-referentie op hetzelfde profiel: ttfp-ref
3074 / 2640 / 2664 ms (mediaan 2664 ms), loadavg 7,40 / 6,61 / 7,87, exit 0. De verhouding
van het herstelde nulpunt is 0,65×. De spreiding van ttfh binnen ongewijzigde runs (4253–5131 ms)
begrenst kleine winstclaims; de rig blijft dichter bij de warme telefoon dan de koude.

### Vóór-meting main, 2026-10-07 (mobile-4g, CPU 4×, rig 621576e, loadavg 5,9–7,5)

| maat | run 1 | run 2 | run 3 | mediaan |
| --- | ---: | ---: | ---: | ---: |
| ttfp | 2558 | 4342 | 4446 | 4342 ms |
| ttfr | 1600 | 1620 | 1588 | 1600 ms |
| ttfh | 2887 | 25532 | 29487 | 25532 ms |
| blank-visible-ms | 3977 | 22215 | 26015 | 22215 ms |
| LoAF eerste 12 s, totaal | 2672 | 10239 | 10686 | 10239 ms |
| decodes in 30 s | 356 | 341 | 276 | |
| ttfp-ref Buienradar | 3728 | 3586 | weggegooid (loadavg 8,71) | ≈ 3,6–3,7 s |

De koude start van main is bimodaal: een snelle tak (run 1) en een trage (run 2 en 3) waarin
de puntreeks pas na 25 s laadfase `direct` haalt. De oorzaak en het vervolg staan in de
track-LOG (`.dev/tracks/u54-laadchoreografie-live/LOG.md`).

### Baselines na U54 + U59 (2026-10-08, rig 2afe2ec)

`pnpm perf:mobile --profile all --scenario all --repeat 3 --baseline`, exit 0, loadavg
5,5–7,9, spreiding op decodes en bytes 0 % in alle zes combinaties. Ten opzichte van de
baselines van U59 (ac9961a):

| profiel / scenario | wire (B) was → nu | decodes was → nu |
| --- | ---: | ---: |
| 4G en Fast 3G / koud | 1127388 → 1137555 (+0,9 %) | 128 → 128 |
| 4G en Fast 3G / journey | 1293377 → 1330346 (+2,9 %) | 228 → 263 (+15 %) |
| 4G / storm | 1318557 → 1328724 (+0,8 %) | 189 → 189 |
| Fast 3G / storm | 1572568 → 1328724 (−15,5 %) | 280 → 189 (−33 %) |

De stijging in `journey` is **bedoeld** (orkestrator/PO 2026-10-07): met de speelregel van
MIP-19 §De lat begint afspelen zodra het cursorframe en het volgende er zijn, dus loopt de
tijdlijn binnen de vaste meetduur eerder en verder en toont hij meer frames. Het is geen extra
werk per getoond frame. De ≈ 10 kB bij `koud` en `storm` is de grotere bundel (meetpunten,
speelregel, kader). De daling in de Fast-3G-storm is niet onderzocht; vermoedelijk dezelfde
oorzaak als het verdwijnen van de trage tak (iteratie 1), maar dat is een vermoeden.

Tijden uit dezelfde runs (mediaan ×3): 4G koud ttfr 1653 ms, ttfh 2337 ms; Fast 3G koud ttfr
5098 ms, ttfh 7963 ms; ttfp in `journey` 9,1 s (dat scenario start het afspelen zelf op 9 s).

### Referentie: desktop-MacBook, Firefox Profiler (PO, 2026-10-07 20:32/20:33)

Twee opnames met de Firefox Profiler op de MacBook van de PO: één met Buienradar, één met
motregen op de preview (:4355, commit d315561 of 0eda33a — de opname zegt niet welke). Lezen met:

```sh
pnpm prof:firefox "<opname>.json.gz" [meer opnames…]
```

`web/scripts/firefox-profile.ts` zoekt per contentproces de paginaladingen van Buienradar en
motregen, neemt `Navigation::Start` als nulpunt en leest de `Network`-markers (begin van de
START-marker, eind van de STOP-marker), de paint-markers en — als ze er zijn — onze
UserTiming-mijlpalen. De ruwe opnames worden niet gecommit: ze bevatten ook de andere tabbladen
van de PO.

| meetpunt (ms sinds navigatiestart) | Buienradar | motregen (:4355) |
| --- | ---: | ---: |
| document binnen | 222 | 101 |
| FirstContentfulPaint | 443 | 402 |
| LargestContentfulPaint | 817 | 468 |
| DocumentLoad | 908 | 507 |
| eerste radarbeeld / eerste regen-Range: begin → eind | 697 → 795 | 734 → 1579 |
| tweede radarbeeld / tweede regen-Range: begin → eind | 1704 → 1816 | 1580 → 1859 |
| **ttfp-ref / ondergrens ttfp (tweede beeld binnen)** | **1816** | **1859** |

Motregen-specifiek: manifest 396 → 581 ms; daarna 39 chunk-headers tegelijk, 590 → 1512 ms
(172 kB); basemap-stijl 692 → 702 ms (0 B, uit de cache).

Wat dit zegt: op deze desktop liggen de twee gelijk op het moment dat het tweede beeld binnen
is (1,82 s tegen 1,86 s). Bij motregen is dat een **ondergrens** voor ttfp: na de bytes komen
nog decode, textuur en tekenen; bij Buienradar is een png tonen vrijwel direct. Het eerste
regenframe (100 kB) deed er 845 ms over terwijl de 39 headers de lijn bezetten — hetzelfde
patroon als in de koude telefoonopname.

Wat er **niet** uit te halen is:
- Onze eigen mijlpalen (`milestone:ttfp`, `window-ready:rain_rate`, `blank-visible`,
  texture-upload): de app schrijft die alleen met `?perf` en de opname is zonder gemaakt. Een
  nieuwe opname op `…:4355/?perf=1` geeft ze wel; het script leest ze dan vanzelf.
- Het moment waarop een beeld op het scherm staat. WebGL-uploads en -draws hebben geen eigen
  marker; voor Buienradar is "png binnen" een goede benadering, voor ons niet.
- Of Buienradars animatie doorloopt: de opname stopt ≈ 2,5 s na de navigatie, met precies twee
  radarbeelden. De cadans van 1 beeld/s komt uit de rig, niet uit dit profiel.
- De cachetoestand vooraf (koud of warm) en dus of dit een eerste bezoek was. De radar-png's
  kwamen met body over de lijn (≈ 137 kB); bij motregen kwam de basemap-stijl uit de cache.
- De eerste basemap-tile: geen tile-verzoek in het venster van de opname.
- Eén lading per site: geen spreiding, dus geen mediaan.

### Profiel po-android

**Herijkt op 2026-10-08 (geldt nu):** renderer-quota **40 %**, synthraster **alleen voor regen
×6** (1140 × 1380 cellen). Aanleiding: de productie-headers. Regen is daar 1250 × 1350 cellen;
de uurvelden zijn 209 × 225 (temperatuur, gevoel, wind, vlagen), 157 × 169 (straling),
250 × 270 (uv) en 79 × 85 (wolken) — ongeveer het basisraster van de synthdata (190 × 230). De
eerdere stand rekte álle velden ×3 op: uurveld-decodes en windwerk waren daardoor veel te
zwaar (`feels_like_c` 110 ms per decode) en regen juist te licht (393k i.p.v. 1,69 M cellen).

Sweep met het nieuwe raster, `koud-spelend` op de huidige code, één run per stand, loadavg
5,8–6,6, naast de PO-opnames van 18:05 (koud) en 18:06 (warm) op dezelfde speelregel:

| meetpunt | telefoon warm | telefoon koud | quota 100 % | 60 % | **40 %** |
| --- | ---: | ---: | ---: | ---: | ---: |
| regen-decode p50 | 27,8 ms | 36,1 ms | 3,9 | 10,2 | **19,8 ms** |
| eerste regenframe | 1314 ms | 2540 ms | 742 | 981 | **1347 ms** |
| ttfp | 1797 ms | 3647 ms | 861 | 1197 | **1745 ms** |
| ttfh | 2836 ms | 5552 ms | 1880 | 2057 | **3951 ms** |
| blank-visible (laatste balk) | 2844 ms | 7559 ms | 1468 | 1832 | **3555 ms** |
| lange frames eerste 12 s | 0,4 s (hele opname) | 0,6 s (hele opname) | 1,8 s | 2,0 s | **3,1 s** |
| uurveld-decode p50 (temp_c) | 31 ms | 15 ms | 0,2 | 0,2 | **0,2 ms** |

De rig haalt zijn data lokaal en lijkt daarin op de **warme** telefoonrun; daartegen zit 40 %
op eerste regenframe (+3 %) en ttfp (−3 %) vrijwel goed, op regen-decode −29 % en op ttfh
+39 %. Wat afwijkt: de rig heeft meer lange frames dan de telefoon met de huidige build, en
uurveld-decodes kosten in de rig vrijwel niets terwijl de telefoon er 15–30 ms per stuk over
doet. Uitspraken over uurvelden (tabel, wind, wolken) blijven dus telefoonwerk.
Getallen van vóór deze herijking (kalibratie op 30 %, alle velden ×3) zijn onderling
vergelijkbaar maar niet met de getallen erna.

De rest van deze paragraaf beschrijft de eerdere stand (quota 30 %, alle velden ×3) en hoe de
quota werkt.


`web/perf/po-android-reference.json` is de samenvatting van de koude PO-opname van 16:27:59
(Android Chrome, UA "Linux; Android 10; K"), gemaakt met `scripts/po-reference.ts summarize`.
De ruwe opnames blijven lokaal in `~/motregen-profiles`. Het profiel `po-android` in
`e2e/profiles.ts` bootst die telefoon na:

| knop | waarde | waarom |
| --- | --- | --- |
| viewport / UA | 390 × 844, "Linux; Android 10; K" | uit de opname |
| renderer-quota | 30 % van één kern (`--renderer-quota`) | remt hoofddraad én workers; zie hieronder |
| page-CPU (CDP) | 1× | de quota remt de hoofddraad al; CDP erbovenop zou dubbel remmen |
| netwerk | 30 Mbps, 20 ms RTT | de opnames liepen over wifi naar de dev-host |
| synthraster | ×3 (570 × 690 cellen, `MOTREGEN_SYNTH_GRID_SCALE`) | in de orde van het KNMI-raster (700 × 765); wire 5,5 MB i.p.v. 1,7 MB |

**De quota.** CDP's `Emulation.setCPUThrottlingRate` geldt alleen voor de hoofddraad; op een
workerdoel antwoordt Chrome "Operation is only supported for pages, not workers". Decodes
liepen in de rig daardoor op hostsnelheid (p50 1,1 ms tegen 22 ms op de telefoon). De rig start
het renderer-proces nu in een eigen cgroup:
`--renderer-cmd-prefix=systemd-run --user --scope -p CPUQuota=30% -p CPUQuotaPeriodSec=5ms`.
Dat raakt hoofddraad, decodeworkers en de MapLibre-workers samen. De periode van 5 ms maakt er
een gelijkmatige rem van; met de standaard 100 ms valt de renderer in blokken stil. Het
GPU-proces valt er bewust buiten: SwiftShader is geen telefoon-GPU. Met de hele browser op 1–2
kernen (`taskset`) at SwiftShader de ruimte op (eerste regenframe 2,5–7,1 s tegen 1,15 s)
terwijl een decode op 1–4 ms bleef.

Kalibratie 2026-10-07, loadavg 5,1–7,8, `koud-spelend-vensterregel` (de speelregel van de
opname), één of twee runs per stand:

| meetpunt | PO-opname | quota 50 % | 35 % (×2) | **30 % (×2)** | 25 % | 12 % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| frame-decode p50 | 22 ms | 3,0 | 8,8 / 8,9 | **9,8 / 10,3** | 14,1 | 32,8 |
| frame-decode p95 | 53 ms | 59 | 123 / 101 | **101 / 120** | 140 | 367 |
| basemap-tile p50 | 0,7–1,0 s (trage helft; alle acht: 86 ms) | 0,23 s | 0,43 / 0,45 s | **0,33 / 0,64 s** | 0,48 s | 1,62 s |
| eerste regenframe | 1151 ms | 937 | 1421 / 1459 | **1719 / 1648** | 2032 | 5088 |
| ttfh | 4026 ms | 3286 | 5135 / 5767 | **5880 / 6113** | 7692 | 25529 |
| ttfp | 4,0–4,6 s (orkestrator) | 1606 | 3461 / 3498 | **4050 / 4053** | 5297 | 16263 |
| lange frames 12 s, totaal | 4261 ms | 1795 | 3720 / 4618 | **5412 / 5158** | 6651 | 10047 |
| lange frames 12 s, aantal | 22 | 18 | 35 / 48 | **53 / 50** | 56 | 41 |

Gekozen: **30 %**. ttfp valt in de band van de telefoon, de decode is van −95 % naar −55 %
gegaan en de lange frames kloppen in totale duur (+21 à +27 %). Wat afwijkt: de eerste
mijlpalen zijn te laat (eerste regenframe +45 %, ttfh +50 %), de decode-p95 is twee keer te
hoog en er zijn twee keer zoveel lange frames, elk korter. De oorzaak is dat één quota alle
draden van de renderer uit één budget laat putten, terwijl een telefoon meerdere echte kernen
heeft: decode-p50 en eerste-regenframe zijn met deze ene knop niet tegelijk goed te krijgen
(25 % brengt de decode dichterbij maar zet ttfh op +91 %). De rig is hiermee een ruwe
telefoon, geschikt voor rangorde en voor verschillen tussen varianten uit dezelfde build; een
uitspraak in milliseconden over de echte telefoon blijft een PO-opname.

Een eerdere stand zonder quota (page-CPU 4×, workers ongeremd) gaf op de code van de opname
ttfp 4003 ms en ttfh 4229 ms in de snelle tak, maar met decodes van 1,1 ms; die stand
onderschat alles wat achter de decodewachtrij wacht en is vervangen.

## Eigen basiskaart (U59)

De eigen z4–10-PMTiles-kaart wordt vergeleken met een vastgelegde echte
OpenFreeMap/Liberty-kaart. De kleine synthetische kaart uit de gewone rig is
geen geldig nulpunt voor deze vergelijking. Beide bronnen gebruiken dezelfde
weerfixture, viewport, CPU-/netwerkrem en meetcode, zonder live-netwerk,
serviceworker of HTTP-cache. De bronarchieven en de wijze van herbouw staan
in [basemap.md](basemap.md).

Het orkestratorbesluit van 2026-10-07 maakt **totaal ≤1 s op mobile-4g**
doorslaggevend voor de bijdrage van de basiskaart aan het eerste beeld
(TTFP). De p50-doelstelling verschuift van 150 naar **300 ms als
vervolgstreefwaarde**, zonder harde mobiele gate. De motivatie bij die
bijstelling was dat twee overgezoomde z10-tegels onder 4× CPU-rem de individuele
tegelduren kunnen bepalen, terwijl de hele kaart binnen het totale budget
blijft. Dat is de motivatie voor de streefwaarde, niet de configuratie van
de onderstaande koude startmeting: die laadt op mobiel één tegel op
contain-zoom, met p50 gelijk aan totaal. De eerder genoemde p50 ≈295 ms
is de **desktopmediaan**. Desktop-tijden blijven informatief; de bestaande
wire-/decode-regressiecontrole blijft voor beide profielen een harde check.

De basemap-fase loopt van MapLibre `sourcedataloading` tot `sourcedata` per
tegel. Het totaal is de som van overlappende tegelduur, inclusief netwerk,
worker en afhandeling. Het is geen exclusieve hoofddraad-CPU-tijd en ook
geen directe TTFP-meting. CDP's 4× CPU-rem remt uitsluitend paginawerk;
MapLibre-workers blijven op hostsnelheid. De warme parserproef zonder HTTP
bevestigt geen grote CPU-winst en vervangt de koude meting daarom niet.

De gekoppelde meting van 2026-10-07 gebruikt drie runs per bron en profiel:
OpenFreeMap op `673ac3c`, de definitieve eigen kaart op `6f0519a`. De
mediaan wordt per maat apart berekend; de overige desktop/Android-kenmerken
van de rig blijven behouden. De mobiele totaalgate slaagt in alle drie runs.

| Profiel / bron | Basemap totaal (3 runs) | p50 (3 runs) | Tegels + fonts | Bodybytes | Weerdecodes |
| --- | --- | --- | ---: | ---: | ---: |
| 4G / OpenFreeMap | 5.641 / 5.806 / 5.760 ms | 749 / 946 / 870 ms | 1.306.253 B | 2.987.829 B | 297 |
| 4G / eigen | 438 / 500 / 503 ms | 438 / 500 / 503 ms | 133.345 B | 1.771.489 B | 297 |
| Desktop / OpenFreeMap | 2.651 / 1.080 / 1.230 ms | 254 / 44 / 45 ms | 1.886.538 B | 3.433.687 B | 250 |
| Desktop / eigen | 1.475 / 1.231 / 824 ms | 369 / 295 / 206 ms | 173.458 B | 1.677.175–1.682.198 B | 250 |

Op mobiel daalt het basemap-totaal van mediaan 5.759,5 naar 499,5 ms
(−91,3%). Alle bodybytes dalen **40,71%**; tegels en fonts dalen 89,79%.
Desktop-bodybytes dalen 51,01–51,16%, tegels en fonts 90,81%. Het aantal
weerdecodes verandert niet. Playwright en Resource Timing meten dezelfde
bytes per categorie en response. De byte-/decode-spreiding is 0% op mobiel
en 0,30% / 0% op desktop. Mobiele TTFR-mediaan is 1.738→1.686 ms;
desktop 292→290 ms. De kaartwinst betekent dus geen even grote winst in
de tijd tot de eerste regenlaag.

Een onafhankelijke hercontrole op `18fe5f3` geeft op mobile-4g totaal én
p50 **604,8 / 255,1 / 222,7 ms** (mediaan 255,1 ms). De drie totaalgates
slagen; twee runs halen ook de p50-streefwaarde. Bodybytes zijn
1.776.512 / 1.771.489 / 1.771.489 B (−40,54…−40,71%), met steeds
297 weerdecodes en gelijke Playwright-/Resource-Timing-bytes. De byte-
spreiding is 0,28%, decodespreiding 0%. De eerste run bevat een extra
5.023-byte profilerasset; die blijft meetellen. Dit is geen nieuwe baseline
en de tijdvariatie wordt niet als telefoonbenchmark gepresenteerd.

De desktophercontrole op dezelfde head geeft totaal 926,7 / 1.421,4 /
1.330 ms en p50 231,6 / 355,1 / 332 ms. Bodybytes blijven
1.677.175–1.682.198 B, 250 weerdecodes, met gelijke bytebronnen en
0,30% / 0% byte-/decodespreiding. Deze tijden tonen de gevoeligheid voor
hostbelasting; desktop krijgt daarom geen mobiele tijdgate opgelegd.

Reproduceren op de eigen trackpoorten:

```sh
MOTREGEN_E2E_PORT=4393 MOTREGEN_E2E_DATA_PORT=8393 \
  pnpm --filter motregen-web perf:mobile --profile mobile-4g --scenario koud \
  --basemap own --repeat 3 --compare
```

Het nulpunt staat in `web/perf/baselines/*-koud-openfreemap.json`. Dezelfde
opdracht met `--basemap openfreemap --baseline` maakt het nulpunt opnieuw,
nadat `pnpm basemap:snapshot` de echte kaartbestanden heeft vastgelegd.
Herhaal met `--profile desktop` voor de informatieve desktop-tijden.

De afzonderlijke SW-cacheproef gebruikt een productiebuild met de normale
stijl-URL, een actieve serviceworker en gewiste browser-HTTP-cache. Dezelfde
bekeken kaart doet op het warme bezoek **nul kaartnetwerkrequests**. Iedere
PMTiles-range komt als 206 uit de serviceworker; offline blijven de stijl en
een headerbereik beschikbaar. Een 256-bytebereik op een andere data-origin
blijft offline byte-identiek. Alleen bekeken bereiken worden opgeslagen,
niet het hele archief. Deze cachewinst is een netwerkclaim; MapLibre moet de
tegels op iedere navigatie opnieuw verwerken, dus warme fasetijden hoeven
niet lager te zijn. Het repro-commando staat in [basemap.md](basemap.md#meten).

De gemeten warme bezoeken op 2026-10-07, steeds Desktop Chrome met de
aangegeven viewport; 390 px krijgt het 4G-netwerk en 4× page-CPU, 1280 px
geen rem. Dat is een afzonderlijke cacheproef, geen identieke Pixel-5-context
van de koude rig:

| Viewport | Kaartnetwerk | Gecachte ranges / bytes | Warm totaal / p50 | Eerste bezoek totaal / p50 |
| --- | ---: | ---: | ---: | ---: |
| 390 px | 0 requests | 2 / 43.611 B | 834,3 / 834,3 ms | 490,6 / 490,6 ms |
| 1280 px | 0 requests | 5 / 83.724 B | 917,3 / 221,3 ms | 1.169,3 / 290,5 ms |

De bron-SHA's, contracthashes, afzonderlijke runs van beide koude metingen
en warme cache-uitkomsten staan in
[`web/perf/basemap-comparison.json`](../web/perf/basemap-comparison.json).
Volledige netwerklogs, traces, screenshots en synchrone commandoreceipts
blijven lokaal in het genegeerde werklog `tmp/basemap/u59/LOG.md`.
### Baseline na de U42/U47-laadregressie (U58, 2026-10-07)

U42 liet op een telefoon tabelrijen onder de kaart uitsteken; de planner laadde daardoor de hele
tabel (koud 297 decodes / 1.646.413 B tegen 113 / 1.065.885 B in de vorige baseline). Sinds U58
laden alleen de rijen die echt in beeld staan en is de RV-reeks weg. Het budget voor
`mobile-4g / koud` is nu **128 decodes / 1.127.388 B (1,13 MB)**: de 15 decodes boven de oude
baseline zijn de zichtbare piep-rijen (temp, gevoel, bewolking, wind u/v, vlaag en straling), dus
bewust geaccepteerd (PO/orkestrator 2026-10-07).

| profiel | scenario | decodes | bodybytes | vorige baseline |
| --- | --- | ---: | ---: | ---: |
| 4G | koud | 128 | 1.127.388 | 113 / 1.065.885 |
| 4G | journey | 228 | 1.293.377 | 207 / 1.225.342 |
| 4G | storm | 189 | 1.318.557 | 280 / 1.572.568 |

Drie runs per scenario, spreiding 0 % op decodes en bytes; `--compare` daarna groen (0,000 %).
De moduswissel in de rig is een DOM-klik in plaats van een Playwright-klik: die scrolde bij een
mislukte hit-test de pagina naar de tabelkop, wat op een telefoon de tabel opent en de hele tabel
laadt (journey 328 in plaats van 228 decodes). De Fast-3G-baselines zijn niet vernieuwd en hebben
nog het oude meetcontract. DOM-werk tijdens laden en afspelen meet
`web/scripts/dom-churn.ts` (mutaties per paginadeel, met de zwaarste knooptypen): hemel-knopen in
de eerste 12 s 72.494 → 18, tabel-knopen 1.196 → 16.

## Live-smoke

`cd web && pnpm e2e:live` draait de volledige journey voor desktop, 4G en Fast
3G tegen `https://motregen.nl`. Een andere origin kan met
`MOTREGEN_E2E_ORIGIN=https://voorbeeld.nl pnpm e2e:live` worden opgegeven. De
live-modus houdt functionele checks en foutregistratie, maar past geen TTFR-,
request- of bytebudgetten toe. Na iedere run schrijft hij
`web/tmp/perf-live.json` en `web/tmp/perf-live.md`.

`scripts/smoke.sh ORIGIN_URL` controleert synchroon index 200,
manifestversheid `<15 min`, de MIP-3 CORS/cache/ETag/Range-headers en een echte
`Range: bytes=0-7` → 206. Het script is alleen een handmatig/timerklaar target;
deze track activeert geen systemd-timer.

U63 kaartopzet parallel aan de regenheader (actuele main-controle versus kandidaat, po-android ×3):
**ttfr 1409→1371 ms, ttfp 1781→1745 ms**. De basiskaart begint eerder met laden; de regenlaag
wacht op header én de eerste `style.load`. Het tijdverschil is klein ten opzichte van de eerder
geobserveerde spreiding en bewijst geen koude PO-telefoonwinst. Na ttfp: LoAF-totaal 2027→1483 ms,
langste frame 185→175 ms, geen frame >250 ms. Decodes blijven 226, bodybytes 4825675→4825746.
Typecheck, 483 tests, build, ×3 perf-compare en 15 gerichte desktoptests slagen. De offline
fixturekaart blijft veel eenvoudiger dan de echte kaart; de volledige basiskaart vraagt nog
aparte verificatie.

U63 gedeelde vroege regenpipeline (na bovenstaande kaartopzet): **ttfr 1371→1220 ms,
ttfp 1745→1562 ms** (po-android ×3). De aparte startup-entry vraagt het manifest, warmt hetzelfde
workerpaar en laadt het eerste regenpaar; App gebruikt dezelfde client en caches. Het eerste
regenbereik start in run 1 op 228 ms tegenover 622 ms. Decodes 226→224 (mediaan), bodybytes
4825746→4818713. LoAF na ttfp: totaal 1483→1859 ms doordat het spelen eerder begint tijdens laden,
langste 175→187 ms, geen >250 ms. Eén run laat nauwelijks tijdwinst zien; de koude PO-telefoon
blijft de verificatie voor de representativiteit. Typecheck, 483 tests, build, ×3 perf-compare en
19 gerichte desktoptests slagen.

U63 aanvullende controle met de volledige eigen basiskaart (po-android/koud-spelend ×3,
`--basemap own`, dezelfde regenpipeline): **ttfr 3596 ms, ttfp 1652 ms**; eerste
regencommit 1316 ms. De in die meting gebruikte `ttfr` wacht op zowel die regencommit als een render waarbij
`isStyleLoaded()` en `areTilesLoaded()` waar zijn. Hij meet dus ook het afronden van de
basiskaart; `firstRainMs` alleen bewijst nog niet dat regen door de splash heen zichtbaar is.
De eenvoudige 73-byte-fixture dekt die kaartkosten niet. De volledige kaart had na ttfp
maximale LoAF's van 360/375/289 ms; de bewaker is daar nog niet gehaald. Vroege gedeelde
stijl/font-assets leverden op dezelfde kaart ttfr 3737 ms en ttfp 1861 ms op en zijn verworpen.
Dit verandert geen mijlpaaldefinitie of baseline en bewijst geen winst op de koude PO-telefoon.

Aanvulling op de meetgrens: native Resource Timing begint bij het aanroepen van `fetch`,
Playwright meet de latere netwerk-start. Een fetch op 29993 ms kan dus pas na 30000 ms
het netwerk op gaan. Beide bytebronnen selecteren nu dezelfde request op Playwright-netwerkstart,
met native records chronologisch per URL gekoppeld vóór de grensselectie. Ongekoppelde native
records binnen het venster blijven een bronbevinding; onbekende of onvolledige bodies blijven rood.
De 2%-broncontrole, exact gelijke requestcounts, 5%-spreiding en 10%-regressiegrens veranderen niet.
Het PO-nulpunt wordt hiervoor opnieuw op de oorspronkelijke productcode vastgelegd; de acht overige
baselines krijgen daarna een expliciete contractmigratie met vergelijking tegen hun oude kosten.
De raw-opname bewaart hiervoor ook alle `observedRequests` (vóór vensterselectie) en
`selectedResourceTiming`. Daarmee kan een reviewer de koppeling en beide bytebronnen opnieuw
berekenen, ook wanneer native fetch-start en netwerk-start aan verschillende kanten van de grens liggen.
De rig gebruikt `--load-wait` ook tussen herhalingen en weigert een opname wanneer die wachttijd
verloopt. Alleen startloadavg **≤8** telt als rustig voor absolute baselines; een drukke opname mag geen baseline schrijven.
Na integratie van U62/U65/U66 wordt het definitieve PO-fixture-nulpunt op main `ec3ca02`
zonder U63-productcode gemeten. U62 zet Kaderhemel altijd aan en vraagt straling voor het
scrubbervenster; U65 voegt de lazy plaatsenlijst ná ttfp toe. Deze gewijzigde startsituatie is de expliciete reden voor een nieuw nulpunt.
De hierboven genoemde eigen-kaartreeks blijft gelabeld als vóór U62. Een apart main/U63-paar
op de eigen kaart voorkomt dat main-wijzigingen als U63-winst worden gerapporteerd.
De lock per opname start ook een nieuw Chromium-proces per herhaling. De historische reeks
gebruikte één browserproces met drie koude contexten; procesgebonden caches kunnen daardoor
verschillen. Het nieuwe main/U63-paar gebruikt aan beide kanten dezelfde nieuwe runner.

## Desktopstart-waterval (U64)

De koude regressierig blijft `perf:mobile --profile desktop`: die gebruikt
het bestaande Pixel-profiel met 4 cores/4 GB. Aanvullende desktopcaptures
gebruiken Desktop Chrome, DPR 1, 1280×800 en 8 cores/8 GB, met V8-traces
voor parse/compile. SwiftShader en synthetische data maken dit geen
MacBook-benchmark. De waterval en oorspronkelijke PO-profielen zijn
uitgewerkt in [U64 stap 0](../.dev/tracks/u64-desktop-waterval-lus/STAP-0.md);
[kandidaatresultaten](../.dev/tracks/u64-desktop-waterval-lus/RESULTATEN.md)
rapporteren ttfr, ttfp en LoAF ná ttfp naast bytes en CPU-tijd.

```sh
cd web
bash scripts/desktop-rig.sh ../tmp/desktop-koud --repeat=3
bash scripts/desktop-rig.sh ../tmp/desktop-warm --repeat=3 --warm
pnpm exec tsx scripts/start-waterfall.ts ../tmp/desktop-koud-cold-run*.json
```

De wrapper bouwt en wacht op load ≤8 vóór de lock; één browserrun neemt
`flock -w 7200 /home/mathijs/motregen-perf.lock`. Elke herhaling krijgt een
eigen browserproces en lockperiode. Bij drukte na lockverkrijging komt de
lock meteen vrij; ook slotwachttijd blijft erbuiten. `perf:mobile` en
`prof:capture` gebruiken dezelfde lock. Een handmatige buitenlock wordt
herkend voor één run, zodat geneste wrappers niet vastlopen. Zet geen hele
lus onder een buitenlock. Gewone e2e/builds nemen
geen perf-lock. Bevroren builds kunnen met `MOTREGEN_RIG_PREBUILT=1` en
`MOTREGEN_RIG_DIST=/pad/naar/build` worden hergebruikt; de gecombineerde
lus staat in `scripts/desktop-loop.sh`. Nieuwe captures starten op `/weer`.

Koud wist de HTTP-cache en blokkeert de SW. Warm vult HTTP- en SW-
schijfcaches, sluit de seedbrowser en opent een nieuwe browser/context met
hetzelfde tijdelijke profiel, zonder appgeheugen. De capture registreert
cache-inventaris, SW-controller en HTML/SW-hash. Bij drukte blijven alleen
de schijfcaches bewaard; de browser sluit en de loadwacht gebeurt buiten
de lock. Het profiel vervalt na die ene run. Weer blijft NetworkOnly in de
SW; de HTTP-cache kan de immutable Ranges leveren. Capturelogs
onderscheiden interne SW-netwerkrequests. Een SW-response of nul Resource-
Timing-bytes bewijst op zichzelf geen gecachte weerdata.

Op de host met 32 kernen zijn expliciete gepaarde kandidaten toegestaan bij
startload ≤16 (`--paired --pair=naam --role=A|B`), in de volgorde A B A B A B.
Rapporteer koud en warm samen, met ttfr/ttfp en verschillen binnen paren.
Paar-ID, rol, toegepaste loadgrens en load tijdens de opname staan in metadata;
deze runs leveren geen absolute baseline. Absolute baselines blijven ≤8.
Lighthouse gebruikt dezelfde lock/grens en bewaart de load in een sidecar.
`scripts/start-upstream.ts CAPTURE.json` telt serverlogevents tot 12 s na
navigatie: responsbodybytes, zonder headers/TCP-overhead. Resource Timing-
bodybytes uit SW/cache bewijzen geen netwerktransfer.

Productbuilds bevatten standaard beide native stijlen inline, een glyph-
preload en vroege manifestfetch; `VITE_START_ASSETS=none` maakt een
referentiebuild. Bij een expliciete `VITE_BASEMAP_STYLE_URL` blijven die
stijl en fonts behouden. Manifestrefresh hergebruikt de startupfetch niet;
still en Skywatch starten geen normale sessiebootstrap. U63 vervangt de kaartplaceholder-proef door de hieronder beschreven progressieve z4-startkaart; de oude inline-uitvoering blijft uitsluitend op de proefbranches.

De absolute U64-gate op main `4038d55` gebruikt
`web/perf/baselines/desktop-koud-spelend-own-u62-part2.json`. De nieuwe
baseline heeft als reden Kaderhemel/U65, een verse browser per herhaling
en de standaard kaartkleuring onder Expressief in U62 deel 2. De oudere
baseline en de bestaande regressiegrens van 10% blijven ongewijzigd.
Drie referentieruns bij startload7,93/7,90/7,24 hadden elk1.760.209
bodybytes en298/297/297 decodes:0%bytespreiding en0,336%decodespreiding.
De kandidaatcompare bij load7,50 is groen:1.757.816 bodybytes (−0,136%),
297 decodes (0%) en geen netwerkbevindingen. Dit zijn de byte-/decode-
budgetten van de regressierig; native Desktop Chrome-tijden en de
gepaarde koud/warm-resultaten staan afzonderlijk in het U64-verslag.

```sh
MOTREGEN_E2E_PORT=4394 MOTREGEN_E2E_DATA_PORT=8394 pnpm perf:mobile \
  --profile desktop --scenario koud-spelend --basemap own --compare \
  --baseline-file perf/baselines/desktop-koud-spelend-own-u62-part2.json
```

Een aanvraagvolgorde kan ook op een drukke host worden gecontroleerd met
`pnpm perf:mobile --profile desktop --scenario koud-spelend --basemap own --request-order`.
Gebruik `--profile po-android` voor het gekalibreerde Android-profiel. Deze modus houdt native
Resource Timing, de netwerkregistratie, renderer-quota en het profiel intact, maar zet of vergelijkt
geen performancebaseline (`--baseline`/`--compare` worden geweigerd). De rapporten dragen dat kenmerk;
een capture onder load bewijst alleen volgorde. `pnpm exec tsx scripts/place-waterfall.ts
tmp/perf-mobile/desktop-koud-spelend-run1.raw.json` controleert de catalogusstart ten opzichte van
`milestone:ttfp`, manifest, stijl en eerste regen-Range, en schrijft een compacte JSON en SVG-waterval.

### U63 koud en warm op dezelfde eigen kaart

Sinds PO-bijsturing 2026-10-08 tellen koud en warm samen: ttfr voorop, ttfp daarna,
met LoAF ná ttfp als bewaker. `warm-spelend` is het tweede appbezoek met gevulde
HTTP-diskcache en SW-cache, in een nieuw Chromium-proces en nieuwe pagina. De
cachevulling installeert eerst de gewone productie-SW op een lege bootstrap-pagina;
het eerste appbezoek staat daardoor onder SW-controle en vult de bestaande cachepaden.
Daarna sluit de hele browser. Geen pagina-, decode-worker-, MapLibre- of WebGL-staat
wordt hergebruikt. Cache Storage-inventarissen staan in de raw/meta; een ontbrekende
manifestcache is een bevinding, geen reden om hem kunstmatig vooraf te vullen.
De seed speelt vanaf zijn ttfp minstens 35 s voor een opname van 30 s; zo blijven
tail-ranges gevuld als het warme bezoek eerder speelt. HTTP-cachehits worden via
CDP `requestServedFromCache`/`fromDiskCache` én een voltooide response aangetoond.
SW-fetch en paginaantwoord worden apart gekoppeld aan native Resource Timing;
de SW krijgt dezelfde netwerkrem als de pagina. Negatieve bodygroottes zijn ongeldig.
De cachevulling gebruikt één e2e-slot buiten de perf-lock en levert geen perfgetal.
Vervolgens wacht de runner buiten de lock op loadavg <8 en neemt één bezoek op.

De eigen kaart gebruikt nu de productie-URL's `/basemap/licht.json` en
`/data/basemap/nl-*.pmtiles`. De oude rig herschreef die naar de datapoort en
`/basemap/nl-*.pmtiles`; dat omzeilt respectievelijk de SW-precache en rangecacheroute.
Manifestheaders volgen productie: het eerste `?s=1`-verzoek krijgt `no-store` voor
de sessietelling (MIP-13), de gedeelde URL `max-age=15, stale-while-revalidate=60`.
Deze contractcorrecties vragen opnieuw gemeten main/U63-baselines, koud én warm.

Meetrecept: `pnpm perf:mobile --profile po-android --scenario koud-spelend,warm-spelend
--basemap own --repeat 3 --baseline`. De overeenkomstige Buienradar-referentie is
`--scenario referentie-buienradar,referentie-buienradar-warm --repeat 3`; toestemming
en diskcache komen uit het eerste bezoek, alle browserprocessen worden daarna gesloten.
**Nieuwe koude/warme referenties op U62 deel 2 zijn voltooid**; zie het absolute v2-anker hieronder. De basis is vóór U64; ze claimen geen absolute starttijd voor de latere integratie. De warme lat blijft duidelijk lager dan koud én Buienradar warm op dezelfde rig; de gekalibreerde Buienradar-warmnavigatie faalt nog met ERR_HTTP2_PROTOCOL_ERROR, dus daarvan is geen timinggetal beschikbaar.

De oude tabel van 2026-08-31 (4G 13,00/2,95 s, desktop 1,20/1,43 s) komt uit
commit `b2d830b`. Daar volgt warm direct op koud plus HUD-controle, vóór scrubben
en plaatswissel, in hetzelfde browserproces. De toenmalige ttfr is uitsluitend
`markRainFrameCommitted()`, zonder de huidige kaartvoorwaarde; ttfp ontbreekt.
De tabel bevat één run per profiel op een oudere ingest-/kaart-/decoderstand,
geen po-android ×3 met hostloadgate. Het desktopverschil van 222 ms bewijst geen
actuele SW-revalidatie- of shaderkosten. Die oorzaak moet uit het nieuwe identieke
kaart-/data-/profielpaar en de netwerk-/hoofddraadwaterval volgen.

### U63 progressieve z4-kaart (PO-besluit 2026-10-08)

De eigen kaart krijgt eerst twee grove z4-tegels uit hetzelfde PMTiles-archief. Ze staan als losse gehashte assets buiten de HTML, starten naast stijl/manifest en worden in een worker met DecompressionStream gedecomprimeerd. MapLibre verwerkt de vectorbuckets in zijn worker. HTTP en SW cachen beide assets; `pnpm --dir web exec tsx ../tools/basemap/start-tiles.mts` regenereert ze byte-identiek bij dezelfde kaartbron.

Dezelfde landcover-/water-/grenslagen geven licht en donker dezelfde kleuren, filters en opacity als de volledige kaart. Tijdgestuurde kaartkleuren worden ook op z4 toegepast. Zodra MapLibre de eerste echte tile-data meldt, verdwijnen de z4-lagen vóór de volgende render. Deze nul-ms wissel blijft binnen de PO-grens van300ms en vermijdt twee transparante landcoverlagen over elkaar.

De eerdere inline-proef blijft als afzonderlijke historische reeks: po-android/eigen U60 op basis98ae6a6 vóór U62/U65, gepaard load≤16, koud én warm×3. Eerste kaartbeeld koud3767→2074ms en warm3746→2059ms; ttfr3816→4041 en3825→4351ms, ttfp1819→2141 en1942→2216ms. PO accepteert die productafweging; de losse uitvoering op actuele U62/U65-basis wordt opnieuw gepaard gemeten. Geen absolute≤8-baseline uit deze cijfers afleiden. Compact per-run bron: `.dev/tracks/u63-mobiel-ttfp-lus/metingen/placeholder-gepaard.json`.

De losse uitvoering is op 2026-10-08 gepaard A/B om en om gemeten, po-android/quota40/GRID6, eigen U60, basis7a6b420 inclusief U62/U65, startload≤16 per run. Warm herstart de gehele browser met gevulde HTTP- en SW-diskcache. Medianen van drie opnames per variant/scenario:

| Scenario / profiel / kaart | Variant | ttfr ms | ttfp ms | Eerste kaart ms | Netwerkbody bytes | Regen-decodes | LoAF na ttfp: max ms / aantal >250 ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| po-android koud, eigen U60 | Zonder z4 | 3963,5 | 1905,1 | 3963,3 | 5033334 | 220 | 364,9 / 2 |
| po-android koud, eigen U60 | Losse z4 | 4288,8 | 2342,7 | 2308,1 | 5057646 | 220 | 288,9 / 3 |
| po-android warm, eigen U60 | Zonder z4 | 4788,6 | 2098,1 | 4294,0 | 36513 | 220 | 340,2 / 3 |
| po-android warm, eigen U60 | Losse z4 | 4534,2 | 2619,1 | 2556,2 | 36513 | 220 | 299,6 / 2 |

Eerste kaartbeeld wint koud1655ms en warm1738ms; ttfp kost438/521ms. Het volledige-kaartvereiste van ttfr blijft gelijk: koud325ms later, warm254ms eerder. Deze uitvoering haalt de eerdere100ms-lat voor ttfp niet; PO accepteert de resterende straf. Warme ttfp/ttfr blijven boven koud, dus de warmelat is niet gehaald. LoAF na ttfp is geen opgelost probleem: er blijven frames van ongeveer300ms. De plaatsenlijst begint in alle twaalf opnames pas na ttfp; er zijn geen wirebevindingen. Beide z4-gzipdecodes gebeuren buiten de hoofddraad. Warm heeft nul kaartnetwerkbytes; de36513 bytes zijn het sessiemanifest. Dit zijn gepaarde cijfers en vervangen de absolute≤8-baselines niet.

Compacte bron met load, cache, scenario, bundelURL en tijden per opname: `.dev/tracks/u63-mobiel-ttfp-lus/metingen/z4-los-gepaard.json`. Vier390px-toestandsbeelden licht/donker staan daarnaast als `z4-{light,dark}-{placeholder,echt}-390.png`; die netwerkgestuurde beeldcontrole is geen timingmeting.

### U63 absolute referentie na U62 deel 2, vóór U64

Op 2026-10-08 is main4038d55 (alleen actuele rigoverlay) tegenover U63cd0d63e gemeten op po-android/quota40/GRID6/eigen U60; iedere cache/variant driemaal met werkelijke startload≤8. Dit zijn afzonderlijke absolute reeksen, geen afwisselend A/B-paar. Reden voor de nieuwe baseline: U62 Kaderhemel/tinting, U65 lazy plaatsenlijst en het gecorrigeerde warme contract met HTTP+SW-diskcache en volledig nieuw browserproces. Beide varianten gebruiken dezelfde rig; een CPU-profiel of drukke opname is uitgesloten.

| Cache / variant / basis | ttfr ms | ttfp ms | Eerste kaart ms | Body bytes | Regen-decodes | LoAF ná ttfp max ms / >250ms | Startloads |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Koud / main4038d55 | 3823,0 | 2012,9 | niet apart gemarkeerd | 5047534 | 220 | 216,3 / 0 | 7,35 / 7,91 / 7,76 |
| Warm / main4038d55 | 3417,2 | 2428,8 | niet apart gemarkeerd | 36513 | 220 | 190,9 / 0 | 7,85 / 7,60 / 6,01 |
| Koud / z4 cd0d63e | 4569,6 | 2130,1 | 2105,4 | 5073254 | 220 | 365,4 / 2 | 6,31 / 7,54 / 6,87 |
| Warm / z4 cd0d63e | 4585,1 | 2455,1 | 2386,1 | 36513 | 220 | 319,2 / 2 | 5,50 / 7,18 / 7,31 |

In deze rustige mainreeks wint warm406ms ttfr, maar verliest416ms ttfp. Met z4 blijft warme ttfr vrijwel gelijk aan koud. De eerdere conclusie over de dominante CPU-/quotakosten blijft daarmee relevant, maar 'cache koopt niets' is geen universele exacte nul: de winst hangt af van de productbasis en fase. Warm heeft alleen36513 sessiemanifestbytes; nul kaartnetwerkbytes. Baselines: `web/perf/baselines/po-android-{koud,warm}-spelend-own-u62-part2.json`. Alle z4-budgetvergelijkingen tegen die referentie blijven onder10% (koud ongeveer+0,51% bytes, warm0%; decodes0%). De afzonderlijke oude U59-kaartfase-totaallat≤1000ms is op deze U60/quota-basis niet gehaald; een groene byte/decodevergelijking is geen groene kaarttijdlat.

Compacte bron en eerste6s-watervallen per opname: `.dev/tracks/u63-mobiel-ttfp-lus/metingen/absolute-v2-koud-warm.json`. Nieuwe gepaarde U64/z4-opnames rapporteren hun eigen actuele basis afzonderlijk.

### U63 z4 na U64 — actuele gepaarde PO-gate

Product82fa4bd inclusief U64/U62deel2/U65/U67: z4 uit versus losse z4, dezelfde bevroren bron en eigen U60-kaart, po-android/quota40/GRID6. A1/B1/A2/B2/A3/B3 per koud/warm-scenario, werkelijke startload≤16 per opname. Warm gevuld HTTP+SW-diskprofiel, volledig nieuw browserproces zonder app-/worker-/WebGL-geheugen. Medianen×3, geen absolute baseline:

| Cache / variant | ttfr ms | ttfp ms | Eerste kaart ms | Body bytes | Regen-decodes | LoAF ná ttfp max ms / >250ms | Startloads |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Koud / zonder z4 | 3806.2 | 1922.9 | 3806 | 5025856 | 223 | 261.2 / 1 | 7.06 / 9.69 / 15.94 |
| Koud / losse z4 | 4336.6 | 2262.4 | 2197.8 | 5043927 | 220 | 269.8 / 1 | 10.5 / 11.86 / 13.77 |
| Warm / zonder z4 | 4261.9 | 2299.2 | 4261.8 | 36513 | 226 | 304.7 / 3 | 13.01 / 15.71 / 15.33 |
| Warm / losse z4 | 4558.8 | 2416.2 | 2353.8 | 36513 | 226 | 284.6 / 2 | 11.93 / 12.2 / 15.2 |

Eerste kaartbeeld koud1608ms en warm1908ms eerder; ttfp koud339ms en warm117ms later. ttfr behoudt de volledige-kaartvoorwaarde en is koud530ms en warm297ms later. De100ms-ttfp-lat is niet gehaald; de PO accepteert de reststraf. Warm is nog niet duidelijk onder koud. De LoAF-bewaker blijft open: medianen269,8/284,6ms na ttfp en1/2frames>250ms. Eerste-kaartwinst is in elk afzonderlijk paar aanwezig; ttfp varieert per paar (koud−192 tot+809ms, warm−499 tot+238ms), dus geen kleine kostenwinst ten opzichte van eerdere basissen claimen. Warm alleen36513 sessiemanifestbytes, nul kaartnetwerkbytes. Alle wirebevindingen0 en plaatsenlijst na ttfp.

Klaar voor merge volgens de expliciete z4-PO-gate: typecheck,524unittests,productiebuild en15gerichte desktoptests waaronder basemap9 groen na de integratie. Vier390px-toestandsbeelden op dezelfde basis: `.dev/tracks/u63-mobiel-ttfp-lus/metingen/z4-u64-{light,dark}-{placeholder,echt}-390.png`; PMTiles opzettelijk tegengehouden, dus geen tijden aan de screenshots ontlenen. Compacte per-runbron, watervallen en afzonderlijke paarverschillen: `metingen/z4-u64-gepaard.json` in dezelfde trackmap. Kaart-eerst en temperatuur blijven proefbranches.

## Eén klok en kaartvoorrang (U68, 2026-10-09)

De gedeelde gereedheid is `mapReady`: vóór de eerste regentekenbeurt blijven cursor en
histogram-glide stil. Een vroege pauzekeuze blijft geldig; de eerste afspeeltik haalt
kaartopzet-tijd niet in als een cursorsprong. De PMTiles-header wordt vroeg via dezelfde
`Protocol`/`PMTiles`-instance geladen. De ongebruikte weerheaders van de eigen kaart wachten
op de eerste basemap-tegel; benodigde regen- en tabeldata blijven op aanvraag beschikbaar.
Stijlen zonder deze PMTiles-bron behouden hun gewone headerstart. De z4-wissel is ongewijzigd.

De splash vloeit in 300 ms weg, onafhankelijk van de klok. De onderstaande filmstrip heeft
opname-overhead en gebruikt productiegegevens op de PO-preview; dit zijn diagnostische
tijden, geen performancebaseline. De onthullingsmarker is de waargenomen voltooiing van
alle splash-animaties; drukte op de hoofddraad kan die melding vertragen. Elke cel vermeldt
het 250ms-doelmoment en de daadwerkelijke compositorframetijd. Herhaalde beelden zijn geen
nieuwe tekenbeurten. De cursorindex komt uit onafhankelijke DOM-sampling met de echte sampletijd.

| opname | style.load | mapReady / regen-draw | eerste cursorbeweging / TTFR | volledige onthulling |
| --- | ---: | ---: | ---: | ---: |
| desktop A | 401 ms | 1406 ms | 1457 ms | 3271 ms |
| desktop B | 373 ms | 856 ms | 1505 ms | 1695 ms |
| po-android A | 555 ms | 1700 ms | 2255 ms | 4116 ms |
| po-android B | 789 ms | 1784 ms | 2214 ms | 2614 ms |

De oude onthulling blijft 1,8–2,4 s na mapReady aanwezig, terwijl de scrubber al zichtbaar is.
Bij B begint de klok vóór de volledige onthulling. De onafhankelijke regressietest verlengt
de onthulling tot vijf seconden en bevestigt dezelfde volgorde in Chromium en Firefox.

[Desktopfilmstrip](perf/u68/filmstrip-desktop.jpg), [Androidfilmstrip](perf/u68/filmstrip-po-android.jpg)
en [milestones en cursor-/regenposities](../web/perf/baselines/u68-filmstrip.json).
De meetcode staat in `web/scripts/play-sync.ts`; `--filmstrip` schakelt de compositoropname aan.
De PNG/JPEG-readback en HUD-verberging van die modus zijn uitgesloten van de timingruns.

```sh
MOTREGEN_PERF_PAIRED_RUN=1 bash scripts/perf-lock.sh scripts/e2e-slot.sh pnpm exec tsx scripts/play-sync.ts http://127.0.0.1:4350 tmp/u68/film --profile=po-android --filmstrip
pnpm exec tsx scripts/play-sync-report.ts tmp/u68/captures tmp/u68/rapport
```

Gate op de productwijziging: typecheck, 529 units en productiebuild groen; 52 gerichte
desktop/mobile-4g-tests groen met vier toepasselijke skips; zes Firefox-tests groen, waarvan
één bestaande viewport-test op herhaling. Perf-gate: vier tests groen, desktop TTFR koud
425/warm408 ms, mobile-4g koud1945/warm1330 ms tegen de bestaande warme grens1545 ms.
Beide warme journeys hebben nul chunktransfer. Eerdere mobiele misses (1934,1624,1574 ms)
en de rustige referentiecontrole (warm1341 ms) staan in het lokale tracklog; geen budget aangepast.

### Gepaard koud/warm op productiegegevens

A is d0420ea met uitsluitend dezelfde meetinstrumentatie als B; B is product 29f9bee.
A1/B1/A2/B2/A3/B3 per scenario, 48 opnames zonder screencast, werkelijk startload ≤ 16
(maximum 15,64), één hostlock per run en wachten buiten de lock. Manifest en Date.now staan
voor alle runs op 2026-10-09T09:33:28Z; performance.now loopt echt door. Zo varieert de
leeftijdsbanner niet tijdens de reeks. Warm herstart het gehele browserproces met gevuld
HTTP-/SW-diskprofiel; alle warme runs hebben een SW-controller. De po-android-rig gebruikt
30 Mbps/20 ms, vier cores/4 GB en rendererquota 40% van één core met een 5 ms-periode.

HTTP/1.1 is de eigen Vite-preview 4392, met echte productiegegevens en hetzelfde eigen
PMTiles-archief. HTTP/2 is een lokale TLS-reviewproxy op https://motregen.nl: de A/B-frontend
is lokaal, de weerdata komt van productie. Er is niets gedeployd. CDP bevestigt h2 voor de
netwerkresponses; sommige warme PMTiles-antwoorden uit de SW dragen http/1.1-cachemetadata.
Een afzonderlijke directe productiecontrole zonder proxy bevestigt h2/h3, maar gebruikt
een andere gedeployde bundel met de oude TTFR-definitie en telt niet als A/B-tijdvergelijking.

Hieronder staan medianen van drie opnames per variant. De laatste kolom is de mediaan van
de drie afzonderlijke B−A-paarverschillen, niet het verschil tussen beide medianen.
Die twee berekeningen kunnen bij deze kleine, drukke steekproef uiteenlopen. TTFR meet
in beide varianten de cursorstart; een gewijzigde definitie is geen snelheidswinst.
TTFP blijft de eerste getekende wissel van het linker regenframe. De begrensde eerste tik
voorkomt een opstartsprong, waardoor die framegrens later kan worden bereikt.

| transport / profiel / cache | A→B klokstart ms | A→B framewissel ms | A→B style.load ms | A→B eerste tegel ms | A→B volledige kaart ms | mediane Δ klok / framewissel |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| h1 / desktop / cold (3/3) | 886→901.9 | 1114.3→1025.8 | 145.4→142.3 | 1001.2→1034.6 | 1113.5→1676.8 | -19.9 / -133.3 ms |
| h1 / desktop / warm (3/3) | 803.1→856.2 | 913.1→937.5 | 133.5→125.8 | 1067.3→1094.3 | 1554.1→1815.3 | 53.1 / 24.4 ms |
| h1 / po-android / cold (3/3) | 1902.6→1983.2 | 4387→3848.1 | 590.3→558.8 | 4126.5→2931.7 | 4467.9→3031.4 | -187.2 / -463.8 ms |
| h1 / po-android / warm (3/3) | 2363.6→2061.9 | 4749.5→5291.7 | 642.5→721.9 | 4514.4→4447.1 | 4702.7→4576.4 | -172.4 / -221.6 ms |
| h2 / desktop / cold (3/3) | 936.9→979.7 | 1532.6→1591 | 220→212.5 | 808.3→767.4 | 880.3→870.2 | 46.2 / 33.8 ms |
| h2 / desktop / warm (3/3) | 921→902.4 | 1505.4→1553.4 | 404.3→417.8 | 1031.3→977.6 | 1495.7→1462 | -10.4 / 48 ms |
| h2 / po-android / cold (3/3) | 2468.1→2342.7 | 4756.2→4971.9 | 1093→1051.8 | 4792.8→4797 | 5153.2→4971.6 | -95.8 / 501.4 ms |
| h2 / po-android / warm (3/3) | 2527.9→2013.4 | 4959.7→5012.5 | 618.6→593.4 | 4273.7→4103.6 | 4325.3→4238.5 | -181.2 / -29.1 ms |

De PMTiles-header start in alle 24 B-runs vóór de ongebruikte HARMONIE-headers; bij A gaan
er steeds 34 voor. De koude HTTP/1.1-headerqueue daalt op desktop mediaan 58,5→0,6 ms en
op po-android 45,6→0,3 ms. Op koude po-android/HTTP1 komt de eerste echte tegel 1195 ms en
de volledige kaart 1437 ms eerder. Warme mobiele klokstart wint in de medianen 302 ms
(HTTP1) en 515 ms (HTTP2). Koude mobiele HTTP2-klokstart wint 125 ms, maar TTFP kost 216 ms;
het mediane afzonderlijke paarverschil voor TTFP is +501 ms. Dit is geen algemene speedup.
De volledige desktopkaart/HTTP1 is koud 563 ms en warm 261 ms later klaar. Het eerste
progressieve z4-kaartbeeld blijft daar vrijwel gelijk. De z4-wissel zelf is niet veranderd.

| transport / profiel / cache | A→B eerste kaartbeeld ms | A→B max LoAF na TTFP ms | A→B aantal >250 ms |
| --- | ---: | ---: | ---: |
| h1 / desktop / cold | 764.6→760.2 | 425.2→656 | 2→1 |
| h1 / desktop / warm | 741.6→725.7 | 512.5→742.9 | 1→2 |
| h1 / po-android / cold | 1687.4→1554.4 | 210.2→198.9 | 0→0 |
| h1 / po-android / warm | 1794.1→1771.9 | 314.1→230.7 | 1→0 |
| h2 / desktop / cold | 880.2→870.1 | 377.1→301.7 | 1→1 |
| h2 / desktop / warm | 832.9→819.8 | 303.4→247.8 | 1→0 |
| h2 / po-android / cold | 2554.7→2423.8 | 231.1→156.6 | 0→0 |
| h2 / po-android / warm | 2108.5→2232.7 | 170.7→189.8 | 0→0 |

LoAF is geen opgelost probleem: HTTP1-desktop heeft na TTFP mediane maximale frames
van 656/743 ms, tegen 425/513 ms in A. HTTP2-desktop verbetert in deze reeks; de mobiele
maxima blijven meestal onder 250 ms. Deze load ≤ 16-cijfers zijn geen rustige absolute
baseline en bewijzen niet dat de bredere MIP-19/Buienradar- of MIP-23-warmelat is gehaald.
De bestaande load ≤ 8-perf-gate hierboven is afzonderlijk groen zonder budgetwijziging.

[Compacte bron met alle 48 runs, loads, cache/protocol, milestones en paarverschillen](../web/perf/baselines/u68-startup-paired.json).
Watervallen tonen de eerste 6 s van koud paar 1: groen PMTiles, blauw MRF, grijs overige
resources. ResourceTiming-transferSize is een observatie en geen wire-budgetclaim.

| transport / profiel | referentie | kandidaat |
| --- | --- | --- |
| HTTP1 desktop | [A](perf/u68/waterval-h1-desktop-cold-reference-1.svg) | [B](perf/u68/waterval-h1-desktop-cold-candidate-1.svg) |
| HTTP1 po-android | [A](perf/u68/waterval-h1-po-android-cold-reference-1.svg) | [B](perf/u68/waterval-h1-po-android-cold-candidate-1.svg) |
| HTTP2 desktop | [A](perf/u68/waterval-h2-desktop-cold-reference-1.svg) | [B](perf/u68/waterval-h2-desktop-cold-candidate-1.svg) |
| HTTP2 po-android | [A](perf/u68/waterval-h2-po-android-cold-reference-1.svg) | [B](perf/u68/waterval-h2-po-android-cold-candidate-1.svg) |

De vroege gedeelde header plus uitstel van ongebruikte headers geven aantoonbare
kaartvoorrang zonder afhankelijkheid van fetch-priority-hints. Regen eerder mounten
buiten style.load is daarom voor deze synchronisatie niet nodig. De afzonderlijke
prewarm/uitstel-probes op de synthetische fixture waren verkennend; bovenstaande finale
reeks meet de gekozen combinatie op echte data.

## Regen vanaf de eerste kloktik (U69, 2026-10-09)

De afspeeltik bereidt het regenpaar inclusief bewegingsveld voor, uploadt de texturen en
tekent de mengstand voordat hij de cursor verplaatst. De overlay tekent binnen dezelfde
tik; de MapLibre-terugval bevestigt zijn render voordat de cursor verdergaat. Het volgende
paar wordt al na de upload van het stilstaande startbeeld voorbereid, vóór de puntreeksen.
Dat startbeeld heeft op een exacte frametijd geen bewegingsveld nodig. De eerste afspeeltik
wacht daar wel op. De zelfstandige compositor-glide van het histogram is uit: bij een
geblokkeerde hoofddraad blijven histogram en kaart samen staan. Het tempo blijft hetzelfde.

Het CPU-profiel van de referentie wijst de gemelde lange taak aan als windopzet:
`attachWindLayer → mountWind → WindLayer.onAdd → link/compile`. In de aparte diagnostische
opname kostte mountWind inclusief callees 746 ms, waarvan 588 ms in shadercompilatie zelf;
de overeenkomstige lange frame duurde 753 ms. De windopzet begint nu na het eerste bewegende
regenbeeld. Dit verplaatst werk; het is geen claim dat shadercompilatie of alle lange frames
verdwenen zijn. De volgorde z4 → regen → echte kaart en de splashregels van main blijven gelden.

`play-sync.ts` legt elke getekende regenstand vast met bronindices, mengfactor, cursor,
textuuruploads, `areTilesLoaded` en z4-status. Meerdere callbacks bij één render lezen de
laatste werkelijk geüploade stand en tellen die eenmaal. `TTFP` behoudt zijn bestaande
betekenis: wissel van het linker bronframe. De aanvullende `firstRainMotionMs` is de eerste
getekende verandering van de effectieve regentijd, inclusief tussenliggende mengstanden.
Zo wordt de afstand tussen klokstart en regenbeweging afzonderlijk meetbaar.

De definitieve vergelijking gebruikt productiegegevens, een vast manifest en Date.now van
2026-10-09T10:50:48Z, HTTP/1.1 op de eigen Vite-previews en de eigen basiskaart. A is d7066b15
met dezelfde meetinstrumentatie; B bevat U69 en main tot f613928. Per profiel: A1/B1/A2/B2/A3/B3,
koude browsercontext, startload ≤ 16, één hostlock per run. Desktop en po-android gebruiken
de bestaande profielen; opname- en CPU-profiler-overhead zijn uitgesloten van de timingparen.
De filmstrips tonen iedere 250 ms een compositorbeeld plus cursor-/regenstand, met zowel het
doelmoment als de echte beeld- en DOM-sampletijd. Het hostlog bewaart ook mislukte en voorlopige runs.

```sh
MOTREGEN_PERF_PAIRED_RUN=1 bash scripts/perf-lock.sh scripts/e2e-slot.sh pnpm exec tsx scripts/play-sync.ts http://127.0.0.1:4351 tmp/u69/captures/h1-desktop-cold-candidate-1 --profile=desktop --now=2026-10-09T10:50:48Z --manifest=tmp/u69/manifest.json
pnpm exec tsx scripts/play-sync-report.ts tmp/u69/captures tmp/u69/rapport
pnpm exec tsx scripts/play-sync-filmstrip.ts tmp/u69/films/desktop-reference tmp/u69/films/desktop-candidate ../docs/perf/u69/filmstrip-desktop.jpg
```

De twaalf timingruns hadden startload 9,36–14,81. Medianen van drie koude paren:

| profiel | A→B klokstart | A→B eerste bewegende regen / TTFP | A→B klok→regen | A→B grootste frameachterstand | A→B langste LoAF na TTFP |
| --- | ---: | ---: | ---: | ---: | ---: |
| desktop | 1014→978 ms | 1739→978 ms | 898→0,5 ms | 0,1→0 frame | 258→854 ms |
| po-android | 1916→2242 ms | 4922→2242 ms | 3005→0,5 ms | 0,3→0 frame | 237→360 ms |

De mediane gepaarde TTFP-winst is 908 ms op desktop en 2680 ms op po-android. De mobiele klok
start 325 ms later omdat hij op de voorbereide regenstand wacht. De klok loopt in alle zes
kandidaatruns vanaf de eerste getekende mengwisseling gelijk met de regen; windopzet begint
in alle zes daarna. De LoAF-bewaker blijft een restpost: vooral desktop ziet nu de dure
windopzet **na** TTFP (781–890 ms opzet), waar die bij A vóór de eerste regenbeweging viel.
Ook na de start kan de gezamenlijke animatie dus haperen. Er is geen wire-budgetwinst geclaimd.

[Meetgegevens](../web/perf/baselines/u69-play-sync.json),
[desktopfilmstrip](perf/u69/filmstrip-desktop.jpg) met [metadata](perf/u69/filmstrip-desktop.json),
[po-androidfilmstrip](perf/u69/filmstrip-po-android.jpg) met [metadata](perf/u69/filmstrip-po-android.json).
De filmstrips zijn afzonderlijke diagnostische opnames en tellen niet mee in bovenstaande medianen.

Typecheck, 529 units en productiebuild zijn groen. De finale volledige run van de geraakte
desktop/mobile-4g-specs heeft 42 geslaagde tests en 10 profielskips (3,2 min), inclusief
basemap, focus, dev-panel, decode-budget, tegengehouden volgend frame, vroege pauze,
vertraagde eerste tik en de MapLibre-terugval. De oorspronkelijke focus-rusttest is behouden
na de fixture-fix van main.
Zes Firefox-tests zijn zonder herhaling groen. De perf-gate heeft vier groene tests:
mobile-4g TTFR koud 1906/warm 1414 ms, warme chunktransfer 0 B en scrub-p95 25 ms.
