# MIP-39 — Zonneschijnduur uit ICON-D2

Status: draft · auteur: worker U99 (opus-5.5) voor de PM · meting 2026-10-18 · PO-opdracht 2026-10-18: "39 akkoord"

## Het probleem

De zon in Lucht (MIP-38) rekent de minuten zon per uur uit de globale straling van HARMONIE (S1). Die zit gemiddeld
10,4 min/u naast de KNMI-meting. In U95c bleek dezelfde S1 op de straling van het Duitse model ICON-D2 in Nederland
8,7 min/u te halen, het niveau van MeteoSwiss in Zwitserland. Die meting gold alleen voor de korte termijn
(+0…+3 u). Deze MIP meet ook een dag vooruit, kiest het veld en beschrijft de bron in de app.

## De bron: ICON-D2 op opendata.dwd.de (gecontroleerd op 18 oktober)

1. **Velden.** De DWD publiceert voor ICON-D2 per run en per uur een GRIB2-bestand per veld, met bzip2 ingepakt, ook op
   een regulier rooster van 0,02° (1215 × 746 punten, 43,18–58,08 N × −3,94–20,34 E). Voor zon zijn er twee:
   - `aswdir_s`: directe straling op het horizontale vlak;
   - `aswdifd_s`: diffuse straling.

   Samen zijn ze de globale straling. Beide zijn een **gemiddelde sinds de runstart**, in W/m². Elk bestand bevat het
   hele uur en ook de drie kwartieren erna.
2. **Geen `DURSUN`.** De zonneschijnduur die ICON-CH bij MeteoSwiss zelf uitrekent, levert de DWD voor ICON-D2 niet
   als open data. De directe straling wel. Dat is het "native" veld dat we hier meten.
3. **Runs.** Om 00, 03, …, 21 UTC, elk tot +48 u. Lead 48 staat er ongeveer 1 u 20 min na de runtijd (run 09 was
   compleet om 10:20 UTC). Alleen de laatste 24 uur staan online, dus er is geen archief.
4. **Bestandsgrootte.** Per veld en uur ±4 MB. Voor het NL-kader moet het hele bestand komen: een bzip2-bestand kan
   niet met een Range worden uitgesneden.
