# MIP-36 — Tien dagen vooruit met ECMWF open data

Status: accepted (PO 2026-10-17) · auteur: Claude (orkestrator), 2026-10-17 · PO-opdracht: "bouw maar met die open eu bron dan"

## 1. Het probleem

motregen houdt op na +48 u, want HARMONIE (P1) reikt niet verder. Voor "wordt het een droog weekend?"
moeten mensen nu naar een andere app. KNMI heeft geen open middellange-termijnverwachting. Google WeatherNext
mag niet live in een openbare app (zie de toelichting van 17 oktober over de Experimental Data Terms).

## 2. De bron: ECMWF open data (gecontroleerd op 17 oktober)

1. **IFS HRES** (`ifs/0p25/oper`), 0,25° (≈ 17 × 28 km bij ons). Runs 00 en 12 UTC lopen tot +360 u:
   elke 3 u tot +144 u, daarna elke 6 u. Elke parameter per stap is een los GRIB2-bericht, op te halen met
   een HTTP-range uit de `.index`. Bruikbaar: `tp`, `2t`, `mx2t3`/`mn2t3` (vanaf +150 u `mx2t6`/`mn2t6`),
   `10u`, `10v`, `10fg3`/`10fg`, `tcc`, `ssrd`, `ptype`.
2. **ENS-kansen** (`ifs/0p25/enfo`, bestand `…-240h-enfo-ep`): kans op neerslag boven 1/5/10/20/25/50/100 mm
   per 24 u-venster (`tpg1`, `tpg5`, …). De vensters beginnen elke 12 u (`0-24`, `12-36`, …) tot +240 u.
   Er is ook een `-360h`-bestand. Daarnaast is er windstoot-kans (`10fgg15`, `10fgg25`). Een kans per
   dag, berekend uit 51 leden, zonder dat wij 50 leden hoeven op te halen (dat zou ±3 GB per run zijn).
3. **Beschikbaarheid**: run 00 UTC staat er om 07:34 UTC, de ENS-kansen om 08:01 UTC; run 12 UTC om
   19:34 en 20:01 UTC. ECMWF houdt maar een paar dagen aan runs online.
4. **Formaat**: GRIB2 met CCSDS-compressie. De `grib_ls` uit onze devenv (ecCodes) decodeert hem. Een
   veld per stap is wereldwijd 0,6–1,3 MB; van Nederland gebruiken we ±20 × 14 cellen.
5. **Volume**: ±8 parameters × 65 stappen × ±0,9 MB ≈ 450 MB per run, plus ±30 MB aan kansberichten.
   Twee runs per dag is ±1 GB per dag. Ter vergelijking: AROME is nu ±5,6 GB per dag.
6. **Licentie**: CC BY 4.0, ook voor commercieel gebruik. Wel naamsvermelding en vermelden dat we de data
   bewerkt hebben.

## 3. Voorstel

### A. Wat de gebruiker ziet

1. **Aanbevolen: een lijst "Komende dagen" onder de urentabel**, één regel per dag tot en met dag 10:
   - weekdag;
   - icoon;
   - max/min °C;
   - neerslag in mm met regenkans in %;
   - wind in Bft met windrichting.

   Dit is het vertrouwde patroon van de Buienradar- en KNMI-apps. Een cel van 25 km is grof, maar voor een
   daggemiddelde is dat eerlijk.
2. Niet nu: de tijdlijn, het histogram en de kaart doortrekken tot 10 dagen. Een 25 km-veld oogt op de kaart
   als blokken, het histogram wordt een kam, en de vloeiende overgang van radar naar nowcast naar HARMONIE
   verliest zijn betekenis.

### B. Welke bron per dag

1. **Aanbevolen**: vandaag en morgen uit HARMONIE (de urenvelden die we al hebben), vanaf overmorgen uit
   ECMWF. Zo spreken de dagregel van morgen en de urentabel elkaar niet tegen. Een kleine sprong tussen dag 2 en
   dag 3 is acceptabel; het zijn ook verschillende dagen.
2. Alternatief: alle dagen uit ECMWF. Dat is consistenter binnen de lijst, maar dan wijkt morgen af van de
   urentabel erboven.

### C. Server

1. Een nieuwe oneshot `motregen-ecmwf`, in hetzelfde patroon als `motregen-cams`. Een timer om 08:15 en
   20:15 UTC met herhaalpogingen. De job schrijft MRF-chunks en `ecmwf.json`; de ingest-daemon neemt die op
   in het manifest.
