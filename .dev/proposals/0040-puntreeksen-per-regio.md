# MIP-40 — Puntreeksen per regio

Status: draft · auteur: worker U102 (opus-5.5) voor de PM · meting 2026-11-09 · PO-vraag 2026-11-09

## Het probleem

De PO (2026-11-09): "Het laden van het histogram is nu heel traag […] voor het histogram heb je alleen de data op een
punt nodig, maar nu wachten we tot de data van alle locaties. […] Deze techniek kan ook voor de weekverwachting."

Het histogram, de tabel en de dagenlijst tonen één plek. De client haalt daarvoor nu hele rasters op, van heel
Nederland en omgeving, en leest er één cel uit: per uurveld 24–48 frames, per regenbron 25–48 frames van
1.250 × 1.350 cellen. Dat kost bytes en, op een telefoon, vooral decodeertijd: elk frame is een volledig zstd-member.

Deze MIP meet wat er nu tussen openen en een compleet histogram zit (fase 1), rekent uit wat een bestand per regio
kost en hoe groot de fout dan wordt (fase 2), en zoekt de knie. **Er is nog niets gebouwd.**

## Eerder werk

- **Decode-budget (U49)** en **intent-gedreven laden (U52)**: een krap apparaat laadt alleen het scrubbervenster en de
  tabelrijen in beeld; de wachtrij ordent op afstand tot de cursor. Dat beperkt het werk, maar elke puntwaarde kost nog
  steeds het decoderen van een heel raster (`docs/perf.md` §Decode-budget).
- **Member-hashes (U93)**: een verversing kost de header plus het nieuwe frame; een warme start leest oude members uit
  IndexedDB. Ze moeten wel nog steeds gedecodeerd worden.
- **Data-dieet (2026-08-31)**: de uurvelden staan sindsdien op 6 km (temperatuur, gevoel, wind), 8 km (straling) en
  16 km (bewolking). Regen blijft 1 km.
- **Meetsuite (U102 fase 1)**: `pnpm perf:modes`, zie `docs/perf.md` §Meetsuite per modus.

## 1. Wat de wachttijd nu veroorzaakt

Gemeten met `pnpm perf:modes --repeat 3` op 2026-11-09 11:35–12:13: de eigen build van `main` (e575c65, alleen de
suite erbij) met de prod-data van dat moment. Telefoon = de rig die op de PO-telefoon is gekalibreerd (renderer-quota
40 %), op 4G (9 Mbps, 60 ms RTT). Mediaan van 3 runs, tijden in s sinds navigatie. **De host was zwaar belast door
andere tracks** (loadavg bij de start van een bezoek 7,7–175, mediaan 15,5): de bytes zijn betrouwbaar, de tijden
zijn ruw en spreiden tot ×2 (telefoon koud Weer: histogram 7,3 / 11,3 / 19,3 s). Volledige samenvatting
(ook per bron en lange frames): `docs/perf/u102/nulmeting-2026-11-09.md`.

| profiel | modus | eerste kaart | histogram compleet | tabel compleet | vóór het histogram | laadfase |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| telefoon 4G koud | Weer | 3,5 s | 11,3 s | 11,2 s | 2.358 kB in 73 requests | 2.566 kB in 101 |
| telefoon 4G koud | Lucht | 6,7 s | 8,5 s | 7,5 s | 2.560 kB in 99 | 2.708 kB in 134 |
| telefoon 4G koud | Gevoel | 5,3 s | 8,7 s | 5,8 s | 2.537 kB in 80 | 2.741 kB in 105 |
| telefoon 4G koud | Wind | 5,7 s | 7,6 s | 7,0 s | 2.740 kB in 81 | 2.972 kB in 118 |
| telefoon 4G warm | Weer | 3,5 s | 11,0 s | 7,0 s | 0 kB | 0 kB |
| telefoon 4G warm | Lucht | 4,1 s | 8,2 s | 4,8 s | 0 kB | 0 kB |
| telefoon 4G warm | Gevoel | 3,0 s | 8,2 s | 3,7 s | 0 kB | 0 kB |
| telefoon 4G warm | Wind | 3,2 s | 7,5 s | 4,3 s | 0 kB | 0 kB |
| desktop koud | Weer | 1,7 s | 2,1 s | 2,2 s | 6.328 kB in 93 | 6.461 kB in 98 |
| desktop koud | Lucht | 1,6 s | 1,8 s | 2,1 s | 6.449 kB in 99 | 6.600 kB in 104 |
| desktop koud | Gevoel | 1,4 s | **32,1 s** | 1,8 s | 7.099 kB in 115 | 9.172 kB in 126 |
| desktop koud | Wind | 1,8 s | **32,7 s** | 2,4 s | 7.284 kB in 132 | 9.176 kB in 143 |
| desktop warm | Weer | 0,9 s | 1,2 s | 1,4 s | 0 kB | 0 kB |
| desktop warm | Gevoel | 1,0 s | 31,2 s (2 van 3) | 1,1 s | 0 kB | 0 kB |
| desktop warm | Wind | 0,8 s | 38,4 s (2 van 3) | 1,0 s | 0 kB | 0 kB |

