# Weervelden naast regen

## Grid en kwantisatie

Regen blijft op het gedeelde 1km-grid en gebruikt de bestaande
stuksgewijs-logaritmische tabel. AROME-uurvelden worden eerst op een intern
2km-werkraster gezet en daarna in fysieke eenheden per blok gemiddeld, met
uitsluiting van no-data. Pas daarna volgt kwantisatie. De mrf-header beschrijft
het resulterende veld; clients hoeven geen resolutie te kennen.

| gebruik | velden | grid | afmetingen |
| --- | --- | ---: | ---: |
| stadslabels, tabel en particles | `temp_c`, `feels_like_c`, `wind_u_ms`, `wind_v_ms` | 6 km | 209×225 |
| zon/pictogram | `radiation` | 8 km | 157×169 |
| geïntegreerde tabel/pictogram-input | `rel_humidity`, `cloud_frac` | 16 km | 79×85 |

De laatste randblokken zijn partieel omdat 625 niet door alle factoren
deelbaar is; daardoor dekken de nieuwe grids het volledige oude extent met
minder dan één nieuwe cel overhang. De resolutiekeuze en live byte-/
kwaliteitsmetingen staan in `docs/data-dieet.md`.

Alle tabellen hebben 255 eindige, strikt stijgende waarden; index 255 is
no-data. Waarden buiten het bereik satureren op 0/254 en midpoints kiezen de
lagere index.

| veld | index 0 | stap | index 254 | reden |
| --- | ---: | ---: | ---: | --- |
| `temp_c` | −31,2 °C | 0,3 °C | 45,0 °C | ruim Nederlands bereik, resolutie onder de waarneembare kaartprecisie |
| `feels_like_c` | −31,2 °C | 0,3 °C | 45,0 °C | gelijk aan temperatuur voor directe vergelijking |
| `wind_u_ms`, `wind_v_ms` | −31,75 m/s | 0,25 m/s | +31,75 m/s | exact symmetrisch met 0 op index 127 |
| `radiation` | 0 W/m² | 5 W/m² | 1270 W/m² | bestaande radiation-tabel blijft gelijk |
| `uv` | 0 | 12/254 ≈ 0,0472 | 12 | volledige gebruikelijke UV-indexrange |
| `rel_humidity` | 0 % | 100/254 ≈ 0,3937 % | 100 % | AROME 2m-RH is fractie 0–1 en wordt vóór kwantisatie ×100 |
| `cloud_frac` | 0 % | 100/254 ≈ 0,3937 % | 100 % | AROME totale bewolking is fractie 0–1 en wordt vóór kwantisatie ×100; uitsluitend pictogram-input |

U en V worden uit dezelfde decoded lead time, dezelfde indexmap en dezelfde
tijdenlijst opgebouwd. De publisher weigert een AROME-publicatie wanneer de
twee chunks niet hetzelfde grid, dezelfde tijden en dezelfde framevolgorde
hebben.

`cloud_frac` heeft geen kaartsemantiek: het is alleen invoer voor de
frontend-pictogramafleiding, conform MIP-4 ronde 4.

## Gevoelstemperatuur

Definitie volgens MIP-10. De afleiding gebeurt per cel vóór kwantisatie, met
`T` de 2m-temperatuur in °C, `RH` de 2m-relatieve vochtigheid en `v =
sqrt(u²+v²)` de 10m-windsnelheid in m/s.

1. **`T ≤ 10 °C`: KNMI-windchill (JAG/TI).** Bij `v ≥ 1,3 m/s`:

   `G = 13,12 + 0,6215T − 11,37(3,6v)^0,16 + 0,3965T(3,6v)^0,16`

   Bij `v < 1,3 m/s` is gevoel gelijk aan `T`. Formule, windhoogte (10 m,
   de exponent 0,16 herleidt naar 1,5 m) en geldigheid (−46 tot +10 °C, wind
   1,3–49,0 m/s) staan in KNMI TR-309 §2.3 (vgl. 2.3), het KNMI-rapport
   waarmee KNMI in 2009 op JAG/TI overging.
2. **`T ≥ 15 °C`: Steadman apparent temperature, BoM-vorm zonder straling.**

   `AT = T + 0,33e − 0,70v − 4,00`, met dampdruk
   `e = RH · 6,105 · exp(17,27T / (237,7 + T))` in hPa (RH als fractie).

   Wind is ook hier de 10m-wind, zoals BoM voorschrijft.
