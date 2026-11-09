# Weervelden naast regen

## Grid en kwantisatie

Regen blijft op het gedeelde 1km-grid en gebruikt de bestaande
stuksgewijs-logaritmische tabel. AROME-uurvelden worden eerst op een intern
2km-werkraster gezet en daarna in fysieke eenheden per blok gemiddeld, met
uitsluiting van no-data. Pas daarna volgt kwantisatie. De mrf-header beschrijft
het resulterende veld; clients hoeven geen resolutie te kennen.

`feels_like_c` is voor kaart én tabel één veld. Zijn frames staan als
verliesvrije predictieve members in de chunk (`pred` in de header,
docs/mrf.md §Predictive frames): dezelfde cellen als de bitmap, ~62 % van de
bytes. `pressure_hpa` gebruikt dezelfde codering.

| gebruik | velden | grid | afmetingen |
| --- | --- | ---: | ---: |
| stadslabels, tabel en particles | `temp_c`, `feels_like_c`, `wind_u_ms`, `wind_v_ms`, `gust_ms` | 6 km | 209×225 |
| isobaren (windmodus) | `pressure_hpa` | 6 km | 209×225 |
| zon/pictogram | `radiation` | 8 km | 157×169 |
| geïntegreerde tabel/pictogram-input | `rel_humidity`, `cloud_frac` | 16 km | 79×85 |
| wolkendoorsnede (U37) | `cloud_low`, `cloud_mid`, `cloud_high` | 16 km | 79×85 |

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
| `gust_ms` | 0 m/s | 0,5 m/s | 127 m/s | stoot = \|(162, 163)\| per AROME-cel, daarna 6 km-blokgemiddelde zoals de wind; de bovenkant is ongebruikt (NL-record ≈ 40 m/s) |
| `radiation` | 0 W/m² | 5 W/m² | 1270 W/m² | bestaande radiation-tabel blijft gelijk |
| `uv` | 0 | 12/254 ≈ 0,0472 | 12 | volledige gebruikelijke UV-indexrange |
| `rel_humidity` | 0 % | 100/254 ≈ 0,3937 % | 100 % | AROME 2m-RH is fractie 0–1 en wordt vóór kwantisatie ×100 |
| `cloud_frac` | 0 % | 100/254 ≈ 0,3937 % | 100 % | AROME totale bewolking is fractie 0–1 en wordt vóór kwantisatie ×100; uitsluitend pictogram-input |
| `pressure_hpa` | 940 hPa | 0,5 hPa | 1067 hPa | luchtdruk op zeeniveau (Pa ÷ 100); zie §Luchtdruk |
| `cloud_low`, `cloud_mid`, `cloud_high` | 0 % | 5 % | (1270 %) | AROME 73/74/75 (fractie 0–1) ×100; alleen index 0–20 komt voor — de doorsnede tekent een vorm, geen afleeswaarde |

U en V worden uit dezelfde decoded lead time, dezelfde indexmap en dezelfde
tijdenlijst opgebouwd. De publisher weigert een AROME-publicatie wanneer de
twee chunks niet hetzelfde grid, dezelfde tijden en dezelfde framevolgorde
hebben.

`cloud_frac` heeft geen kaartsemantiek: het is alleen invoer voor de
frontend-pictogramafleiding, conform MIP-4 ronde 4.

## Luchtdruk

`pressure_hpa` is de HARMONIE-luchtdruk herleid tot zeeniveau: parameter 1 op
niveautype 103 (tabel 253, `timeRangeIndicator` 0). Parameter 1 staat ook op
`sfc`; dat is de oppervlaktedruk, die boven de Ardennen tot ~906 hPa zakt en
dus geen isobaren geeft. De client tekent er in windmodus isobaren van (4 hPa).

Kwantisatie 0,5 hPa over 940–1067 hPa. Een fijnere stap past niet: 0,1 hPa over
940–1060 hPa vraagt 1201 niveaus, een cel heeft er 255. Nederlandse records
liggen rond 954 en 1049 hPa. Een isobaarafstand van 4 hPa is 8 stappen; de
isolijnlaag blurt en interpoleert met een B-spline, dus de kwantisatietrap is
in de lijnen niet te zien.

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


