# MIP-38 — Zonneschijnduur per uur

Status: draft · auteur: worker U95 (opus-5.5) voor de PM · meting 2026-10-18

## Het probleem

De PO wil per uur en per plek weten **hoeveel minuten zon** er komen (0–60). Die waarde moet uit de HARMONIE-AROME-velden komen die motregen al binnenhaalt, en hij moet tegen echte waarnemingen gemeten zijn.

HARMONIE P1 levert geen zonneschijnduur en geen directe straling. In alle 49 GRIB-berichten van een lead (run 2026082812, +3) staan maar twee stralingsvelden. Dat zijn globale straling (253/117) en netto kortgolvige straling (253/111), allebei geaccumuleerd. Netto kortgolvig is globaal × (1 − albedo) en voegt dus niets toe. Zonneschijnduur moet daarom geschat worden.

## Eerder werk

- **Definitie.** WMO rekent een minuut als zon wanneer de directe normaalstraling (DNI) boven 120 W/m² ligt. KNMI meet zonneschijnduur niet rechtstreeks. Het **berekent** SQ uit de globale straling per 10 minuten. In de uurgegevens is SQ beschreven als "berekend uit globale straling", in 0,1 uur per uurvak. Dat label is de waarheid in deze meting. Bron: [KNMI uurgegevens](https://www.daggegevens.knmi.nl/klimatologie/uurgegevens), zonder sleutel. 32 stations hebben SQ.
- **Bouwstenen in de app.** De UV-schatting (docs/fields.md) gebruikt al de heldere-hemelstraling volgens Haurwitz, `G_c(μ) = 1098·μ·exp(−0,057/μ)`, als uurgemiddelde, en de lichtfactor `k = G/G_c`. In de frontend is dat `cloudModification` in `web/src/core/uv.ts`. `layerTransmission` in `cloud-section.ts` schat licht uit lage, middelbare en hoge bewolking (MIP-18, MIP-34).
- **Archief.** De Open Data API heeft `harmonie_arome_cy43_p1` uurlijks vanaf run 2026010722, dus ruim negen maanden. Met HTTP Range haalt het meetscript per lead alleen de vijf benodigde GRIB-berichten op: ongeveer 1,5 MB in plaats van 14 MB.

## Meting

**Dataset.**
- 140 HARMONIE-runs van 00 UTC, om de dag, van 9 januari tot en met 14 oktober 2026. Leads +4…+21, dus uurvakken 04–21 UTC. Dat is het gebruik "vandaag".
- 424 korte runs (03/06/09/12/15/18 UTC, om de 4 dagen, leads +1…+3). Twee runs ontbreken in het archief.
- 32 KNMI-stations, alleen uren waarin de zon boven de horizon komt.
- Straling is gemiddeld over ≈ 8 km rond het station, bewolking over ≈ 16 km. Dat lijkt op de app-velden. De dichtstbijzijnde 2 km-cel geeft hetzelfde resultaat (MAE 10,5 tegen 10,4).
- Vrije parameters zijn gefit op de helft van de rundagen (afwisselend) en gemeten op de andere helft: 32.094 stationsuren.

**Gemeenschappelijk voor alle schatters: "zon mogelijk".** Dat is het deel van het uur waarin de zon hoger staat dan 4,2°. Die grens is gefit op heldere randuren in 2025, alleen uit waarnemingen. Een heldere DNI > 120 W/m² volgens Haurwitz+Erbs zou 5,2° geven. Dan tellen we op die randuren 6 minuten per uur te weinig, omdat KNMI eerder zon telt.

**Schatters.**
- **S1 k-overgang:** `minuten = 60 · mogelijk · clip((k − 0,28)/(0,92 − 0,28), 0, 1)` met `k = G/G_c`.
- **S2 DNI-verhouding:** Erbs-decompositie van het uurgemiddelde naar DNI, gedeeld door de heldere DNI. Heeft geen vrije parameter.
- **S2b:** alles-of-niets als de uurgemiddelde DNI boven 120 W/m² ligt. Zo doet Open-Meteo het.
- **S3:** 1 − totale bewolking.
- **S4 wolkenlagen:** `((1−L)(1−M)(1−0,15·H))^0,65`.
- **S5:** 0,62·S1 + 0,38·S4.

**Baselines.**
- **B1 klimatologie:** gemiddelde SQ per station, maand en uur, 2016–2025.
- **B2 k-drempel:** 60 minuten zon als k > 0,64, anders 0.

### Resultaat (testset, min/u; dagsom in uren)

| schatter | MAE | bias | vaardigheid t.o.v. B1 | MAE dagsom | bias dagsom |
| --- | ---: | ---: | ---: | ---: | ---: |
| **S1 k-overgang** | **10,4** | **+0,8** | **+0,47** | **1,36** | **+0,19** |
| S2 DNI-verhouding (Erbs) | 11,9 | −7,1 | +0,40 | 2,09 | −1,70 |
| S2b DNI > 120 op uurgemiddelde | 12,0 | −0,2 | +0,39 | 1,56 | −0,05 |
| S3 1 − totale bewolking | 13,0 | −9,7 | +0,34 | 2,51 | −2,32 |
| S4 wolkenlagen | 10,9 | +1,2 | +0,45 | 1,58 | +0,29 |
| S5 S1+S4 | 10,3 | +1,0 | +0,48 | 1,40 | +0,23 |
| B1 klimatologie | 19,7 | +0,7 | 0 | 3,43 | +0,16 |
| B2 k-drempel | 11,8 | −0,4 | +0,40 | 1,63 | −0,09 |

Per seizoen ligt de MAE van S1 tussen 9,6 en 10,9 min/u. De bias is in de winter +4,1 en in de herfst −1,5. Per zonshoogte is de MAE 7,0 onder 10° en 10–12,5 daarboven. Per lead is hij 9,7 (+4…+9), 11,3 (+10…+15, de middaguren) en 9,7 (+16…+21). De korte leads +1…+3 zijn niet beter (10,5).

**Plafond.** Op de gemeten stationsstraling Q geeft S1 een MAE van 5,4 min/u. Die fout zit in de omrekening van een uurgemiddelde naar minuten; de rest komt van de HARMONIE-verwachting van straling en bewolking. De parameters zijn op HARMONIE gefit, dus op Q kan het iets beter. Een slimmere omrekening wint dus hooguit een deel van die 5,4 min/u.

### Extern: Open-Meteo

Gemeten op dezelfde stations en uren, via de gratis `historical-forecast`-API. Hun archief is een korte-termijnreeks, dus Open-Meteo heeft bij de 00 UTC-runs een voordeel in lead.

| model | korte runs (+1…+3): MAE / bias | 00 UTC-runs (+4…+21): MAE / bias |
| --- | ---: | ---: |
| **S1 op HARMONIE (motregen)** | **10,5 / +1,8** | **10,4 / +0,7** |
| Open-Meteo `icon_d2` | 10,7 / +5,9 | 10,7 / +5,3 |
| Open-Meteo `knmi_seamless` (HARMONIE) | 12,8 / +6,2 | 12,7 / +6,3 |
| Open-Meteo `ecmwf_ifs025` | 15,0 / +13,2 | 15,9 / +14,1 |

Open-Meteo zet per uur bijna altijd 0 of 60 minuten: een drempel op de uurgemiddelde DNI. Daardoor overschat het systematisch, met +5 tot +14 min/u en een dagsom +1,3 tot +3,4 u te hoog. Op hetzelfde HARMONIE-model (`knmi_seamless`) is S1 2,3 min/u beter. ICON-D2 is in de winter beter dan S1 (7,6 tegen 9,2), in de lente gelijk en in zomer en herfst slechter door zijn bias. **Google Weather API** is overgeslagen: die vraagt een Cloud-project met betaalaccount.

### Vergelijking met de Zwitserse app

De PO bedoelt vermoedelijk de **MeteoSwiss-app**. Die heeft een sectie "Sunshine Duration" met minuten zon per uur; in de app-API is dat het veld `sunshine1h`. Welk model de app voor Nederland gebruikt, is **niet zeker**:

- De eigen modellen van MeteoSwiss, ICON-CH1 en ICON-CH2, dekken Nederland niet. Open-Meteo geeft voor De Bilt "No data is available for this location".
- De app-API werkt met Zwitserse postcodes (`app-prod-ws.meteoswiss-app.ch/v2/plzDetail?plz=800100`). Met coördinaten in Nederland komt een lege grafiek terug. De storeteksten noemen alleen "alle Orte/PLZ in der Schweiz". Nederlandse plaatsen heb ik in de app dus niet kunnen vinden.
- Toont de app Nederland toch, dan komt dat uit een Europees of globaal model. Volgens een apptest van de Tages-Anzeiger rekent MeteoSwiss zijn lokale verwachtingen mede op basis van ECMWF; dat maakt IFS de waarschijnlijkste. ICON-EU en ICON global zijn de andere kandidaten. We meten daarom alle vier.

Hoe MeteoSwiss uit een model minuten zon maakt, is niet openbaar. De tabel geeft daarom per model twee varianten: de zonneschijnduur zoals Open-Meteo die afleidt (een drempel op de directe straling), en S1 op de uurstraling van datzelfde model, met dezelfde parameters als op HARMONIE. De app zit vermoedelijk ergens tussen die twee.

00 UTC-runs, leads +4…+21, 64.732 stationsuren. Open-Meteo heeft hier een kortere lead (zie hierboven).

| model | Open-Meteo-omrekening: MAE / bias (min/u) | dagsom MAE / bias (u) | S1 op straling van het model: MAE / bias (min/u) | dagsom MAE / bias (u) |
| --- | ---: | ---: | ---: | ---: |
| **HARMONIE (motregen, S1)** | — | — | **10,4 / +0,7** | **1,35 / +0,16** |
| ECMWF IFS 9 km (`ecmwf_ifs`) | 15,5 / +13,4 | 3,30 / +3,23 | 11,6 / +7,6 | 1,99 / +1,82 |
| ECMWF IFS 0,25° (`ecmwf_ifs025`) | 15,9 / +14,1 | 3,45 / +3,39 | 11,6 / +8,0 | 2,06 / +1,92 |
| ICON-EU (`icon_eu`) | 12,4 / +6,7 | 2,08 / +1,62 | 9,8 / +0,5 | 1,14 / +0,11 |
| ICON global (`icon_global`) | 12,9 / +7,7 | 2,23 / +1,86 | 10,1 / +1,0 | 1,20 / +0,25 |
| klimatologie (B1) | 19,9 / −1,2 | 3,55 / −0,29 | | |

Op de korte runs (+1…+3, dus gelijke lead) is het beeld hetzelfde: S1 op HARMONIE 10,5, S1 op ICON-EU 9,8, Open-Meteo `ecmwf_ifs` 14,9 min/u.

**Conclusie.** Gebruikt de app voor Nederland ECMWF IFS, dan is S1 duidelijk nauwkeuriger: 10,4 tegen 11,6–15,5 min/u, en IFS geeft 1,8 tot 3,2 uur per dag te veel zon. Op ICON-EU hangt het af van de omrekening: met een DNI-drempel is ICON-EU slechter (12,4), met onze S1-omrekening iets beter dan HARMONIE (9,8 tegen 10,4), ook bij gelijke lead.

## Aanbeveling

**Neem S1** als zonneschijnduur per uur. Daarvoor zijn er vier redenen:

1. S1 is binnen 0,1 min/u de beste. S5 wint 0,1 min/u, maar heeft daarvoor een tweede veld en een extra parameter nodig.
2. S1 is onbevooroordeeld, met +0,8 min/u en +0,2 u per dag.
3. S1 hergebruikt precies de lichtfactor `k` die de UV-schatting en de luchtgrafiek al uitrekenen.
4. S1 kost **0 extra bytes**: hij rekent alleen op het bestaande `radiation`-veld en de zonnestand.

S4 (wolkenlagen) is de terugval voor uren zonder stralingsframe. Die is 0,5 min/u slechter.

**Rekentijd** (node 24 op de devhost, `tools/zonneschijn/bench.mts`, 6 substappen van 10 minuten zoals `cloudModification`):
- tabel, één locatie × 48 uur: 0,06 ms;
- kaartframe op het 8 km-raster (157×169): 5,7 ms.

Met 6 in plaats van 30 substappen verandert de meting niet: S1 houdt MAE 10,4 en bias +0,8 met dezelfde parameters.

**Hoe het kan landen.** Dit zijn voorstellen; de keuzes liggen bij de PO.
- **Tabel/urenoverzicht:** per uur "☀ 40 min" of een kleine zonbalk 0–60 in de Lucht-kolom. Met een MAE van 10 min is een afronding op 10 minuten eerlijk; het getal suggereert dan geen precisie die er niet is. Een dagtotaal "≈ 5 u zon" kan bovenaan de dag, met een MAE van 1,4 u.
- **Kaart:** een zonnekaart in Lucht-modus, per frame te berekenen in de client (≈ 6 ms per frame). De lichtfactor in Lucht (MIP-34) laat al ongeveer hetzelfde zien. Een aparte laag is daarom optioneel.
- **Bot:** het dagtotaal per plaats in het weerbericht ("vandaag ≈ 5 uur zon").
- **Verleden:** voor uren die al voorbij zijn, kan de app later echte metingen tonen. De KNMI-dataset met 10-minutenwaarnemingen heeft zonneschijnduur per station. Dat is een eigen ingest en valt buiten dit voorstel.

## Reproduceren

```sh
tools/zonneschijn/run.sh   # vanuit een checkout; KNMI_OPEN_DATA_API_KEY in de omgeving of .env
```

Het script haalt KNMI-uren (2016 t/m 17 oktober 2026), het HARMONIE-archief en Open-Meteo op. Daarna draait het `evaluate.py`, dat `tools/zonneschijn/results.md` schrijft, en tot slot de rekentijdmeting `bench.mts`. De cijfers hierboven komen uit die run, en elke stap gaf `EXIT: 0`. De data (≈ 140 MB) staat in `tools/zonneschijn/data/` en wordt niet gecommit. De eerste ophaalbeurt duurt ongeveer een uur; daarna slaat het script bestaande runs en afgesloten jaren over.

## Open vragen voor de PO

1. **Waar tonen?** Kies uit: (a) per uur in de Lucht-kolom, (b) alleen een dagtotaal, (c) allebei. Voorstel: (c), met per uur een balk en het dagtotaal als getal.
2. **Vorm:** minuten afgerond op 10, of klassen ("zonnig / af en toe zon / bewolkt")? Voorstel: minuten op 10 met een balk. Klassen verbergen het verschil tussen 20 en 40 minuten, en dat verschil zit wél in de data.
3. **Zonnekaart in Lucht:** een eigen laag, of houden we de lichtfactor van MIP-34? Voorstel: geen aparte laag, omdat de lichtfactor al vrijwel hetzelfde laat zien.
4. **ICON-D2:** in de winter is ICON-D2 beter voor zon. Een DWD-bron toevoegen is een aparte bronkeuze. Voorstel: niet nu; S1 op HARMONIE verslaat alle Open-Meteo-modellen over het jaar. Kanttekening uit de vergelijking met de Zwitserse app: S1 op de ICON-EU-straling is 0,6–0,7 min/u beter dan S1 op HARMONIE.
5. **Archief bewaren?** Het KNMI-archief van P1 begint nu bij januari 2026. Als dat archief doorschuift, kan de meting later niet meer vanaf nul worden herhaald. De HARMONIE-uittreksels per station zijn ≈ 24 MB. Bewaren we die als release-asset, of accepteren we dit risico?
6. **Herkalibratie:** de parameters komen uit januari–oktober 2026. November en december ontbreken nog. Voorstel: in januari 2027 opnieuw fitten met `run.sh` en een verlengde datumreeks.

## Changelog

- 2026-10-18 — concept (U95).
- 2026-10-18 — vergelijking met de Zwitserse app (U95b): ICON-EU, ICON global en ECMWF IFS erbij.
