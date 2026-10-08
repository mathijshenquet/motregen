# U64 — desktoplus

Huidige basis: main `4038d55` met U62 deel 2 en U67. Drie A/B-paren
per scenario, startload maximaal16; medianen van verschillen binnen paren:

| scenario | ttfr | ttfp | paren |
| --- | --- | --- | --- |
| koud | −571,3 ms / −33,06% | −68,1 ms / −8,34% | 3 |
| warm | −238,2 ms / −14,12% | −36,1 ms / −4,50% | 3 |

Alle zes paren verbeteren ttfr. De vroege stijl/font/manifestaanvragen en
lazy modules blijven behouden; shader-, GPU-worker- en manifest-SWR-proeven
zijn afgewezen voor standaardgebruik. Lighthouse-scoremediaan63→62;
TBT en Speed Index blijven beperkingen. Grote LoAF na ttfp blijven aanwezig.
De absolute ≤8-baseline/compare is groen; onderstaande gepaarde cijfers
zijn geen absolute desktop-MacBook-baseline.

[Stap 0](STAP-0.md) is vóór productwijzigingen vastgelegd. De eerdere reeksen
gebruiken dezelfde U57-basis en bevroren builds, onder de gedeelde hostlock.
Desktop Chrome, 1280×800, DPR 1, 8 cores/8 GB, CPU 1×, SwiftShader,
synthetische data; drie runs per variant. Koud: verse context, HTTP-cache uit,
SW geblokkeerd. Het browserproces wordt binnen een reeks gedeeld; de eerste
run bevat extra browser/GPU-initialisatie. Geen MacBook-benchmark.

## Warm: nieuwe PO-prioriteit en meetdefinitie

Koud en warm worden vanaf deze ronde naast elkaar beoordeeld: ttfr eerst,
ttfp daarna; volledige LoAF na ttfp bewaakt regressies. De oude warme rig
hergebruikte een pagina, schakelde HTTP-cache uit en serveerde frontendassets
met no-store. Die opnames zijn geen baseline voor de nieuwe definitie.

Warm primet een nieuw schijfprofiel, wacht op SW/kaartcache, sluit de browser
volledig en start een nieuwe browser/pagina met dat profiel. HTTP-cache is
aan, SW blijft actief; geen app- of GPU-geheugen uit de seedpagina. Cache-
inventaris, SW-controller, HTTP/SW-responseherkomst, HTML/SW-SHA en uiteindelijke
pad-URI worden opgeslagen. Referentie warm ×3 komt vóór conclusies.
[Playwright persistent context](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context)
bewaart het profiel tussen browserstarts.

App-shell, stijl-JSON en glyphs staan al in Workbox-precache. Exacte PMTiles-
Ranges hebben een eigen SW-cache; weer-Ranges gebruiken NetworkOnly en de
HTTP-cache. Dat wordt per verzoek gecontroleerd. Geen extra volledige
plaatsenlijst in precache: de normale aanvraag moet ná ttfp blijven.