### Met zon (MIP-41, nu als `?dev&gevoel=zon` in de client)

Tak 2 krijgt de BoM-vorm **mét straling** (Steadman 1994):

`AT = T + 0,348e − 0,70v + 0,70·Q/(v + 10) − 4,25`

met `Q` de netto door het lichaam geabsorbeerde straling in W/m² lichaamsoppervlak. In Steadmans
afleiding is `Q = h_r·(T_mrt − T)`: de extra straling ten opzichte van een omgeving op luchttemperatuur
(de schaduwvorm). Tak 1 (windchill tot en met 10 °C) en de overgangsband van tak 3 blijven gelijk; in
de band mengt de stralingsvorm mee, dus bij 10 °C is gevoel nog steeds exact JAG/TI.

**Q is de directe zon op een staande persoon.** De schaduwvorm beschrijft al een persoon buiten in de
schaduw; wat zon toevoegt is vooral de directe bundel. Daarom:

`Q = α · f_p(β) · I_n`

1. `α = 0,7`: kortgolvige absorptie van huid en kleding (ISO 7726, ook in RayMan en SOLWEIG).
2. `f_p(β) = 0,308 · cos(β · (1 − β²/48402))`, `β` de zonshoogte in graden: projectiefactor van een
   staande persoon (Underwood & Ward 1966, zoals in ISO 7726/RayMan). 0,31 bij lage zon, 0,21 bij 48°,
   0,08 bij 90°: lage zon valt vol op het lichaam.
3. `I_n` de directe normaalstraling. HARMONIE levert alleen globale straling als uurgemiddelde; per uur
   geeft de helderheidsindex `k = G / (S₀·μ̄)` (`μ̄` de gemiddelde sin(zonshoogte) over het uur) met de
   Erbs-splitsing het directe deel: `I_n = G·(1 − k_d(k)) / μ̄`, begrensd op 1000 W/m². Onder 3°
   gemiddelde zonshoogte telt de bundel niet (de splitsing is daar ruis). Op tijdstip `t` geldt het
   gemiddelde van de uren die op `t` en op `t + 1 u` eindigen, zodat het midden op `t` ligt; `f_p` volgt
   de zonshoogte op `t`.

Nacht (zon onder) of bewolkt (`k` laag, `k_d ≈ 1`) geeft `Q ≈ 0`: dan is het de BoM-vorm zonder straling.
Die wijkt van de vereenvoudigde schaduwvorm (`0,33e − 4,00`) alleen in de constanten af, `0,018e − 0,25`:
in Nederland hooguit ±0,3 °C (getest).

**Bron: HARMONIE, niet ICON-D2.** ICON-D2 heeft een directe-stralingsveld (MIP-39), maar dat is een
ander model met andere wolken: in dezelfde cel kan ICON zon geven waar HARMONIE's temperatuur en wind
bij bewolking horen. Het reikt ook maar 48 u tegen HARMONIE's 60 u, dus gevoel zou op +48 u een knik
krijgen. MIP-39 mat dat ICON-D2-direct de zonneschijnduur een dag vooruit nauwelijks beter maakt
(10,5 tegen 10,7 min/u). Erbs op HARMONIE-globaal is één bron, consistent met de rest van de cel.

**Sanity** (20 april 11:40 UTC, De Bilt, zon 48°; `TEMPERATURES=15 pnpm exec tsx scripts/gevoel-zon.ts tabel`):

| situatie | Q | nu (MIP-10) | zon (MIP-41) | zon-sterk (2·Q) |
| --- | ---: | ---: | ---: | ---: |
| zon, 15 °C, 2 Bft (2,5 m/s), RH 60 %, 700 W/m² | 101 W/m² | 12,6 °C | 18,2 °C | 23,9 °C |
| bewolkt, 15 °C, 3 Bft (4,4 m/s), RH 85 %, 150 W/m² | 0 W/m² | 12,7 °C | 12,7 °C | 12,7 °C |

