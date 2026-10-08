# U64 — desktoplus

[Stap 0](STAP-0.md) is vóór productwijzigingen vastgelegd. De eerdere reeksen
gebruiken dezelfde U57-basis en bevroren builds, onder de gedeelde hostlock.
Desktop Chrome, 1280×800, DPR 1, 8 cores/8 GB, CPU 1×, SwiftShader,
synthetische data; drie runs per variant. Koud: verse context, HTTP-cache uit,
SW geblokkeerd. Het browserproces wordt binnen een reeks gedeeld; de eerste
run bevat extra browser/GPU-initialisatie. Geen MacBook-benchmark.

## Vervolg na U62/Kaderhemel en U65

Main `ec3ca02`, inclusief U62 `8d75754f`, U65 `0fb247ec` en U66, is
samengevoegd. Kaderhemel staat nu altijd aan en de tabel/scrubber hebben
andere hemelverwerking. U65 haalt de volledige plaatsenlijst pas ná ttfp.
De onderstaande oudere U57-tijden blijven historisch; nieuwe timingwinst
wordt tegen dezelfde U62-startsituatie gemeten.

De nieuwe, ongewijzigde main-referentie heeft 424.978 B gzip hoofd-JS;
U64 na merge, vóór shaderbatching: 411.280 B; met shaderbatching: 411.362 B.
De eerdere U62-builds (422.475 / 409.063 B) zijn niet gemeten vóór U65.
Bevroren builds gebruiken
dezelfde fixture en native-desktopcapture. Koud ×3, warm ×3 en Lighthouse
zijn nog niet volledig gemeten. Er zijn nog geen volledige nieuwe
ttfr/ttfp-vergelijkingen of Lighthouse-subscores.
Eerste gewone koude referentierun: ttfr 1617,3 ms, ttfp 775,1 ms,
eerste regen 686,8 ms bij startload 7,98. Nog geen reeks van drie en
geen vergelijkingsclaim. Een aparte cpuProfile-opname op U64 vóór shaders
heeft startload 7,89; de grootste RunTask is 236 ms met circa 225 ms in
MapLibre's `_setupPainter`, vóór eerste regen. Die diagnostische opname
wordt niet als gewone kandidaatbenchmark gebruikt.

Na de lockinstructie van 09:40 wacht elke run buiten de lock op load ≤8.
Elke herhaling krijgt een eigen lockperiode en browserproces; na verkrijgen
wordt de load opnieuw gecontroleerd. Bij drukte wordt de lock vrijgegeven.
De nieuwe U65-referentie en kandidaten gebruiken beide deze methode;
oude reeksen met een gedeeld browserproces zijn geen directe vergelijking.
Elke native capture eist een plaatsenaanvraag ná ttfp en vermeldt die in
de waterval; een ontbrekende of te vroege aanvraag maakt de capture ongeldig.
Een afzonderlijke U65-aanvraagvolgordecapture op deze branch is geslaagd:
plaatsenlijst +1448,7 ms ná ttfp, 60.946 bodybytes. Die expliciet gemarkeerde
capture liep onder hostdrukte en bewijst alleen volgorde. De tijden en
decode-/byteaantallen ervan leveren geen baseline of snelheidsvergelijking.

