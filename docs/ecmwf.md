# Dagverwachting uit ECMWF

De aanvullende dagverwachting komt uit [ECMWF IFS open data](https://www.ecmwf.int/en/forecasts/datasets/open-data),
met HRES/medium-range control (`ifs/0p25/oper`, `fc`) en voorgerekende ENS-neerslagkansen
(`ifs/0p25/enfo`, `ep`). De resolutie is 0,25° (bij Nederland circa 17 × 28 km).
De urenvelden, kaart en tijdlijn blijven bij de bestaande KNMI-bronnen. MIP-36 beschrijft
de productkeuze; deze pagina beschrijft de ingest en het dataformaat.

## Runs en ophalen

`motregen-ecmwf` kiest de nieuwste complete 00- of 12-UTC-run waarvan zowel de
HRES-index van +240 uur als de ENS-index van +240 uur beschikbaar zijn. HRES wordt
rond 07:34/19:34 UTC gepubliceerd, de ENS-kansen rond 08:01/20:01 UTC (waargenomen
17 oktober 2026). De timer staat op **08:15 en 20:15 UTC**, met `Persistent=true` en
herstart na 30 minuten bij een fout. Een oude run van 18 uur of ouder telt bij automatische
selectie niet als succes: zo blijft een vertraagde nieuwe run een herhaalpoging krijgen.
ECMWF bewaart de laatste twaalf runs, ongeveer twee tot drie dagen.

De job leest JSON-regelindices van
`https://data.ecmwf.int/forecasts/YYYYMMDD/HHz/ifs/0p25/` en vraagt alleen de benodigde
GRIB2-berichten op met HTTP Range. Zowel HTTP 206, Content-Range, berichtlengte als
GRIB2-magic/eindmarkering worden gecontroleerd. Er lopen maximaal vier verzoeken tegelijk;
fouten krijgen vier pogingen, met 1, 2 en 4 seconden tussenruimte. Ruwe berichten en indices
staan in `<data>/.ecmwf-cache/<YYYYMMDDTHH>/`; geldige berichten worden bij herstart hergebruikt.
Na succesvolle publicatie worden cachebestanden ouder dan 72 uur opgeruimd. Deze cache staat
los van de twaalfuurscache van de KNMI-ingest.

HRES: 64 stappen, elke drie uur van +3 tot +144, daarna elke zes uur van +150 tot +240.
Per stap: `tp`, `mx2t3`/`mx2t6`, `mn2t3`/`mn2t6`, `10u`, `10v`, windstoten en `tcc`.
ENS: alleen `tpg1` en `tpg5`, met 24-uursvensters die elke twaalf uur beginnen, van
0–24 tot 216–240. `ssrd` en zonuren worden niet berekend.

De bestaande Rust-ecCodes-binding decodeert de CCSDS-compressie. De echte fixture
`crates/ingest/tests/fixtures/ecmwf-20261017T00-mx2t3-3.grib2` controleert dat zelfstandig,
inclusief het bronraster dat bij 180° begint. De Nix-ecCodes-build heeft geen pthread-ondersteuning;
CAMS- en ECMWF-decoders delen daarom binnen één proces een mutex.

## Dagdefinities

Alleen volledig gedekte kalenderdagen in **Europe/Amsterdam** worden gepubliceerd.
Een run van 00 of 12 UTC mist het begin van zijn eerste lokale dag; die dag vervalt.
Bij +240 uur blijven doorgaans negen volledige dagen over. Zomertijd levert dagen van
23 uur, wintertijd van 25 uur. `ecmwf.days` bevat voor ieder frame de lokale ISO-datum
`date` en de UTC-grenzen `start` (inclusief) en `end` (exclusief). De frametijd is lokale
middag, als UTC-string: 10:00 UTC in de zomer en 11:00 UTC in de winter. Deze frames horen
bij een dagenlijst, niet bij de uurlijkse tijdlijn.

| veld | eenheid | afleiding |
| --- | --- | --- |
| `day_tmax_c` | °C | hoogste `mx2t3`/`mx2t6` van intervallen met positieve overlap met de dag |
| `day_tmin_c` | °C | laagste `mn2t3`/`mn2t6`, dezelfde overlapregel |
| `day_precip_mm` | mm | `tp` de-accumuleren en ieder interval verdelen naar overlap in seconden |
| `day_precip_prob` | % | `tpg1`, het 24-uursvenster met midden het dichtst bij het werkelijke dagmidden |
| `day_precip_prob5` | % | dezelfde keuze uit `tpg5` |
| `day_wind_ms` | m/s | hoogste windsnelheid uit gelijktijdige `10u`/`10v`-knopen tussen 06:00 en 21:00 lokaal, inclusief |
| `day_wind_dir` | graden | meteorologische richting waaruit de wind komt bij die hoogste snelheid; noord = 0°, oost = 90° |
| `day_gust_ms` | m/s | hoogste beschikbare windstoot uit intervallen met positieve dagoverlap |
| `day_cloud` | % | ongewogen gemiddelde van de `tcc`-knopen tussen 08:00 en 18:00 lokaal, inclusief |

`tp` komt in meters en wordt millimeters; temperaturen komen in kelvin. `tcc` is een
fractie en wordt procenten. ENS-kansen zijn in de bron al **procenten**, geen fracties.
`stepRange` bepaalt steeds het interval; opvolgende cumulatieve `tp`-velden met dezelfde
start worden van elkaar afgetrokken. Rechtstreekse opvolgende intervaltotalen worden niet
nogmaals gedeaccumuleerd. Ontbrekende of dubbele stappen, gaten en dalende accumulaties
(afgezien van maximaal 0,02 mm afrondingsruis) geven een fout. No-data wordt niet droog.

Windstoten: kies `10fg3` als de index hem heeft; tot +144 uur dekt dat de volledige drie
uur. Anders wordt `10fg` gebruikt. **Na +144 uur bevat `10fg` alleen het laatste uur per
zesuurstap. Het dagmaximum kan daardoor worden onderschat.** In de onderzochte
2026-10-17 00Z-run bood de index ook vóór +144 uur alleen `10fg`, met bijvoorbeeld
`stepRange=2-3`: dan geldt dezelfde beperking tot de beschikbare uurvensters.

De verdeling van regen over een grensoverschrijdend interval veronderstelt een constante
intensiteit binnen dat interval. Een temperatuur- of windstootelextreem kan ook net buiten
de dag gevallen zijn; zonder fijnere bronstappen is dat niet te bepalen. ENS-kansen gebruiken
een UTC-venster, geen exact lokaal etmaal. Een 00–24-UTC-venster wijkt in de zomer twee uur af.

## Raster en kwantisatie

De native uitsnede bevat 24 × 17 bronpunten: 50–54° N en 2–7,75° O, elke 0,25°.
Dit dekt de CAMS-uitsnede voor Nederland en Vlaanderen met marge. Dagwaarden worden eerst
op deze bronpunten berekend. Voor compatibiliteit met MRF-clients volgt bilineaire
herprojectie naar EPSG:3857: `x0=258000`, `y0=7132000`, `dx=24000`, `dy=-24000`,
24 × 26 cellen, binnen de CAMS-bbox. Windrichting gebruikt **nearest neighbour**:
graden bilineair mengen zou bijvoorbeeld 359° en 1° naar 180° omzetten.

Per veld één MRF-chunk, één onafhankelijk predictief gecomprimeerd frame per dag.
De tabel in de header is leidend; index 255 is no-data.

| veld | tabel voor indices 0–254 |
| --- | --- |
| temperatuur | −40 tot 61,6 °C, stappen van 0,4 °C |
| neerslag | indices 0–200: 0–40 mm, stappen van 0,2; daarna 42–148 mm, stappen van 2 |
| wind en windstoten | 0–63,5 m/s, stappen van 0,25 m/s |
| windrichting | `index × 360 / 255` graden (0–358,59°) |
| kansen en bewolking | `index × 100 / 254` procent (0–100 %) |

## Publicatie en gebruik

De job schrijft eerst onveranderlijke chunks onder `<data>/chunks/`, daarna atomair
`<data>/ecmwf.json`. Source is `ecmwf`. De sidecar bevat `run`, `license`, `days` en
`chunks`. De ingest-daemon neemt de gevalideerde chunks en de sectie `ecmwf` op in
`manifest.json` bij `MOTREGEN_ECMWF_IN_MANIFEST=true`, of NixOS
`services.motregen.ecmwfInManifest = true`. **Standaard uit** zolang de client deze velden
niet gebruikt. Runs ouder dan 72 uur en verwijderde sidecars verdwijnen uit het manifest;
een foutieve vervanging laat de vorige geldige publicatie staan. Caddy serveert de sidecar
zelf niet, alleen het manifest en de chunks.

```sh
cargo run --release -p motregen-ingest --bin motregen-ecmwf -- --data-dir tmp/ecmwf
cargo run --release -p motregen-ingest --bin motregen-ecmwf -- --data-dir tmp/ecmwf --run 2026-10-17T00:00:00Z
```

`--data-dir` volgt `MOTREGEN_DATA_DIR` (standaard `data`). De expliciete `--run` is voor
reproductie binnen de bewaartermijn/cache; hij vereist 00/12 UTC. Er is geen API-sleutel nodig.
`MOTREGEN_ECMWF_API` is een optionele alternatieve basis-URL voor bron-/HTTP-tests.

## Meting en controle

Echte lokale run: **2026-10-17 00 UTC**, exit 0, proceswandtijd **164,991 seconden**
(exclusief de eerste releasebuild van 35,85 seconden). Gedownload: **387.260.962 bytes**
(369,3 MiB), inclusief indices; 486 geselecteerde GRIB2-berichten. Publicatie: negen chunks,
**49.851 bytes** totaal, met elk negen dagen (18–26 oktober, inclusief de wintertijdwissel).
Een tweede uitvoering met dezelfde cache eindigde met exit 0 in **4,537 seconden**,
met **0 gedownloade bytes** en dezelfde publicatie.

Puntcontrole Utrecht (52,09 N / 5,12 O), dag 3 vanaf 17 oktober = **19 oktober 2026**,
UTC-interval 18 oktober 22:00 tot 19 oktober 22:00, leads 46–70. `grib_ls -l 52.09,5.12,1`
kiest bronpunt 52,0 N / 5,0 O. De onafhankelijke berekening uit de ruwe berichten geeft
**14,992654419 °C** en **2,441406250 mm**; de Rust-dagaggregatie geeft 14,992654800 °C en
2,441406250 mm. Voor regen: verschil opeenvolgende `tp`-waarden, overlap 2/3 van 45–48,
de volle intervallen 48–69 en 1/3 van 69–72; voor temperatuur de max van dezelfde
positief overlappende intervallen. Afwijking temperatuur < 0,000001 °C.

Het gepubliceerde Mercatorpunt voor Utrecht (cel 12,13) is na herprojectie en kwantisatie
14,8 °C en 2,0 mm. Dat is een ander celcentrum dan het oorspronkelijke nearest-bronpunt;
die waarden worden daarom niet als puntgelijke broncontrole gebruikt.

Reproductie van de Rust-puntcontrole:

```sh
cargo run --release -p motregen-ingest --example ecmwf_point -- tmp/ecmwf 2026-10-19 52.09 5.12
grib_ls -F '%.12f' -p shortName,startStep,endStep -l 52.09,5.12,1 tmp/ecmwf/.ecmwf-cache/20261017T00/48-fc-tp-48.grib2
```

De volledige onafhankelijke puntberekening en de trackreceipts staan lokaal in het U90-tracklog.

## Licentie

[ECMWF open data](https://www.ecmwf.int/en/forecasts/datasets/open-data) valt onder
CC BY 4.0 en de ECMWF-gebruiksvoorwaarden, met commercieel gebruik en herdistributie
mogelijk mits de bron en bewerking worden vermeld. De metadata draagt:
“ECMWF IFS open data (CC BY 4.0), door motregen omgerekend naar dagwaarden”.
De bronregel en Over-vermelding in de app volgen in U91, conform MIP-36.