Nieuwe afzonderlijke proef VITE_WARM_CACHE=manifest, standaard uit:
slechts /data/manifest.json?s=1 krijgt stale-while-revalidate, maximaal 15 s
oude cache-inhoud. Een expliciete no-cache/reload/no-store-aanvraag slaat
de opgeslagen respons over; fouten worden niet gecachet. De achtergrond
herlaadt het manifest, volgens
[Workbox SWR](https://developer.chrome.com/docs/workbox/modules/workbox-strategies).
511 units, bestaande offline/Range-cache-e2e en een echte SW-versheidstest
zijn groen: verse inhoud offline, expliciete verversing netwerk, inhoud
na 15 s niet bruikbaar. De koude/warme metingen staan hieronder; SWR is
afgewezen voor standaardgebruik.

## Vervolg na U62/Kaderhemel en U65

Main `ec3ca02`, inclusief U62 `8d75754f`, U65 `0fb247ec` en U66, is
samengevoegd. Kaderhemel staat nu altijd aan en de tabel/scrubber hebben
andere hemelverwerking. U65 haalt de volledige plaatsenlijst pas ná ttfp.
De onderstaande oudere U57-tijden blijven historisch; nieuwe timingwinst
wordt tegen dezelfde U62-startsituatie gemeten.

| kandidaat, verschil binnen A/B-paren | koud ttfr / ttfp | warm ttfr / ttfp | paren koud / warm |
| --- | --- | --- | --- |
| volledige regen/windshaderbatch | +7,17% / −14,66% | +1,98% / +0,064% | 3 / 3; afgewezen |
| alleen regenshaders | −7,95% / +0,93% | +12,81% / +23,81% | 3 / 3; afgewezen |
| GPU-worker zonder shaderwijziging | −11,98% / +3,04% | +15,66% / +18,14% | 3 / 3; afgewezen voor standaardgebruik |
| manifest-SWR zonder shaderwijziging | −3,33% / −1,63%; inactieve controle | +14,73% / +5,07% | 3 / 3; afgewezen voor standaardgebruik |
| totale U64 zonder shaders versus main | −17,37% / +3,24% | −17,16% / −1,75% | 3 / 3 |

Medianen van verschillen binnen paren, geen absolute baseline. Regen-only
koud heeft deltas +115,9 / −531,0 / −101,0 ms ttfr en +129,9 / −240,7 /
+7,3 ms ttfp. Het tweede paar heeft startload 15,86/14,20 en gemiddelde
opnameload 15,85/13,62; de grote winst is daardoor onzeker. Het derde paar
heeft vrijwel gelijke opnameload 15,52/15,67 en ttfr −101 ms. Warm geeft
deltas −3,2 / +168,5 / +347,8 ms ttfr en −40,1 / +176,7 / +224,1 ms ttfp.
Daarom is ook regencompile teruggezet naar main en is de helper verwijderd.
De GPU-/manifestproeven zijn opnieuw gebouwd zonder shaderwijziging;
de totale U64-versus-mainvergelijking begint met warm ×3.

Koud main→U64 geeft ttfr 1420,1→1173,4 / 1436,4→1163,8 /
1213,8→1134,6 ms, ttfp 766,5→791,3 / 771,8→793,4 / 763,4→788,3 ms.
Mediaan van de gepaarde verschillen: ttfr −246,7 ms (−17,37%), ttfp
+24,8 ms (+3,24%). Startloads A/B 15,51/14,91;15,77/14,98;14,91/15,60;
tijdgaps157,9/115,6/85,7s. De eerste poging van paar1 is afgewezen door
3,32 loadverschil, ondanks gunstige ttfr. LoAF-max A/B koud542,9/475,8;
484,0/394,8;407,4/394,9ms. Alle zes koude/warme paren verbeteren ttfr;
de geringe koude ttfp-regressie blijft zichtbaar. De HTML-assets/lazy-
wijzigingen blijven op deze primaire ttfr-winst in de track. De GPU-proef
en manifest-SWR zijn afgewezen. Lighthouse ×3 en de groene absolute
≤8-gate staan hieronder.

Warm main→U64 geeft ttfr 1253,6→1240,4 / 1499,6→1242,3 /
1790,6→1091,6 ms, ttfp 737,4→808,9 / 786,4→772,6 / 926,3→746,1 ms.
De mediaan van de drie gepaarde verschillen is −257,3 ms ttfr en −13,8 ms
ttfp. Startloads A/B zijn 14,58/14,77;15,56/14,57;13,04/14,91.
Volledige post-ttfp LoAF-maxima A/B: 431,9/368,1;514,3/435,9;526,0/440,2 ms;
grote frames blijven aanwezig. Warm pair1-serverlogs hebben aan beide kanten
slechts manifest200 (36.513 bodybytes) en SW304; geen kaart-, font-, JS-,
plaatsen- of weer-Ranges-netwerk. Font en manifest starten vroeger in U64,
maar het eerste regenframe kan nog later komen. Koud ×3 staat hierboven.
De drie warme main-opnames zijn referenties voor
deze paarvergelijking, geen absolute ≤8-baseline voor docs/perf.md.

De nieuwe, ongewijzigde main-referentie heeft 424.978 B gzip hoofd-JS;
U64 na merge, vóór shaderbatching: 411.280 B; met shaderbatching: 411.362 B.
De eerdere U62-builds (422.475 / 409.063 B) zijn niet gemeten vóór U65.
Bevroren builds gebruiken
dezelfde fixture en native-desktopcapture. De vergelijking van main met
U64 zonder shaders is koud ×3, warm ×3 en Lighthouse ×3 compleet;
De absolute ≤8-gate is groen, hieronder met baseline-reden en receipt.

GPU-worker koud ×3: ttfr-deltas +91,6/−371,8/−151,1ms, mediaan
−151,1ms (−11,98%); ttfp +23,6/+101,7/−47,5ms, mediaan
+23,6ms (+3,04%). Warm ×3: ttfr −544,5/+357,6/+254,4ms,
mediaan +254,4ms (+15,66%); ttfp +91,4/+428,2/+182,3ms,
mediaan +182,3ms (+18,14%). Alle warme paren vertragen ttfp.
De basiskaart bepaalt hier ttfr; de eerste regentekenbeurt wordt koud
niet in ieder paar vroeger. LoAF-max na ttfp A/B koud:
493/478,420/558,507/582ms; warm:403/427,448/428,600/631ms.
De koude primaire winst weegt niet op tegen de warme regressie.
De bouwproef blijft reproduceerbaar, standaard uit en met verval2026-10-15.

Manifest-SWR koud heeft dezelfde HTML/app-JS en een geblokkeerde SW.
De deltas −100,3/−41,4/−19,5ms ttfr (mediaan−41,4ms) en
−5,5/−35,4/−12,3ms ttfp (mediaan−12,3ms) bewijzen daarom geen
cachewinst; ze tonen meetvariatie bij een inactieve proef.
Warm ×3 is compleet, met in iedere kandidaatopname een echte manifestcachehit.
Ttfr-deltas +19,2/+176,1/+203,6ms: mediaan+176,1ms (+14,73%).
Ttfp-deltas +37,5/+195,6/+7,5ms: mediaan+37,5ms (+5,07%).
Alle drie vertragen beide metrics. Gemiddelde loadverschillen B−A:
−0,335/−0,187/−0,321, dus geen hogere kandidaatload als verklaring.
LoAF-max na ttfp A/B390/443,379/445,400/428ms.
SWR is afgewezen voor standaardgebruik; de bouwproef blijft uit en
reproduceerbaar tot verval2026-10-15. App-shell/kaartassets waren al gecachet.

### Main na U62 deel 2

Main `4038d55` bevat U62 deel 2 en U67. De kaart volgt onder Expressief
nu standaard de zonnestand, met vier mengstappen en maximaal één stap
per seconde tijdens afspelen. De bovenstaande cijfers blijven gekoppeld
aan `ec3ca02`; ze gelden nog niet als bewijs voor deze gewijzigde start.
De merge had geen conflicten in App.tsx of de lazy tabel. Typecheck,
511 units, referentie-/U64-builds en gerichte desktop-e2e zijn groen:
12 geslaagd, twee uitsluitend mobiele scenario's overgeslagen.

Nieuwe bevroren entrygzip: main423.597 B, U64410.171 B (−13.426 B).
De oude absolute-gaterunner is tijdens het wachten zonder meetbrowser
gesloten (exit143); hij had nog geen baseline geproduceerd. De nieuwe
gate gebruikt `desktop-koud-spelend-own-u62-part2.json`, met U62's
standaard kaartkleuring als extra reden naast Kaderhemel, U65 en de verse
browser per run. Startload maximaal8 blijft verplicht. Nieuwe native
koud/warm-paren en Lighthouse op deze basis staan afzonderlijk hieronder.

Lighthouse op deze basis is ×3 compleet: scores60→62,63→61,63→62;
mediaan63→62. Startloads A/B15,40/15,01;14,32/15,61;15,42/13,64,
gaps175,6/240,3/261,2s, gemiddelde loadverschillen−0,048/+1,928/−0,513.
Geen Lighthouse-winst. Onderstaande waarden zijn de medianen per kant.

| metriek | main U62 deel 2: waarde / subscore | U64: waarde / subscore |
| --- | --- | --- |
| FCP | 481 ms / 100 | 437 ms / 100 |
| LCP (splash) | 481 ms / 100 | 437 ms / 100 |
| TBT | 1223 ms / 2 | 1400 ms / 1 |
| Speed Index | 3062 ms / 25 | 3211 ms / 22 |
| CLS | 0,0603 / 98 | 0,0663 / 97 |

Binnen paren: FCP/LCP mediaan−34,6ms, TBT+147,5ms,
Speed Index+247ms, CLS+0,00544. De nieuwe native ttfr/ttfp-reeks
is voltooid, warm ×3 eerst en daarna koud ×3. Retentie van de huidige
productwijzigingen is daarmee op de gewijzigde start gecontroleerd;
de eerdere primaire winst blijft afzonderlijk bewijs op de ec3-basis.

Nieuwe native stand: koud3/3, warm3/3 geldige paren. Koud ttfr:
1894,2→1267,9 /1587,7→1088,6 /1403,5→832,2ms;
mediaan binnen paren−571,3ms (−33,06%). Koud ttfp:
1696,9→898,2 /816,7→748,6 /767,3→795,9ms;
mediaan binnen paren−68,1ms (−8,34%). Het laatste paar vertraagt
ttfp28,6ms terwijl ttfr571,3ms verbetert. Startloads15,91/15,42;
14,84/14,36;15,05/14,47, gemiddelde loadverschillen−1,035/+0,259/−0,511,
gaps60,9/48,1/15,2s. LoAF-max na ttfp A/B462/525,682/388,553/370ms.

Warm ttfr:
1685,3→1447,1 /1697,0→1457,3 /1558,4→1444,8ms;
mediaan binnen paren−238,2ms (−14,12%). Warm ttfp:
840,2→745,5 /802,2→766,1 /750,4→739,8ms;
mediaan binnen paren−36,1ms (−4,50%). Alle drie verbeteren beide metrics.
Startloads13,50/13,91;12,22/11,11;15,00/15,83,
gemiddelde loadverschillen+1,734/−1,141/+1,476,
gaps157,8/417,0/132,8s. LoAF-max na ttfp A/B:
799,7/626,0;797,5/579,3;695,4/565,3ms: grote frames blijven.
De serverlogs van het eerste paar hebben aan beide kanten alleen
manifest200 (36.513 bodybytes) en SW304; geen upstream voor
kaart/fonts/app/plaatsen/weer-Ranges. De native koud/warm-reeksen zijn
compleet en ondersteunen retentie; de absolute ≤8-gate is groen.

Warm blijft in deze rig trager op ttfr: U64-mediaan1447,1ms tegen
koud1088,6ms. Het eerste regenbeeld is warm juist eerder (634–660ms,
koud688–806ms). De vijf kaart-Ranges kosten per aanvraag warm1–4ms en
koud1–5ms; fonts zijn vóór10ms binnen. Warm eindigen kaartresponses op
674–698ms, maar basemapReady volgt pas op1445–1457ms. Het resterende
verschil zit dus ná levering van de kaartdata, in verwerking/tekenen;
de trace splitst worker-/GPU-wacht en scheduling niet betrouwbaar verder.
Extra precache of manifest-SWR lost die staart in deze rig niet op.
Historische eerste absolute poging op ec3 (niet afgerond, niet hervat):

| variant | koud ttfr / ttfp | warm ttfr / ttfp | geldige runs koud / warm |
| --- | --- | --- | --- |
| main U65 | 1617,3 / 775,1; 1669,1 / 842,6 ms | niet uitgevoerd | 2 / 0 |
| U64 + shaderbatch | 1135,2 / 783,2 ms | niet uitgevoerd | 1 / 0 |
| U64 + GPU-worker | niet uitgevoerd | niet uitgevoerd | 0 / 0 |
| U64 + manifest-SWR | niet uitgevoerd | niet uitgevoerd | 0 / 0 |

Eerste twee gewone koude referentieruns: ttfr 1617,3 / 1669,1 ms,
ttfp 775,1 / 842,6 ms bij startload 7,98 / 7,97. Nog geen reeks van drie en
geen vergelijkingsclaim. Een aparte cpuProfile-opname op U64 vóór shaders
heeft startload 7,89; de grootste RunTask is 236 ms met circa 225 ms in
MapLibre's `_setupPainter`, vóór eerste regen. Die diagnostische opname
wordt niet als gewone kandidaatbenchmark gebruikt.

Absolute runs wachten buiten de lock op load ≤8. Na de nieuwste
orkestratorinstructie worden relatieve kandidaatverschillen afzonderlijk
gepaard A B A B A B gemeten bij load ≤16; load staat per run genoteerd.
De oorspronkelijke shaderparen startten met de toen geldende grens ≤12.
Paarmetadata sluit die opnames uit van absolute baselines. Dezelfde
fixtures/builds/browsermethoden blijven gelden. De eerste reeksen houden ≤5 min
tussen starttijden en ≤2 loadverschil aan. Na drie afwijzingen door de
gedeelde wachtrij is voor nieuwe paren vooraf ≤10 min vastgelegd, met
aanvullend ≤2 verschil tussen de gemiddelde opnameloads. De capture-/paar-
metadata bewaart de gebruikte criteria. Oude afwijzingen blijven afgewezen.
Bij een ongeldig venster blijven de raw-
opnames bewaard en wordt een nieuw volledig paar gestart. Koud en warm
worden per kandidaat samen gerapporteerd, met mediaan van de verschillen
binnen drie geldige paren. De shaderisolatie loopt eerst, daarna de
GPU-worker, manifestproef en totale U64 versus main.
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

De volledige shaderbatch is afgewezen: de mediaan van drie koude paren
verslechtert ttfr met 80,3 ms (+7,17%), terwijl ttfp 136,9 ms (14,66%) verbetert.
Warm geeft mediaan ttfr +21,8 ms (+1,98%), ttfp +0,5 ms (+0,064%).
Wind is daarom teruggezet naar main. De afzonderlijke regencandidate liet
ook warm regressie zien en is eveneens teruggedraaid.
Shaderbronnen en tekenvolgorde blijven gelijk; linkfouten houden hun logs en
ruimen resources op. Dit volgt de algemene
[Khronos-best practice](https://registry.khronos.org/webgl/extensions/KHR_parallel_shader_compile/),
zonder de extensie te vereisen. Verwachte winst is minder geserialiseerd
GPU-wachten; de gepaarde ttfr/ttfp-meting rechtvaardigt hier geen behoud.

| volledige shaderbatch | koud ttfr / ttfp: verschil B−A | warm ttfr / ttfp: verschil B−A |
| --- | --- | --- |
| paar 1 | −172,8 / −136,9 ms | +113,3 / −0,3 ms |
| paar 2 | +80,3 / −242,9 ms | +21,8 / +29,9 ms |
| paar 3 | +97,2 / −19,1 ms | −223,0 / +0,5 ms |

De eerste vijf paren gebruiken startload ≤12; warm paar3 gebruikt de later
toegestane grens ≤16, met startload15,60/15,17 en tijdgap65,0s. Raw blijft
ongewijzigd. De eerste poging van warm3 had een tijdgap804s en is afgewezen.
Bij warm1/2 gebruikt de rig manifestrevalidatie; warm3 de gecorrigeerde
productieheader no-store. Per paar zijn de headers aan beide kanten gelijk.
Volledige LoAF na ttfp heeft maxima 384–528 ms koud en 411–458 ms warm;
de bewaker is daarmee nog niet opgelost. Eén warme kandidaatcapture heeft
serverbewijs: alleen manifest- en SW-revalidatie (304, nul bodybytes), geen
netwerkrequests voor tegels, fonts, app-JS, plaatsen of weer-Ranges. De
gevulde caches werken; GPU-initialisatie in een verse browser blijft relevant.
De manifestheader in de rig is daarna afgestemd op productie: sessionmanifest
`?s=1` krijgt `no-store`, zodat nieuwe A/B-paren dezelfde verse aanvraag doen.

De historische regenvariant heeft 411.429 B gzip hoofd-JS, 2.573 B HTML-gzip;
met GPU-worker 3.197 B HTML-gzip. Alle drie nieuwe frozen builds,
typecheck, 511 units en vijf gerichte desktop-e2e zijn geslaagd; één bestaande
windzoom-fixme blijft overgeslagen. GPU- en manifestproef blijven standaard uit.
Na terugdraaien heeft de control-build weer 411.280 B gzip hoofd-JS;
JS, HTML en SW zijn bytegelijk aan de frozen vóór-shaders-build.
De nieuwe GPU-/manifestbuilds gebruiken diezelfde JS, met respectievelijk
3.197 / 2.573 B HTML-gzip. Typecheck, 511 units en de drie builds zijn groen.
Een enkel voltooid GPU-paar op de afgewezen regenbasis blijft historisch
(ttfr −46,3 ms, ttfp +50,3 ms) en telt niet bij de nieuwe proef mee.

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
Dezelfde shaderbatch-JS blijft 411.362 B gzip. De eerste context-only-proef
voegde 572 B HTML-gzip toe maar liet een main-task van circa 241 ms staan.
De herziene worker dient clear/finish in vóór ready en kost 3195 B HTML-gzip
(tegen 2571 B zonder proef). Oude context-only-opname en nieuwe GPU-proef
hebben aparte builds/bestandsnamen en worden niet als één variant gemiddeld.
Typecheck, 509 units, proefbuild en 13 gerichte WebGL-e2e zijn geslaagd;
Deze opname hoort bij de inmiddels afgewezen shaderbasis. De latere
shaderloze GPU-proef is hierboven koud/warm beoordeeld en afgewezen.

De voorgenomen `desktop-koud-spelend-own-u65.json` is niet geschreven:
U62 deel 2 veranderde opnieuw de start. De afgeronde nieuwe baseline heet
`desktop-koud-spelend-own-u62-part2.json`. Reden: U62/Kaderhemel, U65's
plaatsenaanvraag na ttfp, standaard kaartkleuring in U62 deel 2 en aparte
browserprocessen per herhaling, niet een verruimd perf-budget. De originele
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
Deze historische warmmethode is vervangen door de browserherstart met
HTTP/SW-schijfcaches; de nieuwe reeksen staan bovenaan.

## Kandidaten op verwachte regenstartwinst

| volgorde | kandidaat | onderbouwing / stand |
| ---: | --- | --- |
| 1 | stijl, font en manifest vanuit HTML | manifest 75→9 ms, font 97→4 ms; uitgevoerd, default aan |
| 2 | eerste regenaanvragen vóór overige manifestreacties | voorkomt dat reactieve verwerking de dispatch ophoudt; behouden met HTML/lazy op de totale koud/warm-ttfr-winst |
| 3 | kaart-/overlayshaderwerk tijdens de koude start | lange kaarttaken aangetoond; shaderbatching en GPU-worker gemeten en afgewezen, walltime/threadtijd onderscheiden |
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

Nieuwe main/U64-paarreeks na U62/U65: drie geldige paren, scores
63→62, 63→63 en 63→63. Startloads A/B:14,37/15,23;15,73/15,40;
12,64/11,72, tijdgaps264,2/145,8/193,5s. Dit zijn relatieve gegevens
bij de toegestane startgrens16, geen absolute ≤8-baseline.
Onderstaande waarden en subscores zijn de medianen van drie runs per kant.

| metriek | main U65: waarde / subscore | U64 zonder shaders: waarde / subscore |
| --- | --- | --- |
| FCP | 462 ms / 100 | 378 ms / 100 |
| LCP (splash) | 462 ms / 100 | 378 ms / 100 |
| TBT | 1151 ms / 3 | 1314 ms / 2 |
| Speed Index | 2972 ms / 27 | 2967 ms / 28 |
| CLS | 0,0586 / 98 | 0,0663 / 97 |

Binnen paren is de mediane FCP/LCP-delta −88,5ms, TBT +90,0ms,
Speed Index −71ms en CLS +0,00770. De scoremediaan blijft63→63;
deze reeks bewijst geen Lighthouse-winst. De derde eerste poging is
afgewezen ondanks score62→64: de gemiddelde opnameload verschilde3,83.

In het eerste paar domineert script evaluation2548→2517ms;
hoofd-entry parse/compile1,38→1,18ms.
Main heeft taken703/372ms; U64 heeft761/499/374ms. TBT blijft de grootste
scorebeperking. Ongebruikte JS213→208KiB, waarvan MapLibre ongeveer176KiB;
ongebruikte CSS12→11KiB. CSS staat als renderblokkerend gemeld, terwijl
FCP/LCP al100 scoren. De eerste kleine scoredaling is geen reden om de
consistente native ttfr-winst uit zes paren te verbergen; GPU- en
manifestkandidaten zijn inmiddels afzonderlijk afgewezen. Eén sourcemapwaarschuwing
bij de main-entry is geregistreerd; runtimeError ontbreekt in beide reports.

De trace nuanceert de scriptuitvoering: U64-taken761/499/374ms hebben
respectievelijk44/18/14ms threadtijd. De eerste bevat een callback van250ms
met6ms threadtijd; de tweede493ms met12ms threadtijd. Veel verstreken tijd
wordt dus buiten actieve hoofddraaduitvoering besteed. GPU-/commandbuffer-
wacht of scheduling is een inference; deze trace bewijst de verdeling niet.
De sourcemapketen levert voor die callback een shaderliteral op en wordt
daarom niet als betrouwbare functie-attributie gebruikt. Ongebruikte JS
verwijderen alleen verklaart dit TBT-probleem niet.

Onderstaande Lighthouse-reeks hoort bij de eerdere U57-basis:

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

## Absolute gate en eindvalidatie

Nieuwe baseline op main4038d55, drie runs met startload7,93/7,90/7,24:
1.760.209 bodybytes in alle drie;298/297/297 decodes, spreiding
0%bytes en0,336%decodes. Bestand:
[desktop-koud-spelend-own-u62-part2.json](../../../web/perf/baselines/desktop-koud-spelend-own-u62-part2.json).
De oorspronkelijke baseline blijft intact; de bestaande grens10% is
ongewijzigd. De reden is Kaderhemel/U65, verse browser per run en de
standaard kaartkleuring van U62 deel2.

Kandidaatcompare bij load7,50:1.757.816 bodybytes (−0,136%),297 decodes
(0%),nul netwerkbevindingen; synchroonexit0. Deze regressierig heeft het
bestaande Pixel-profiel met4cores/4GB en een expliciete stijl-URL; native
watervallen gebruiken8cores/8GB met inline stijl. Tijdgetallen niet mengen.
De gate bewaakt bytes/decodes; desktop-tijden zijn informatief.

Typecheck,77unitbestanden/511tests,referentie- en productbuilds en
12gerichte desktop-e2e zijn groen (twee mobiele scenario's overgeslagen).
De probe-e2e voor SW-versheid/offline/Range-cache en WebGL zijn eerder
afzonderlijk geslaagd; de proeven blijven standaarduit. Alle native,
Lighthouse- en absolute campagnes zijn afgesloten met waargenomenexit0.
Exacte commando's en receipts staan in[LOG.md](LOG.md). Geen eigen
achtergrond-meetbrowser of meetshell blijft lopen.

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
pnpm exec tsx scripts/start-upstream.ts ../tmp/u64/herhaal-cold-run1.json
MOTREGEN_RIG_PREBUILT=1 MOTREGEN_RIG_DIST=/pad/naar/bevroren-dist \
  bash scripts/desktop-rig.sh ../tmp/u64/paar-A --repeat=1 \
  --paired --pair=voorbeeld-cold-1 --role=A
MOTREGEN_E2E_PORT=4394 MOTREGEN_E2E_DATA_PORT=8394 pnpm perf:mobile \
  --profile desktop --scenario koud-spelend --basemap own --compare \
  --baseline-file perf/baselines/desktop-koud-spelend-own-u62-part2.json
MOTREGEN_E2E_PORT=4365 MOTREGEN_E2E_DATA_PORT=8365 pnpm e2e \
  e2e/basemap.spec.ts e2e/basemap-cache.spec.ts e2e/dev-panel.spec.ts \
  e2e/table.spec.ts e2e/usage.spec.ts e2e/presets.spec.ts e2e/seo.spec.ts \
  --project desktop
```

De eigen koud-spelend-baseline is vóór de productwijzigingen opgebouwd uit
drie ongewijzigde runs: die combinatie had geen bestaande baseline. Geen
budgetgrens verruimd. Definitieve checks en synchrone exitstatussen staan
append-only in [LOG.md](LOG.md).
Gepaarde varianten volgen A B A B A B, eerst shaderisolatie koud/warm,
daarna warme-cache/GPU-proeven en vergelijking met main. Bestaande geldige captures blijven bij hervatten behouden
na controle van load, browser/clock/query, profilerstatus en entryhash.