"Eerste kaart" = kaart onthuld én de frames van de kaartlaag van de modus rond nu gedecodeerd. "Histogram compleet" =
alle frames die het histogram van die modus in het venster bij openen tekent, gedecodeerd. "Tabel compleet" = de
rijen in beeld tonen gevoel, temperatuur en wind. Desktop warm Lucht: 1,1 / 2,1 / 1,4 s.

Per bron, telefoon 4G koud Weer, in de laadfase: RTCOR 570 kB, nowcast 272 kB, seamless 224 kB, HARMONIE 778 kB
(59 requests), UV 40 kB, app 516 kB, basiskaart 104 kB, plaatsenlijst 62 kB.

Wat de wachttijd veroorzaakt:

1. **Op de telefoon is het werk het decoderen, niet het netwerk.** Een warme start draagt 0 B over en heeft het
   histogram toch pas na 7,5–11 s, nauwelijks sneller dan koud (7,6–11,3 s). Elke puntwaarde kost het decoderen van
   een heel raster: in Weer ruim honderd regenframes van 1.250 × 1.350 cellen.
2. **Koud gaat er 2,4–2,7 MB over de lijn vóór het histogram compleet is**, bijna allemaal rasters waarvan één cel
   wordt gelezen. Op 9 Mbps is dat alleen al 2,1–2,4 s.
3. **Op desktop missen Gevoel en Wind 30 s lang het verleden.** De uurvelden van de afgelopen uren (bij openen om
   12:10 de uren 09:00–11:00 lokale tijd, het linkerderde van de scrubber) vraagt een ruim apparaat pas aan in de
   30-s-idle-stap (L2); na 8 s begint de gevoelslijn pas bij "Nu", na 35 s loopt hij vanaf 10u. Op de telefoon
   (`in-view`) speelt dit niet. Dit is een los te verhelpen punt, ook zonder
   deze MIP.
4. **De DWD-data (ICON-D2) is niet de rem.** De directe straling voor de zon in Lucht is op de telefoon na 3,2 s
   binnen, HARMONIE pas na 12,1 s. Het histogram wacht op alles samen, niet op één bron als laatste.

## 2. Regiogrootte

**Opzet.** Het kader is het NL+Vlaanderen-kader van het 6 km-detailgrid (`DETAIL_GRID`, `docs/pollen.md`):
x 258–834 km, y 6.502–7.132 km in EPSG:3857, ongeveer 2,3–7,5° O en 50,3–53,8° N. Dat kader is opgedeeld in N
vierkante regio's. De fout is gemeten op de 6.997 plaatsen uit de plaatsenlijst van de app die in het kader liggen
(een plaats telt één keer, ongeacht inwoners): daar zoeken gebruikers. Elke plaats leest zijn eigen gridpunt (de cel
die de client nu leest) en vergelijkt dat met de reeks van zijn regio. Twee varianten van "de reeks van de regio":

- **midden**: de cel in het midden van de regio, per veld;
- **gemiddelde**: het gemiddelde over alle cellen van de regio, per veld en per tijdstap.

Daarnaast **alle gridpunten**: het bestand bevat de reeks van elke cel in de regio. De client leest dan precies zijn
eigen cel; de fout is 0.

**Bestand.** Per regio en per groep één bestand: een kop (per veld bron, run, celuitsnede en tijden als begin + stap +
aantal), daarna per veld per cel de u8-reeks in tijdvolgorde, zoals in mrf; het geheel als één zstd-member op niveau
19. De kwantisatietabellen staan niet in elk bestand maar per generatie in één vast bestand. Groepen naar
verversingsritme:

| groep | inhoud | ververst |
| --- | --- | --- |
| radar | regen van RTCOR (−3 u), nowcast (+2 u) en seamless (+2…+6 u), 5 min | elke 5 min |
| harmonie | regen per uur, temperatuur, gevoel, wind u/v, stoten, straling, bewolking en drie wolkenlagen, +48 u | elk uur |
| extra | UV, UV onbewolkt, ICON-D2 directe straling | eigen ritme (UV ±15 min, ICON-D2 3 u) |