3. **`10 < T < 15 °C`: lineaire overgang** tussen beide:
   `(1 − w)·G + w·AT` met `w = (T − 10)/5`.

No-data in temperatuur, vochtigheid of een windcomponent blijft no-data.

**Afwijking van "zoals KNMI", bewust.** KNMI publiceert alleen de winter-
gevoelstemperatuur (JAG/TI). Voor warm weer heeft KNMI geen gevoelstemperatuur
maar de hittekracht-index (0–10, op WBGT-basis), die zich niet laat vergelijken
met een temperatuur. Tak 2 is daarom de Steadman/BoM-vorm uit MIP-10 en geen
KNMI-definitie. Tak 3 staat niet in MIP-10. Een harde overgang op 10 °C geeft bij
gangbare wind en RH een sprong van tot ruim 2 °C (1,4 °C bij 3 m/s en RH 80 %; 2,2 °C bij RH 60 %). Dat botst
met MIP-10's continuïteitseis (≤ 1 °C). De band houdt KNMI exact tot en met
10 °C en BoM exact vanaf 15 °C. Neveneffect: bij harde wind (≳ 10 m/s) in
droge lucht blijft gevoel binnen de band ongeveer vlak, met een helling tot
−0,1 °C per °C. Dat volgt uit het verschil tussen beide formules en is
getest.

Tot MIP-10 gebruikte de ingest windchill alleen bij `T ≤ 10 °C` en de NOAA-
hitte-index alleen bij `T ≥ 26,7 °C`. Daartussen was gevoel gelijk aan `T`,
dus het grootste deel van het Nederlandse jaar.

Bronnen: [KNMI TR-309, Wind chill equivalente temperatuur (WCET), KNMI
implementatie JAG/TI-methode](https://cdn.knmi.nl/knmi/pdf/bibliotheek/knmipubTR/TR309.pdf);
[KNMI — Gevoelstemperatuur (windchill)](https://www.knmi.nl/kennis-en-datacentrum/uitleg/gevoelstemperatuur-windchill);
[KNMI — Hittekracht](https://www.knmi.nl/kennis-en-datacentrum/uitleg/hittekracht);
[Bureau of Meteorology — Thermal comfort observations](https://www.bom.gov.au/info/thermal_stress/).

## UV

De officiële bron is KNMI Open Data-dataset
[`cloud_modified_UV_index_benelux` versie 1.0](https://dataplatform.knmi.nl/catalog/datasets/index.html?x-dataset=cloud_modified_UV_index_benelux&x-dataset-version=1.0).
Iedere dag heeft één bestand `uviec_bx_hr_YYYYMMDD.nc` van momenteel circa
3,8 MB. Het is NetCDF4/HDF5 en wordt gedurende de dag ongeveer ieder kwartier
onder dezelfde bestandsnaam bijgewerkt. De ingest gebruikt daarom
`lastModified` naast de naam als bronidentiteit en bewaart iedere download in
een versiegestempelde cachedirectory.

Onder `/PRODUCT` staan:

- `latitude[95]` en `longitude[110]`: celcentra per 0,05°, extent van de
  celranden 49,25–54,00° N en 2,25–7,75° O;
- `time[72]`: kwartieren in UTC;
- `status[time]`: 0 = niet beschikbaar, 1 = analyse, 2 = verwachting;
- `uvi_cloudy[time, latitude, longitude]`: cloud-modified erythemale
  UV-index, dimensieloos; `-1` is no-data. `uvi_clear` is aanwezig maar niet
  het gekozen contractveld.

Alleen frames met status 1 of 2 worden gepubliceerd. Ze gaan met nearest
neighbour naar dezelfde EPSG:3857-extent op een passend grof 5km-grid
(130×140); de KNMI-Beneluxdekking laat de buitenste gedeelde kaartmarge als
no-data. De daemon controleert iedere 15 minuten. Buiten het door de
trackspecificatie vastgelegde venster 03:00–21:45 UTC publiceert hij geen
UV-chunk; ontbrekende UV-data is dus nooit nul.

Er is een bronmetadata-afwijking: de catalogustekst en trackspecificatie
noemen 21:45 UTC, maar het op 28 augustus 2026 gedownloade bestand bevat 72
tijden van 03:00 tot 20:45 UTC en zegt hetzelfde in zijn `time`-commentaar.
De daemon hardcodet geen frame-eindtijd: de bestandstijden bepalen welke
frames bestaan, terwijl alleen de buitenvenster-gate de afgesproken 21:45
gebruikt.