**Bovengrens `zon-sterk` = 2·Q.** Telt men ook de diffuse hemel en het teruggekaatste licht van de grond
(albedo 0,2) als extra en trekt men het langgolvige tekort van een heldere hemel af (SOLWEIG-hoekfactoren),
dan komt Q in dezelfde lentesituatie rond 180 W/m², T_mrt ≈ T + 30 K (handschatting U105). Dat is een
persoon midden op een open veld en het maximum van wat de formule kan zeggen; Steadman (1971) noemde
7–14 °C extra in volle zon, afhankelijk van de wind (geciteerd in Theor. Appl. Climatol. 2011,
[doi:10.1007/s00704-010-0388-2](https://doi.org/10.1007/s00704-010-0388-2)). BoM publiceert zelf alleen de vorm zonder straling, omdat Q in de praktijk lastig te bepalen is.

**Winter blijft winter.** Bij `T ≤ 10 °C` telt zon niet mee, ook niet op een heldere novemberdag met lage
zon (Q 120–150 W/m² op 9 november 2026): JAG/TI kent geen stralingsterm.

Bronnen: Steadman, R. G. (1994), *Norms of apparent temperature in Australia*, Aust. Met. Mag. 43, 1–16;
[Bureau of Meteorology — Thermal comfort observations](https://www.bom.gov.au/info/thermal_stress/);
ISO 7726 (1998), *Ergonomics of the thermal environment — Instruments for measuring physical quantities*;
Underwood, C. R. & Ward, E. J. (1966), *The solar radiation area of man*, Ergonomics 9, 155–168;
Erbs, D. G., Klein, S. A. & Duffie, J. A. (1982), *Estimation of the diffuse radiation fraction for hourly,
daily and monthly-average global radiation*, Solar Energy 28, 293–302; Lindberg, F., Holmer, B. &
Thorsson, S. (2008), *SOLWEIG 1.0*, Int. J. Biometeorol. 52, 697–713.

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
  UV-index, dimensieloos; `-1` is no-data;
- `uvi_clear[time, latitude, longitude]`: dezelfde index zonder wolken
  ("`uvi_cloudy` = `uvi_clear` × cloud modification factor"). Anders dan
  `uvi_cloudy` is dit veld voor álle tijden met de zon op gevuld, ook bij
  status 0: op 23 en 24 september 2026 van 04:00/04:15 tot 19:00 UTC. Het is
  dus een heldere-hemelverwachting voor de rest van de dag, met de ozon van
  die dag.

Voor `uv` worden alleen frames met status 1 of 2 gepubliceerd; `uv_clear`
(zelfde source, grid en kwantisatie) krijgt ieder tijdstip met minstens één
eindige cel. Gemeten op de file van 23 september 13:43 UTC: `uv` 30 frames,
107 380 B; `uv_clear` 61 frames, 42 145 B. Ze gaan met nearest
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

## UV-schatting in het urenoverzicht

De UV-bron bevat in de praktijk alleen analyses (status 1) tot het laatste
kwartier. Op 23 september 2026 liep de live file van 06:00 tot 12:15 UTC. Voor
verleden en nu toont de uurtabel die analyse (dichtstbijzijnde kwartier binnen
30 min). Voor latere uren schat de frontend de UV-index uit HARMONIE-
straling en zonshoogte. De tabel toont zo'n waarde als "≈" met tooltip
"Schatting uit modelstraling en zonshoogte".

Iedere rij toont twee waarden: bewolkt (wat de zon doet) en onbewolkt (wat
ze zonder wolken zou doen). Voor rijtijd `t` op de gekozen locatie, met
μ = sin(zonshoogte) uit `solar.ts`:

1. **Onbewolkt** = KNMI `uv_clear` (dichtstbijzijnde kwartier binnen 30 min).
   Daarna, dus vanaf morgen, geldt de heldere-hemelfit
   `UV_c(t) = 9,20·μ^2,584·(1 − 0,127·cos(2π(dag − 102)/365))`. De cosinusterm
   is de ozonseizoensgang: het ozonmaximum in april dempt de UV.
2. Heldere-hemel-straling (Haurwitz): `G_c(μ) = 1098·μ·exp(−0,057/μ)`,
   gemiddeld over het uur waarop een HARMONIE-stralingsframe betrekking
   heeft. Een frame op tijd `T` is het uurgemiddelde over [T−1 u, T].
3. Bewolkingsfactor per aangrenzend uur `CMF = G/G_c` (alleen als G_c > 20
   W/m², begrensd op 0…1). De tabel middelt de twee uren die aan `t` grenzen.
   In de KNMI-analyses is bewolkt nooit hoger dan onbewolkt (+0,1): 0 % van
   de cellen over 26 dagen. Vandaar de bovengrens 1.
4. **Bewolkt** = KNMI-analyse als die er is, anders `UV(t) = UV_c(t)·CMF^0,30`.

UV wordt minder door wolken verzwakt dan globale straling, daarom `p < 1`.

### Kalibratie onbewolkt (U15, 2026-09-24)

Gebruikt zijn 26 dagen KNMI-archief (iedere 7e dag van 1 april tot 23
september 2026), 300 willekeurige cellen per kwartier in de NL-box
(50,7–53,6° N, 3,3–7,3° O), n = 472.103, tegen `uvi_clear`:

| model | RMSE | bias | RMSE bij UV ≥ 3 | bias bij UV ≥ 3 |
| --- | ---: | ---: | ---: | ---: |
| Madronich 12,5·μ^2,42 | 1,408 | +1,023 | 2,189 | +2,072 |
| U4: 0,84 × Madronich | 0,768 | +0,513 | 1,173 | +1,012 |
| a·μ^b (8,72; 2,514) | 0,347 | −0,019 | 0,551 | −0,040 |
| **+ ozonseizoen (bovenstaand)** | **0,277** | **−0,023** | **0,445** | **−0,015** |

De U4-basis was op één septemberdag gefit en overschatte daardoor in de zomer
met ongeveer 1 UV-punt bij hoge zon. De restfout is vooral ozon van dag tot
dag. `uvi_clear` in De Bilt om 12 u varieerde in juni en juli van 5,1 tot 7,7;
de fit geeft 6,3. Zonder ozonverwachting is dat niet te verkleinen. Voor
vandaag gebruikt de tabel daarom de KNMI-waarde zelf. Er is geen winterdata,
dus oktober–maart is extrapolatie; de UV-index is dan wel < 3.
Reproduceren: `uv run --with h5py --with numpy --with scipy python .dev/tracks/u15-uv-bar/clearfit.py <dir met uviec_bx_hr_*.nc>`.

### Kalibratie bewolkt

Gefit is de KNMI-UV-analyse tegen de onbewolkte basis × HARMONIE-CMF^p, op
23 september (runs 06Z/10Z, 06–13 UTC, n ≈ 66.000 cel-uren):

| model | RMSE | bias | p90 \|fout\| |
| --- | ---: | ---: | ---: |
| U4: 0,84·Madronich·CMF^0,35 | 0,376 | +0,041 | 0,659 |
| **KNMI-`uv_clear`·CMF^0,30** | **0,363** | **+0,022** | **0,645** |
| seizoensfit·CMF^0,30 | 0,409 | −0,142 | 0,616 |

De laatste regel erft de ozonfout van die dag (fit −0,185). De fit van de
bewolkingsfactor rust nog steeds op één septemberdag. Herkalibreer zodra er
een paar weken analyses en historiestraling naast elkaar bewaard zijn.
Reproduceren: `uv run --with numpy --with zstandard --with h5py python .dev/tracks/u15-uv-bar/cmffit.py <datadir> <uviec_bx_hr_*.nc>`.
De U4-kalibratie (Madronich-basis) staat in `.dev/tracks/u4-urenoverzicht/uvcal.py`.

### Weergave

De WHO-klassen zijn laag (< 3, groen), matig (3–6, geel), hoog (6–8, oranje),
zeer hoog (8–11, rood) en extreem (≥ 11, paars). De bar loopt van 0 tot 12. De
bewolkte waarde is een gevulde bar in de kleur van haar klasse; de onbewolkte
waarde een gearceerde, omlijnde bar erachter. Een schatting is gestreept en
krijgt ≈. Vanaf 3 staat het klassewoord erbij en toont de kaart de chip
"Insmeren". Als de zon onder is, is de bar leeg.