ECMWF (de weekverwachting) zat in geen van beide snapshots: de ECMWF-job faalt sinds 2026-10-20 (fix e575c65 staat
op main, nog niet uitgerold). Zie §4.

**Data.** Twee echte snapshots, elk de volledige werkset van één moment (manifest plus alle chunks):

- **nat**: 2026-09-30 07:10 UTC, uit het dev-archief (`~/data/motregen-devdata/data`), regen in 9–11 % van de
  plaats-tijdstappen;
- **droog en zonnig**: 2026-11-09 10:15 UTC, live (`tools/fetch-data-snapshot.sh`), regen in 7 % (vooral de
  HARMONIE-regen van morgen). Alleen deze heeft ICON-D2.

Reproduceren: `cd web && pnpm exec tsx scripts/regio-knie.ts <snapshot>... --json uit.json`; de volledige uitvoer van
deze meting staat in `docs/perf/u102/regio-knie-2026-11-09.txt`.

### Bytes en bestanden (natte snapshot)

"Per locatie" is de som van de drie groepen die een locatie ophaalt. 4G-tijd = 60 ms RTT + bytes / 9 Mbps voor de
grootste van de drie parallelle requests, na het manifest; zonder TLS-opbouw (die verbinding staat al voor het
manifest).

| regio's | zijde | bestanden per groep per run | midden: per locatie | alle gridpunten: per locatie (gem. / som p95) | 4G-tijd alle gridpunten (gem. / p95) | per run, alle gridpunten (radar / harmonie / extra) | zstd-19 per run (radar / harmonie / extra) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 49 | 52,9 km | 38 | 1.065 B | 53.351 / 158.175 B | 97 / 159 ms | 432 / 1.565 / 31 kB | 3,2 / 2,1 / 0,2 s |
| 100 | 37,0 km | 71 | 1.065 B | 26.592 / 64.830 B | 79 / 96 ms | 347 / 1.501 / 40 kB | 2,9 / 2,0 / 0,2 s |
| **210** | **25,5 km** | **148** | 1.063 B | **13.457 / 29.913 B** | **70 / 76 ms** | 348 / 1.583 / 60 kB | 3,8 / 2,1 / 0,2 s |
| 399 | 18,5 km | 261 | 1.063 B | 7.933 / 15.062 B | 66 / 67 ms | 281 / 1.701 / 88 kB | 3,1 / 1,7 / 0,2 s |
| 810 | 13,0 km | 512 | 1.065 B | 4.491 / 7.926 B | 63 / 64 ms | 309 / 1.843 / 147 kB | 2,7 / 1,8 / 0,2 s |

De droge snapshot geeft hetzelfde beeld met minder radarbytes: bij 210 regio's 9.802 B per locatie (som p95
11.272 B), harmonie 1.323 kB per run.

Bestanden alleen voor regio's met minstens één plaats: zeeregio's krijgen geen bestand (bij 210 regio's 148 van de
210). Een locatie op zee of buiten het kader valt terug op het huidige pad.

### Fout per veld (natte snapshot, op 6.997 plaatsen; alle gridpunten: overal 0)

| regio's | variant | regen: droog/nat omgeslagen | regen: MAE als nat | gevoel MAE / p95 | temp. MAE | wind MAE / andere Bft-klasse | stoten MAE | zon MAE / p95 | bewolking MAE / p95 |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 49 | midden | 4,5 % | 0,71 mm/u | 0,77 / 2,4 °C | 0,69 °C | 0,33 Bft / 32 % | 0,42 Bft | 5,0 / 22 min/u | 6,7 / 44 % |
| 49 | gemiddelde | 4,9 % | 0,54 mm/u | 0,67 / 1,9 °C | 0,62 °C | 0,28 Bft / 28 % | 0,36 Bft | 4,6 / 18 min/u | 6,4 / 36 % |
| 100 | midden | 3,4 % | 0,67 mm/u | 0,67 / 2,1 °C | 0,60 °C | 0,29 Bft / 28 % | 0,37 Bft | 4,0 / 18 min/u | 5,6 / 38 % |
| 100 | gemiddelde | 3,8 % | 0,51 mm/u | 0,58 / 1,6 °C | 0,52 °C | 0,25 Bft / 25 % | 0,32 Bft | 3,8 / 16 min/u | 5,4 / 31 % |
| 210 | midden | 2,9 % | 0,56 mm/u | 0,58 / 1,8 °C | 0,53 °C | 0,25 Bft / 24 % | 0,32 Bft | 3,1 / 14 min/u | 4,4 / 30 % |
| 210 | gemiddelde | 2,9 % | 0,46 mm/u | 0,49 / 1,4 °C | 0,44 °C | 0,21 Bft / 21 % | 0,28 Bft | 2,9 / 12 min/u | 4,2 / 26 % |
| 399 | midden | 2,3 % | 0,47 mm/u | 0,47 / 1,5 °C | 0,42 °C | 0,21 Bft / 21 % | 0,27 Bft | 2,4 / 11 min/u | 3,5 / 24 % |
| 399 | gemiddelde | 2,4 % | 0,41 mm/u | 0,42 / 1,2 °C | 0,38 °C | 0,19 Bft / 19 % | 0,24 Bft | 2,3 / 10 min/u | 3,5 / 22 % |
| 810 | midden | 1,8 % | 0,38 mm/u | 0,38 / 1,2 °C | 0,34 °C | 0,17 Bft / 17 % | 0,21 Bft | 1,8 / 9 min/u | 2,5 / 17 % |
| 810 | gemiddelde | 1,8 % | 0,35 mm/u | 0,35 / 1,0 °C | 0,32 °C | 0,16 Bft / 16 % | 0,21 Bft | 1,8 / 8 min/u | 2,6 / 17 % |

