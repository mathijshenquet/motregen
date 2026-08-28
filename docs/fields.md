# Weervelden naast regen

## Grid en kwantisatie

Regen blijft op het gedeelde 1km-grid en gebruikt de bestaande
stuksgewijs-logaritmische tabel. De AROME-uurvelden gebruiken een 2km-variant
met dezelfde extent: EPSG:3857, `x0=0`, `y0=7600000`, `dx=2000`,
`dy=-2000`, 625×675 cellen. Dit is 75% minder ruwe bytes per frame dan het
1km-grid, terwijl het vrijwel de eigen circa-2km-informatie-inhoud van AROME
behoudt. Met name voor windparticles is 4 km zichtbaar grover; daarom delen
temperatuur, gevoelstemperatuur, wind, straling, relatieve vochtigheid en
bewolkingsgraad het 2km-grid.

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

De afleiding gebeurt per cel vóór kwantisatie:

1. Bij `T ≤ 10 °C` en windsnelheid `v > 4,8 km/u` gebruikt de ingest de
   JAG/TI-windchill:

   `W = 13,12 + 0,6215T − 11,37v^0,16 + 0,3965T v^0,16`

   Hier is `T` in °C en `v = 3,6·sqrt(u²+v²)` in km/u. Dit is de formule en
   geldigheidsgrens van de door Environment and Climate Change Canada
   gedocumenteerde windchill-index.
2. Bij `T ≥ 26,7 °C` en relatieve vochtigheid `RH ≥ 40%` gebruikt de ingest
   de NOAA/NWS-hitte-index. Eerst wordt Steadmans eenvoudige schatting
   berekend; wanneer het gemiddelde daarvan met de luchttemperatuur minstens
   80 °F is, volgt Rothfusz' regressie:

   `HI = −42,379 + 2,0490153T + 10,14333127RH − 0,22475541T·RH`

   `     − 0,00683783T² − 0,05481717RH² + 0,00122874T²·RH`

   `     + 0,00085282T·RH² − 0,00000199T²·RH²`

   `T` en `HI` staan in °F en `RH` in procenten. De gedocumenteerde lage-RH-
   en hoge-RH-correcties worden eveneens toegepast; het resultaat wordt naar
   °C teruggerekend.
3. Buiten die domeinen is gevoelstemperatuur gelijk aan de 2m-temperatuur.
   No-data in temperatuur, vochtigheid of een windcomponent blijft no-data.

Bronnen: [Environment and Climate Change Canada — Wind chill index](https://www.canada.ca/en/environment-climate-change/services/weather-health/wind-chill-cold-weather/wind-chill-index.html) en [NOAA/NWS Weather Prediction Center — Heat Index Equation](https://www.wpc.ncep.noaa.gov/html/heatindex_equation.shtml).

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