2. De dagwaarden worden op de server berekend, per lokale kalenderdag (Europe/Amsterdam). Velden met
   10 frames (één per dag) op het 0,25°-rooster boven Nederland:

   | veld | berekening |
   | --- | --- |
   | `day_tmax_c` | max van `mx2t3`/`mx2t6` |
   | `day_tmin_c` | min van `mn2t3`/`mn2t6` |
   | `day_precip_mm` | som van `tp` |
   | `day_precip_prob` | `tpg1`, het 24 u-venster dat het best op de lokale dag valt |
   | `day_wind_ms` | max van de gemiddelde wind tussen 06 en 21 u |
   | `day_wind_dir` | windrichting bij die max |
   | `day_gust_ms` | max van `10fg3`/`10fg` |
   | `day_cloud` | gemiddelde `tcc` tussen 08 en 18 u |

   De client leest het punt van de gekozen locatie, zoals hij nu ook pollen leest.

   Een venster van 00–24 UTC valt in de zomer twee uur naast de lokale dag. Dat is acceptabel voor een
   dagkans. Een exacte lokale dag zou de 50 leden vergen.
3. Zonuren laat ik nu weg. ECMWF heeft geen zonneschijnduur in de open data; we zouden ze uit `ssrd`
   moeten schatten. Dat hoort bij het kalibratiewerk aan de zonneminuten dat nog open ligt.

### D. Vermelding

De bronregel wordt "Bron: KNMI · ECMWF · © OpenStreetMap". In Over komt: "Verwachting na 2 dagen: ECMWF IFS
open data (CC BY 4.0), door motregen omgerekend naar dagwaarden."

## 4. Werkplan

1. **U90 ingest**, worker: de `motregen-ecmwf`-job, de chunks, `ecmwf.json`, de Nix-dienst met timer en
   docs in `docs/ecmwf.md`. Gate: unit-tests op de dagaggregatie (zomertijd, winterwissel, stap 144 → 150) en
   de NixOS-VM-test.
2. **U91 dagenlijst**, orkestrator: de UI op preview 4300 met echte data. Daarna beoordeelt de PO.
3. Een changelog-item ("nieuw": tien dagen vooruit). Uitrol alleen na "rol uit".

## 5. Later, niet nu

1. Een temperatuurpluim uit de ENS-leden: spreiding laten zien in plaats van één lijn.
2. De kaart en tijdlijn na +48 u, met AIFS of HRES.
3. Zonuren uit `ssrd`, gekalibreerd op KNMI-waarnemingen.
4. WeatherNext, alleen na schriftelijke toestemming.

## Besluit

PO, 17 oktober 2026, aangenomen met een andere weergave dan A1:

1. **Bron en server (C) zoals voorgesteld**, met één aanvulling (U90b): ECMWF wordt behalve als dagwaarden ook per
   tijdstap gepubliceerd (`step_*` plus `ecmwf.steps`, 3-uurlijks tot +144 u, daarna 6-uurlijks), zodat de client
   willekeurige vensters kan aggregeren.
2. **Weergave: geen aparte lijst, maar een glijdende urentabel** (PO: "die tabel naadloos laten overgaan in de
   langetermijnvoorspelling … progressief meer uren aggregeren … tot je alleen dag+nacht overhoudt"). Eerst uren, dan
   blokken van 3 uur, dan dagdelen, dan dag (06–18) en nacht (18–06) tot dag 10. De urentabel wordt daardoor korter.
   De lijst "Komende dagen" (A1) blijft tot 2026-11-01 als `?dev`-optie.
3. **Bron per rij (B1)**: HARMONIE als die het venster volledig dekt, anders ECMWF. Regenkans alleen op dagrijen.
4. **Vorm**:
   - de dag staat in de rij, zonder losse dagkoppen;
   - bij een nachtrij staat de laagste temperatuur groot, bij een dagrij de hoogste;
   - neerslag wordt gedempt bij minder dan 30 % kans;
   - geen gloed per rij. In de hele tabel staat precies één pseudo-rij "Zon op" en één "Zon onder": de eerstvolgende
     (PO: "in de hele tabel precies een pseudorij op en een ondergang"). Dag en Nacht zijn vaste vensters (06–18, 18–06);
   - het dag/nacht-contrast is zachter, met een smalle en een brede variant ter keuze achter `?dev`.
5. ECMWF komt in het versheidspaneel.
6. **Uitrol** (de vlag `ecmwfInManifest` op prod en twee downloads per dag) bespreken we later apart.