- "Omgeslagen" = de tijdstappen waarin de regio droog zegt (< 0,1 mm/u) waar de plaats nat is, of andersom, als
  aandeel van alle plaats-tijdstappen (regen in 9–11 % ervan). "MAE als nat" telt alleen stappen waarin een van beide
  nat is.
- "Andere Bft-klasse" = de tabel toont een ander Beaufort-getal dan nu. Dat is hoog omdat een klassegrens al bij een
  klein verschil omslaat.
- Zon = minuten zon per uur met de app-formule (MIP-38/39), alleen daguren. Op de droge, zonnige dag met ICON-D2:
  2,3 / 14 min/u bij 210 regio's (midden).
- Droge snapshot, 210 regio's, midden: gevoel 0,75 / 2,4 °C, wind 0,30 Bft / 29 % andere klasse, regen 0,8 %
  omgeslagen: voor gevoel en wind slechter dan op de natte dag.

**De fout daalt traag met de regiogrootte.** Van 49 naar 810 regio's (16× zoveel bestanden) gaat gevoel van 0,77
naar 0,38 °C MAE en wind van 32 naar 17 % andere klasse. Zelfs de kleinste regio (13 km) is nog 3,5× zo groot als
het 6 km-raster (in EPSG:3857; ≈ 3,7 km echt).

## 3. De knie

| variant | per locatie | 4G-tijd na manifest | gevoel MAE | wind, andere klasse | regen omgeslagen |
| --- | ---: | ---: | ---: | ---: | ---: |
| nu (hele rasters), telefoon 4G koud | 2.358–2.740 kB | 7,6–11,3 s tot histogram (gemeten, incl. decoderen) | 0 | 0 | 0 |
| midden, 210 regio's | 1,1 kB | 61 ms | 0,58 °C | 24 % | 2,9 % |
| midden, 810 regio's | 1,1 kB | 61 ms | 0,38 °C | 17 % | 1,8 % |
| **alle gridpunten, 210 regio's** | **13,5 kB (p95 29,9 kB)** | **70 ms (p95 76 ms)** | **0** | **0** | **0** |
| alle gridpunten, 49 regio's | 53,4 kB (p95 158 kB) | 97 ms (p95 159 ms) | 0 | 0 | 0 |
| alle gridpunten, 810 regio's | 4,5 kB (p95 7,9 kB) | 63 ms (p95 64 ms) | 0 | 0 | 0 |

(Regiovarianten: natte snapshot; 4G-tijd = model van §2, zonder decodeertijd; die is voor 13 kB zstd geschat op enkele ms, niet
gemeten op de telefoon.)

**Er is geen afweging tussen bytes en fout:** alle varianten zitten binnen één RTT. De midden-variant bespaart
12 kB (≈ 10 ms op 4G) en kost daarvoor een halve graad en een kwart andere Beaufort-getallen. Binnen "alle
gridpunten" is de knie de regiogrootte: boven ~200 regio's is een bestand RTT-gedomineerd (70 → 63 ms bij 3,5× zoveel
bestanden); onder ~100 regio's wordt het natte radarbestand groot (p95 111 kB bij 49 regio's, 40 kB bij 100).

## 4. Bronnen, gebruik in de client, kosten in de ingest