5. **Licentie.** CC BY 4.0 met bronvermelding volgens de
   [DWD-regels](https://www.dwd.de/EN/service/legal_notice/templates_dwd_as_source.html). Bij bewerkte data vraagt de
   DWD "ten minste een vermelding in een centrale bronnenlijst of het colofon", met een zin over de bewerking
   (voorbeeld: "Based on data from Deutscher Wetterdienst, averaged over individual values").

## Meting

**Waarheid en opzet** zijn die van MIP-38: KNMI-SQ per uur op 32 stations, alleen uren met de zon boven de horizon,
zon mogelijk boven 4,2°. Vrije parameters fit ik op de even dagen en meet ik op de oneven dagen.

**ICON-D2-archief.** Het archief komt van de Open-Meteo previous-runs-API, van 9 januari t/m 15 oktober 2026,
per station de dichtstbijzijnde 2 km-cel:
- *kort*: de eerste uren van elke run, dus lead ≈ +0…+3;
- *dag1*: dezelfde uren uit de run van een dag eerder, dus lead ≈ +24…+27.

Een andere lead heeft Open-Meteo voor ICON-D2 niet. In een steekproef (De Bilt, 1 juni) middelen de vier
kwartieren exact tot het uurgemiddelde.

**HARMONIE op dezelfde lead.** Uit het KNMI-archief komen 558 HARMONIE-runs (alle 3-uursruns, om de 4 dagen; 2
ontbreken in het archief) met leads +24…+26. De bestaande korte set (+1…+3) uit U95 komt erbij. Zo vergelijk ik beide modellen op dezelfde
stationsuren en ongeveer dezelfde lead.

**Schatters op ICON-D2.**
- **S1**: de bestaande overgang op de globale straling, met de HARMONIE-parameters (0,28–0,92), en opnieuw gefit.
- **D1**: dezelfde overgang op de directe straling, `minuten = 60 · mogelijk · clip((B/B_c − b_laag)/(b_hoog − b_laag), 0, 1)`.
  Hier is `B` de uurgemiddelde directe straling en `B_c` die bij heldere hemel (Haurwitz + Erbs, zoals de
  S2-schatter in MIP-38).
- **Q1/Q2**: S1 en D1 per kwartier, opgeteld over de vier kwartieren. Dat komt het dichtst bij wat ICON-CH thuis doet.
- **Open-Meteo**: hun eigen omrekening, een drempel op de DNI van het uurgemiddelde.

### Resultaat (testset, min/u; dagsom in uren)

| schatter op ICON-D2 | kort: MAE / bias | dag1: MAE / bias |
| --- | ---: | ---: |
| S1, HARMONIE-parameters | 8,8 / +0,1 | 10,9 / +1,4 |
| S1, opnieuw gefit | 8,3 / +0,5 | 10,6 / +0,7 |
| **D1 directe straling** (één paar grenzen voor beide leads: 0,02–0,66) | **8,2 / −0,4** | **10,4 / +0,9** |
| Q1/Q2 per kwartier | 8,2 | 10,4 |
| Open-Meteo `icon_d2` | 10,8 / +5,8 | 12,9 / +7,1 |
| klimatologie (B1) | 19,8 | 19,8 |

- **Direct wint, maar weinig.** D1 is 0,5–0,6 min/u beter dan S1 met de HARMONIE-parameters. Tegen S1 die opnieuw
  op ICON-D2 is gefit, is het verschil nog 0,1–0,2 min/u.
- **Per kwartier rekenen helpt nauwelijks:** het wint hooguit 0,1 min/u.
- **De lead telt het zwaarst:** van 8,2 op korte termijn naar 10,4 een dag vooruit.

### Gelijke lead: HARMONIE naast ICON-D2 (dezelfde stationsuren)

| | korte termijn (34.454 uren) | een dag vooruit (34.327 uren) |
| --- | ---: | ---: |
| S1 op HARMONIE (nu in de app) | 10,2 / +1,9 | 10,7 / +1,4 |
| S1 op ICON-D2-globaal | 8,5 / +0,4 | 10,8 / +0,2 |
| **D1 op ICON-D2-direct** | **7,9 / −0,2** | **10,5 / −0,2** |
| MAE dagsom (u): HARMONIE → D1 | 1,37 → 1,04 | 1,51 → 1,51 |

- **Korte termijn.** ICON-D2 is hier duidelijk beter: 2,3 min/u (vaardigheid +0,49 → +0,61). Dat geldt in elk seizoen;
  in de winter is het 8,5 → 6,6 en in de zomer 11,3 → 8,7 min/u.
- **Een dag vooruit.** De twee modellen zijn gelijk: 10,5 tegen 10,7 min/u. In de winter en de lente wint ICON-D2
  (9,5 en 9,8 tegen 11,0 en 10,7). In de herfst wint HARMONIE (10,3 tegen 11,8): daar schat D1 de zon 4,9 min/u te laag.
- **HARMONIE verliest bijna niets met de lead** (10,2 → 10,7), ICON-D2 wel (7,9 → 10,5). Leads na +27 kan ik niet
  meten: van ICON-D2 bestaat geen archief.

**Conclusie.** ICON-D2 is op de korte termijn veel beter en een dag vooruit even goed. Nergens is het gemeten slechter
over het jaar. De directe straling is het beste veld, en ook het goedkoopste (zie hieronder).

## Voorstel

### A. Bron en veld

1. **Alleen `aswdir_s` ophalen en D1 rekenen.** D1 is op beide leads minstens zo goed als S1, en dit kost de helft
   van de download. Voor S1 op de globale straling moet ook `aswdifd_s` mee.
2. **Elke run (8 per dag).** De lead telt het zwaarst. Elke drie uur verversen houdt de korte termijn, waar ICON-D2
   wint, zo kort mogelijk.

### B. Ingest (gebouwd in U99)

1. Een oneshot **`motregen-icon-d2`**, in hetzelfde patroon als `motregen-ecmwf`. Een timer om **01:35, 04:35, …,
   22:35 UTC**. Is de nieuwste complete run 4 uur of ouder, dan faalt de job en probeert systemd het na 15 minuten
   opnieuw. Een run die al gepubliceerd is, slaat de job over.
2. Lead 1…48 ophalen, het uurbericht decoderen en het blokgemiddelde nemen op het 8 km-stralingsraster van HARMONIE.
   Daarna `H(n) = n·A(n) − (n−1)·A(n−1)`.
3. **Eén chunk per run**: veld `radiation_direct`, bron `icon_d2`, 48 frames. De ingest-daemon neemt de sidecar
   `icon-d2.json` op in het manifest, met inhoudshashes en generatiesuffix zoals de andere bronnen.
4. **Robuust.** Bij een fout of een gat blijft de vorige publicatie staan. Is die run ouder dan 12 uur, dan valt
   ICON-D2 uit het manifest en rekent de app weer met HARMONIE.
5. **Kosten per run** (gemeten 18 oktober, run 09, devhost):

   | | |
   | --- | ---: |
   | download | 194 MB |
   | doorlooptijd | 6,9 s |
   | CPU | 18,8 s |
   | geheugen | 170 MB |
   | chunk | 140 kB |
   | cache op schijf | ±194 MB (één run) |

   Per dag is dat **≈ 1,6 GB download**. Ter vergelijking: ECMWF is ±1 GB per dag, AROME ±5,6 GB per dag.
6. Docs: `docs/icon-d2.md`. NixOS: `services.motregen.iconD2InManifest`, standaard aan.

### C. Client

1. **Waar ICON-D2 telt.** Waar de ICON-D2-run het uur dekt (+1…+48 u vanaf zijn runtijd), rekent de zoncurve in
   Lucht met D1 op de ICON-D2-straling. Daarbuiten rekent hij met S1 op HARMONIE.
2. **Naadloze overgang.** Aan beide randen van de run schuift het aandeel van ICON-D2 over drie uur naar HARMONIE:
   ¼, ½, ¾ en dan 1. Dat gebeurt rond het eerste uur, dat meestal al voorbij is, en rond +48 u.
3. **Laden.** De ICON-D2-frames laden pas bij de eerste Luchtfocus, zoals de luchtdruk pas bij wind. Alleen de uren
   met de zon op komen binnen: in oktober ≈ 27 frames, samen ≈ 140 kB, in de zomer meer.
4. **Tabel en bot** blijven bij HARMONIE (buiten deze track).

### D. Vermelding

- **Over:** "Zon in Lucht: gebaseerd op data van de Deutscher Wetterdienst (ICON-D2, CC BY 4.0), door motregen.nl
  uitgemiddeld per uur en omgerekend naar minuten zon. Bron: Deutscher Wetterdienst."
- **Bronregel onder de tabel:** "…, de zon in Lucht op data van de Deutscher Wetterdienst". Die verschijnt alleen
  als het manifest ICON-D2 bevat.
- **Versheidspaneel:** een rij voor ICON-D2.

## Open vragen voor de PO

1. **Verder dan een dag.** Na +27 u is niets gemeten. In de herfst is HARMONIE een dag vooruit beter (10,3 tegen
   11,8 min/u). Kies uit: (a) ICON-D2 tot +48 u, zoals nu gebouwd, of (b) vanaf +24 u geleidelijk naar HARMONIE.
   Voorstel: (a). Over het jaar zijn ze een dag vooruit gelijk, en (b) vraagt een tweede overgang op een plek waar
   we niets meten.
2. **Eigen archief?** De DWD bewaart maar 24 uur. Om +27…+48 u ooit te meten, moeten we zelf per run de
   stationswaarden bewaren. Dat is klein: ±32 stations × 48 uur per run. Voorstel: ja, als kleine uitbreiding van
   de job, met een eigen MIP-regel.
3. **Download.** 1,6 GB per dag voor 8 runs, of 0,8 GB voor 4 runs. Voorstel: 8 runs. De korte termijn is waar
   ICON-D2 2,3 min/u wint.
4. **Kosten in de client.** ≈ 140 kB per sessie die Lucht opent. Als dat te veel is, kan het raster kleiner (alleen
   NL en BE) of de kwantisatie grover. Dat is een eigen meting. Voorstel: eerst zo uitrollen en het in het dagrapport
   bekijken.
5. **Tabel en bot** ook op ICON-D2, in een volgende track?

## Reproduceren

```sh
tools/zonneschijn/run.sh   # vanuit een checkout; KNMI_OPEN_DATA_API_KEY in de omgeving of .env
```

Nieuw in het script:
- `fetch_icon_d2.py`: ICON-D2 per uur en per kwartier, beide leads;
- `fetch_harmonie.py … --leads 23-27 --out harmonie-dag1`: ±1,5 uur ophalen;
- `evaluate_icon_d2.py`: schrijft `tools/zonneschijn/results-icon-d2.md`.

De cijfers hierboven komen uit die bestanden; elke stap gaf `EXIT: 0`. De ingestkosten komen uit
`motregen-icon-d2 --run 2026-10-18T09:00:00Z` op een lege datamap, gemeten met `/usr/bin/time -v`.

## Changelog

- 2026-10-18 — concept (U99): meting op twee leads, ingest, client en Nix gebouwd.
