# Directe straling uit ICON-D2

De zon in Lucht (MIP-38, MIP-39) rekent tot +48 uur op de directe straling van het DWD-model
[ICON-D2](https://www.dwd.de/opendata), daarna op de globale straling van HARMONIE. MIP-39 beschrijft
de keuze en de meting; deze pagina beschrijft de ingest en het dataformaat.

## Bron

`https://opendata.dwd.de/weather/nwp/icon-d2/grib/HH/aswdir_s/` bevat per run en per uur één bestand
`icon-d2_germany_regular-lat-lon_single-level_<YYYYMMDDHH>_<LLL>_2d_aswdir_s.grib2.bz2`: GRIB2, bzip2,
0,02° regulier (1215 × 746 punten, 43,18–58,08 N × −3,94–20,34 E, zuid naar noord). Het veld `ASWDIR_S`
is de directe kortgolvige straling op het horizontale vlak, **gemiddeld sinds de runstart** (W/m²).
Elk bestand bevat vier berichten: het hele uur (`stepRange` 0-L, `stepUnits` uren) en de drie kwartieren
erna (`0m-…m`, minuten). De job leest alleen het uurbericht. Buiten het modelgebied staan punten in de
bitmap als ontbrekend (`missingValue` 9999, een geheel getal); het publicatieraster valt er volledig binnen.

Runs om 00, 03, …, 21 UTC lopen tot +48 uur. Lead 48 staat er ongeveer 1 u 20 min na de runtijd
(waargenomen 18 oktober 2026: run 09 compleet om 10:20 UTC). `grib/HH/` wordt door de run van de volgende
dag overschreven, dus alleen de laatste 24 uur zijn online. `DURSUN` (zonneschijnduur) levert de DWD
voor ICON-D2 niet als open data.

Licentie: [CC BY 4.0](https://www.dwd.de/EN/service/legal_notice/legal_notice_node.html), met
bronvermelding volgens de [DWD-regels](https://www.dwd.de/EN/service/legal_notice/templates_dwd_as_source.html):
bij bewerkte data in een centrale bronnenlijst, met een vermelding van de bewerking. Dat staat in Over
("gebaseerd op data van de Deutscher Wetterdienst … uitgemiddeld per uur en omgerekend naar minuten zon")
en in de bronregel onder de tabel zodra het manifest ICON-D2 bevat.

## Job en timer

`motregen-icon-d2` (oneshot) kiest de nieuwste run waarvan lead 48 online is (HEAD-verzoeken, tot acht
runs terug). Is die run 4 uur of ouder, dan is de DWD laat: de job faalt en systemd probeert het na
15 minuten opnieuw. Staat dezelfde run al in `icon-d2.json`, dan stopt de job meteen. De timer draait om
**01:35, 04:35, …, 22:35 UTC** (`01/3:35`), met `Persistent=true`.

De job haalt lead 1…48 op (vier tegelijk, elk verzoek maximaal vier pogingen), bewaart de bestanden in
`<data>/.icon-d2-cache/<YYYYMMDDTHH>/` en hergebruikt ze bij een herstart. Na publicatie blijft alleen de
cache van de gepubliceerde run staan.

Gemeten op 18 oktober 2026 (run 09, devhost): **194 MB** download, **6,9 s** wall, 18,8 s CPU, 170 MB RSS;
de chunk is **140 kB**. Acht runs per dag zijn dus ≈ 1,6 GB download en ≈ 1,1 MB aan chunks.

## Verwerking

1. Uurbericht per lead decoderen; ontbrekende punten worden NaN.
2. Blokgemiddelde naar het stralingsraster van HARMONIE (`RADIATION_GRID`, 8 km, 157 × 169): per doelcel
   het gemiddelde van de bronpunten waarvan het middelpunt in de cel valt (≈ 8–10 punten). Een cel met een
   ontbrekend punt wordt NaN. Zo bemonsteren beide bronnen hetzelfde blok, zoals in de meting van MIP-38.
3. Van gemiddelde-sinds-start naar uurgemiddelde: `H(n) = n·A(n) − (n−1)·A(n−1)`, met `A(0) = 0`. De
   16-bitsverpakking geeft na ×48 hooguit een paar tienden W/m² ruis; negatieve waarden tot −5 W/m²
   worden 0, een grotere daling of een NaN laat de job falen (de vorige publicatie blijft dan staan).

## Publicatie

Eén chunk per run, veld `radiation_direct`, bron `icon_d2`, 48 frames met als tijd het einde van het uur
(run + 1 u … run + 48 u), kwantisatie als `radiation` (0…1270 W/m² in stappen van 5). De sidecar
`icon-d2.json` bevat `run`, `license` en de chunk. De ingest-daemon neemt hem op in het manifest als
`MOTREGEN_ICON_D2_IN_MANIFEST` aan staat (NixOS: `services.motregen.iconD2InManifest`, standaard aan) en
de run hoogstens 12 uur oud is; anders valt de chunk uit het manifest en rekent de client met HARMONIE.
Er is geen eigen manifestsectie.

## Client

`web/src/core/sunshine.ts`: per uur het aandeel van de mogelijke zon, S1 op de HARMONIE-globale straling
(MIP-38) en D1 op de ICON-D2-directe straling (MIP-39). Binnen de ICON-D2-run telt D1; aan beide randen
loopt het gewicht over drie uur naar HARMONIE (¼, ½, ¾, 1), zodat de curve niet springt. Waar een van beide
bronnen het uur niet heeft, telt de andere. De ICON-D2-frames laden pas bij de eerste Luchtfocus, en alleen
de uren met de zon op.