**Bronnen.** Radar, nowcast en seamless (regen in het histogram); HARMONIE (regen per uur, alle tabelvelden,
wolkenlagen van Lucht); UV en UV onbewolkt; ICON-D2 directe straling (zon in Lucht). **ECMWF** (de weekverwachting)
als vierde groep, twee keer per dag: per punt 64 stappen × 8 velden plus 9 dagen × 9 velden = 593 B ongecomprimeerd;
het 0,25°-raster heeft binnen een regio van 25 km 1–4 punten. Geschat ≤ 2 kB per regio; niet gemeten, want er was
geen ECMWF-data (zie A2). Luchtkwaliteit en pollen (CAMS, 6 km) kunnen later op dezelfde manier.

**Client.**

1. Het manifest krijgt een sectie `regions`: het regioraster (kader, kolommen, rijen) en per groep de run en de
   bestandsnaam. De client rekent uit de locatie zijn regio uit; dat kost geen request.
2. Bij openen en bij elke locatiekeuze haalt hij de 3–4 regiobestanden tegelijk op, met hoge prioriteit, vóór de
   rasters. Histogram, tabel en dagenlijst lezen eerst daaruit. Een bestand is immutable (generatiesuffix zoals bij
   de chunks); een nieuwe run is een nieuwe naam.
3. De kaart haalt daarna zijn frames zoals nu. De puntleesfuncties op de rasters blijven als terugval: buiten het
   kader, op zee, of als een regiobestand ontbreekt.
4. Daarmee vervalt het grootste deel van de puntreeks-decodes (U49), op de telefoon het werk dat nu het histogram
   ophoudt. Het decode-budget van U49 en de wachtrij van U52 blijven voor de kaart.

**Ingest (2-vCPU-VM).** Bij 210 regio's, alle gridpunten, gemeten op ageq-dev2 met zstd 19 in één draad (node-zlib,
inclusief het uitknippen; natte snapshot):

| groep | ritme | bestanden per run | bytes per run | zstd-19 per run | per dag |
| --- | --- | ---: | ---: | ---: | ---: |
| radar | 5 min | 148 | 348 kB (droog 25 kB) | 3,8 s | 42.624 bestanden, ≈ 100 MB, ≈ 18 min CPU |
| harmonie | 1 u | 148 | 1.583 kB | 2,1 s | 3.552 bestanden, ≈ 38 MB, < 1 min CPU |
| extra | 15 min–3 u | 148 | 60 kB | 0,2 s | verwaarloosbaar |

- De rasters staan in de ingest al gedecodeerd in het geheugen; het werk is het uitknippen en zstd 19. Radar kost
  zo ≈ 1,3 % van één vCPU. Met zstd 9 in plaats van 19 is dat een fractie, bij iets meer bytes (niet gemeten).
- Het aantal bestanden is het echte kostenpunt: 42.624 radarbestanden per dag. Ze volgen dezelfde opruiming als de
  chunks.
- Bij 810 regio's: 512 bestanden per groep per run, ≈ 147.000 radarbestanden per dag, voor 7 ms winst op 4G.

## Aanbeveling

1. **Alle gridpunten, 210 regio's (zijde ≈ 25 km), drie groepen (radar, harmonie, extra), later ECMWF als vierde.**
   Fout 0 (de client leest zijn eigen cel), 13,5 kB per locatie op een natte dag (p95 30 kB), 70 ms op 4G na het
   manifest. Nu: 2,4–2,7 MB en 7,6–11,3 s tot het histogram op de telefoon, warm nog 7,5–11 s.
2. **Geen midden- of gemiddelde-variant.** Die bespaart ≈ 10 ms en kost een halve graad en een kwart andere
   Beaufort-getallen.
3. **Eerst meten, dan bouwen**: de bouw in twee tracks. Ingest (`crates/ingest`: regiobestanden en de
   manifestsectie, achter een vlag) en client (histogram, tabel en dagen eerst uit het regiobestand), elk met een
   meting via `pnpm perf:modes` naast deze nulmeting.

## Open vragen

A1. Akkoord met alle gridpunten en 210 regio's? Of 400 regio's (18,5 km; 8 kB per locatie, 66 ms op 4G, 261
bestanden per groep per run)?
A2. Moet de weekverwachting (ECMWF) in de eerste bouw mee, of pas als de ECMWF-job weer draait en we hem kunnen
meten?
A3. Zeeregio's krijgen geen bestand; een locatie op zee valt terug op het huidige pad. Goed, of wil je de
Noordzeekust en de Waddenzee met een rand meenemen?
A4. Los van deze MIP: op desktop laden Gevoel en Wind de afgelopen uren pas na 30 s (§1 punt 3; de scrubber na 8 s en
na 35 s: `docs/perf/u102/desktop-gevoel-08s-scrubber.png`, `…-35s-scrubber.png`). Wil je dat als kleine fix vóór de regiobestanden?