De shaderkandidaat start alle vier windprogramma's vóór de eerste linkquery
en vraagt geen tussentijdse compile-status van regen-/windshaders.
Shaderbronnen en tekenvolgorde zijn gelijk; linkfouten houden hun logs en
ruimen aangemaakte resources op. Dit volgt de algemene
[Khronos-best practice](https://registry.khronos.org/webgl/extensions/KHR_parallel_shader_compile/),
zonder de extensie te vereisen. Verwachte winst is minder geserialiseerd
GPU-wachten; omvang en invloed op ttfr/ttfp/LoAF zijn nog ongemeten.

Een offline functiediagnose van de U65-volgordecapture, met ook MapLibre's
eigen sourcemap, toont 141 self-samples in diens programmaconstructor:
34 vóór eerste regen, 107 ná ttfp maar vóór kaart-ttfr. Vier drukke samples
blijven onbekend. De bron vraagt tweemaal compile-status vóór link.
Dit ondersteunt onderzoek naar shaders in de ttfr-keten, maar geeft onder
load 41,34 geen bruikbare CPU-duur of snelheidswinst. Er is geen
MapLibre-patch toegepast. De schone native CPU-opname wijst vooral op
`_setupPainter` als grote taak vóór eerste regen; dat is de basis voor
de afzonderlijke workerproef.

Daaruit volgt een nieuwe proef: `VITE_WEBGL_PREWARM=worker`, standaard uit,
maakt vroeg een WebGL2-context in een OffscreenCanvas-worker, voor brede
desktops met ≥8 cores. Initialisatie kan dan met JS/data overlappen.
De tijdelijke context/worker wordt opgeruimd; still/Skywatch slaan hem over.
Dezelfde shaderbatch-JS blijft 411.362 B gzip; HTML 2571→3143 B gzip.
Typecheck, 509 units, proefbuild en 13 gerichte WebGL-e2e zijn geslaagd;
ttfr/ttfp, LoAF-bewaker en Lighthouse voor de proef blijven pending.

De nieuwe gate-baseline wordt uit drie ongewijzigde main-runs geschreven
naar `desktop-koud-spelend-own-u65.json`. Reden: U62/Kaderhemel, U65's
plaatsenaanvraag na ttfp en aparte browserprocessen per herhaling,
niet een verruimd perf-budget. De originele
pre-U62-baseline blijft bewaard. Mergechecks: typecheck, 497 unittests,
build en 23 gerichte desktop-e2e geslaagd (twee mobiel-only overgeslagen).
Na U65 zijn typecheck, 509 unittests, beide kandidaatbuilds en 21 gerichte
desktop-e2e geslaagd (twee mobiel-only overgeslagen).

## Starttijden

Mediaan per kolom. `firstRainMs` meet de eerste regentekenbeurt; bestaand
`ttfrMs` vereist ook een gereedgemelde basiskaart. Een splash of placeholder
kan een regentekenbeurt nog bedekken. `ttfpMs` vereist een volgende regenframe
terwijl de tijdlijn speelt. Dat onderscheid blijft behouden.

| variant | ttfr regen + basiskaart | ttfp | eerste regen | LoAF na ttfp: aantal / max ms per run | Lighthouse |
| --- | ---: | ---: | ---: | --- | ---: |
| referentie koud | 733 ms | 364 ms | 285 ms | 9/436 · 0/0 · 0/0 | 65 |
| stijl/font/manifest inline | 709 ms | 351 ms | 274 ms | 9/347 · 0/0 · 0/0 | 63 |
| inline + lazy | 747 ms | 339 ms | 269 ms | 8/339 · 1/52 · 0/0 | 65 |
| finale build, tabelobserver hersteld | 638 ms | 359 ms | 289 ms | 10/430 · 1/60 · 0/0 | 68 |
| referentie warm | 654 ms | 324 ms | 275 ms | 0/0 · 0/0 · 0/0 | — |
| inline + lazy warm | 658 ms | 305 ms | 252 ms | 3/60 · 0/0 · 0/0 | — |
| referentie met devpaneel | 674 ms | 354 ms | 282 ms | 8/520 · 2/76 · 0/0 | 66 |
| SVG, met devpaneel (vervallen) | 694 ms | 368 ms | 290 ms | 10/631 · 3/66 · 1/55 | 71 |
| inline z4-tegel, met devpaneel | 690 ms | 360 ms | 284 ms | 9/563 · 4/68 · 2/77 | 65 |

LoAF telt volledige frames die ná ttfp beginnen en binnen het venster van
12 seconden eindigen; geen beperking tot de vijf zwaarste HUD-frames.
De eerste koude browserstart heeft ook na ttfp nog grote lange frames.
Inline/lazy verhoogt de maximale duur niet, maar dit is geen nulclaim.
Drie runs tonen kleine verschillen met aanzienlijke kaartvariatie:
De eerdere inline/lazy-reeks gaf eerste regen −5,7%, ttfp −6,9%, volledige
kaart-ttfr +2,0%. De finale herhaling geeft +1,6% / −1,3% / −12,9%.
Die variatie onder dezelfde lock en loadgrens is geen overtuigend bewijs
voor een grote starttijdwinst. Manifest/font worden wel aantoonbaar vroeger
gevraagd. Alle JS vóór regen is in de finale build 436,6 kB; hoofd-JS-parse
mediaan 23,2 ms. De observercorrectie herstelt krap-apparaat-functionaliteit;
de native desktopcaptures gebruiken 8 cores/8 GB en eager puntreeksen.

Lighthouse 13.0.1: desktop, 1280×800, bestaande throttling, SwiftShader,
één run per build. Referentie/inline/lazy TBT: 1165/1154/1019 ms.
Finale build: score 68, TBT 728 ms.
FCP/LCP zijn de splash, niet het eerste regenframe. De eerste SVG/tegel-LH-runs
zonder devactivatie waren 65/66; die meten uitsluitend de extra buildkosten
en worden niet als score van de actieve placeholder gebruikt.

## Wat veranderde

| schakel | referentie | inline | inline + lazy |
| --- | ---: | ---: | ---: |
| hoofd-JS raw / gzip | 1434,9 / 419,2 kB | 1434,9 / 419,2 kB | 1396,6 / 406,4 kB |
| alle JS ontvangen vóór eerste regen, inclusief `?perf` en vier workers | 439,4 kB | 439,4 kB | 436,6 kB |
| HTML gzip | 1,0 kB | 2,6 kB | 2,6 kB |
| hoofd-JS parse CPU, mediaan | 23,3 ms | 23,4 ms | 22,8 ms |
| manifeststart, tweede run | 75 ms | 9 ms | 9 ms |
| fontstart, tweede run | 97 ms | 4 ms | 4 ms |
| eerste regen-Range, tweede run | 144 ms | 140 ms | 126 ms |
| eerste regendecode, tweede run | 243→244 ms | 233→235 ms | 221→223 ms |
| textuurupload, tweede run | 267 ms | 245 ms | 235 ms |

Beide native stijlen staan inline in HTML; de Latijnse glyph-range krijgt
een fetch-preload en wordt eenmaal gevraagd. Manifestfetch begint in HTML
en wordt eenmaal overgenomen; refresh haalt verse data. Still/Skywatch
starten geen normale sessiefetch. Eerste regen-Range blijft afhankelijk van
manifest en MRF-header: blind preloaden kan een hele chunk of dubbele Range
ophalen. De bestaande vroege eerste twee regenframes blijven de verbruiker.

ForecastTable, PerfHud, DevPanel inclusief wind-tuning, AboutDialog en
SkywatchRender hebben aparte chunks. De zichtbare desktoptabel en aangezette
HUD laden meteen: de entrydaling van 12,8 kB betekent daarom slechts 2,8 kB
minder JS vóór de eerste regentekenbeurt in deze opname. De profielrecorder
en Telegram-SDK waren al conditioneel; Telegram-still deelt de noodzakelijke
kaartlagen. V8-parse telt buitenste spans, zonder dubbele geneste events.

Warme reeksen meten een volledig geprimede, gecontroleerde SW na echte
reload, met HTTP-cache uit. Alle zes warmcaptures: nul interne
SW-netwerkrequests voor app-shell/kaartassets; 70 verse weerrequests,
1.058.723 B. Resource Timing/HUD toont door de SW nul bytes; dat is geen
bewijs dat weerdata gecacht werd. Geen wijziging aan de bestaande SW nodig.
In deze eerste warme reeksen is de load vóór priming vastgelegd. De
aangescherpte capture verlaat daarna de prime-renderloop via about:blank
en registreert de load direct vóór de meetnavigatie. Is de load dan >8,
dan sluit de browser en komt de lock vrij; opnieuw wachten gebeurt buiten
de lock vóór een nieuwe poging, inclusief nieuwe priming.
Die extra warme herhaling is nog pending.

## Kandidaten op verwachte regenstartwinst

| volgorde | kandidaat | onderbouwing / stand |
| ---: | --- | --- |
| 1 | stijl, font en manifest vanuit HTML | manifest 75→9 ms, font 97→4 ms; uitgevoerd, default aan |
| 2 | eerste regenaanvragen vóór overige manifestreacties | voorkomt dat reactieve verwerking de dispatch ophoudt; gebouwd, meting pending |
| 3 | kaart-/overlayshaderwerk tijdens de koude start | lange kaarttaken aangetoond; CPU-profiel moet oorzaak en tijd vóór/na ttfp bepalen voordat de uitvoering verandert |
| 4 | aanvullende Caddy Link/103 | HTML start font al op ~4 ms en manifest op ~9 ms; vermoedelijk weinig extra lokale winst, productie-RTT kan anders zijn; nog geen gemeten 103-winst |
| 5 | verdere bundelsplitsing | bestaande lazy-entry −12,8 kB, werkelijk vóór regen −2,8 kB; parsewinst klein |

De externe MapLibre-CSP-worker is statisch beoordeeld en niet gebouwd:
de geïnstalleerde 5.24.0-main zou ~27,6 kB gzip kleiner worden, maar de
aparte worker kost ~124,3 kB gzip en een extra aanvraag. Minder entrybytes
alleen rechtvaardigen dat niet voor een snellere eerste regenframe. Warm
blijft een aparte cachemeting; de bestaande SW vermijdt al kaartnetwerk.

Voor aanvullende 103 is eerst een passend meetcontract nodig. De huidige
rig gebruikt HTTP/1.1 en schakelt HTTP-cache uit. Chromium negeert
[Early Hints via HTTP/1.1](https://chromium.googlesource.com/chromium/src/+/master/docs/early-hints.md);
Chrome noemt voor de preloadmeting een vertrouwd HTTPS-certificaat en
[ingeschakelde cache](https://developer.chrome.com/docs/web-platform/early-hints).
Caddy kan met [respond 103](https://caddyserver.com/docs/caddyfile/directives/respond)
wel een voorlopige response sturen, maar dat alleen bewijst geen browserwinst.
Het productie-sessiemanifest heeft `Cache-Control: no-store` en is geen
geschikte cachepreload: dubbel ophalen kan ook de sessieteller verdubbelen.
HTML start die fetch eenmaal en deelt de response. Een vervolgproef richt
zich op cachebare fonts/assets via HTTPS/HTTP2, met dezelfde cachecondities
voor referentie en kandidaat; geen ongefundeerde 103-winst of productiehint.

## Kaartvoorstel

SVG: 10.631 B, gzip 3.652 B. Twee eigen z4-tegels: JSON 32.169 B,
gzip 24.368 B. Beide volgen de kaartcamera; overgang naar netwerkkaart
zonder witte tussenlaag. De kaartreview blokkeert PMTiles bewust totdat
regen getekend is en legt licht/donker vóór en na vrijgave vast.

De SVG-kust is grof en bevat geometrische vereenvoudigingsartefacten;
de native tegel oogt vollediger maar voegt veel meer HTML toe. Beide
varianten hebben in deze reeksen hogere mediane volledige kaart-ttfr en ttfp
dan dezelfde devreferentie. Voorstel: geen standaardactivatie op dit bewijs.
Het screenshotvoorstel is vóór activatie via herdr aan de orkestrator geleverd.
Zijn besluit: SVG-code/asset verwijderen, geen verdere optimalisatie; native
z4-tegel visueel akkoord maar op desktop standaard uit. Alleen die tegel
blijft reviewbaar via `VITE_MAP_START=tegel` en `?dev&kaartstart=tegel`, eigenaar
U64, verval 2026-10-15. U63 meet de mobiele waarde. Onderstaande SVG-beelden
blijven historisch meetbewijs.

## Lighthouse-oorzaak

| metriek | referentie: waarde / subscore | finale lazy: waarde / subscore |
| --- | --- | --- |
| FCP | 354 ms / 100 | 344 ms / 100 |
| LCP (splash) | 354 ms / 100 | 344 ms / 100 |
| TBT | 1165 ms / 3 | 728 ms / 13 |
| Speed Index | 2559 ms / 40 | 2655 ms / 37 |
| CLS | 0,017 / 100 | 0,017 / 100 |

De Lighthouse-score is 60 punten uit FCP/LCP/CLS, plus 3,9 punten uit TBT
en 3,7 uit Speed Index, afgerond 68. TBT en Speed Index drukken de score;
ongebruikte JS en renderblokkerende CSS hebben geen rechtstreeks gewicht.
De CSS-audit schat hier nul FCP/LCP-winst. Ongebruikte JS ~212 kB,
waarvan ~179 kB MapLibre; de kaart is wel nodig voor het eerste regenbeeld.

Een extra Lighthouse-diagnose op dezelfde bevroren build scoort 67:
FCP/LCP 366 ms (100), TBT 776 ms (11), Speed Index 2774 ms (33), CLS
0,017 (100). Hoofddraad-taken van 370 ms op t=161 en 634 ms op t=857;
de latere bevat een MapLibre-call van 209 ms. Script evaluation is dominant,
geen grote parse-/compilepost. Verdere kandidaten richten zich daarom op
de eerste regenaanvraag vóór overige manifestreacties en kaart/shaderwerk.

| review | licht vóór / na netwerkkaart | donker vóór / na netwerkkaart |
| --- | --- | --- |
| SVG | [vóór](screenshots/svg-light-voor-tegels.png) / [na](screenshots/svg-light-na-tegels.png) | [vóór](screenshots/svg-dark-voor-tegels.png) / [na](screenshots/svg-dark-na-tegels.png) |
| z4-tegel | [vóór](screenshots/tegel-light-voor-tegels.png) / [na](screenshots/tegel-light-na-tegels.png) | [vóór](screenshots/tegel-dark-voor-tegels.png) / [na](screenshots/tegel-dark-na-tegels.png) |

## Reproduceren

Alle browser-perf neemt `flock -w 7200 /home/mathijs/motregen-perf.lock`
voor één run. Load- en slotwachttijd blijven buiten de lock. Wrappers
herkennen een handmatige buitenlock voor één run; plaats geen hele lus
onder flock. Builds en gewone e2e blijven buiten de lock.
Rapporten/traces staan lokaal onder gitignored `tmp/u64/`.

```sh
cd web
bash scripts/desktop-rig.sh ../tmp/u64/herhaal --repeat=3
bash scripts/desktop-rig.sh ../tmp/u64/warm-herhaal --repeat=3 --warm
pnpm exec tsx scripts/start-waterfall.ts ../tmp/u64/herhaal-cold-run*.json
MOTREGEN_E2E_PORT=4394 MOTREGEN_E2E_DATA_PORT=8394 pnpm perf:mobile \
  --profile desktop --scenario koud-spelend --basemap own --compare \
  --baseline-file perf/baselines/desktop-koud-spelend-own.json
MOTREGEN_E2E_PORT=4365 MOTREGEN_E2E_DATA_PORT=8365 pnpm e2e \
  e2e/basemap.spec.ts e2e/basemap-cache.spec.ts e2e/dev-panel.spec.ts \
  e2e/table.spec.ts e2e/usage.spec.ts e2e/presets.spec.ts e2e/seo.spec.ts \
  --project desktop
```

De eigen koud-spelend-baseline is vóór de productwijzigingen opgebouwd uit
drie ongewijzigde runs: die combinatie had geen bestaande baseline. Geen
budgetgrens verruimd. Definitieve checks en synchrone exitstatussen staan
append-only in [LOG.md](LOG.md).
