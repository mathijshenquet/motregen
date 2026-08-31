# KNMI seamless-neerslagverwachting

Waargenomen op 28 augustus 2026 via de officiële KNMI-catalogus, Open Data
API en `KNMI_PYSTEPS_BLEND_ENS_202608282020.nc`.

## Producten en publicatie

KNMI publiceert twee pilotdatasets, beide versie 1.0 en iedere vijf minuten:

| dataset | inhoud | actuele bestandsgrootte |
| --- | --- | ---: |
| `seamless_precipitation_ensemble_forecast_members` | 20 ensembleleden | 54,0–59,9 MB |
| `seamless_precipitation_ensemble_forecast_probabilities` | overschrijdingskansen voor 0,1, 0,3, 1, 3, 10 en 30 mm/u | 8,5–9,3 MB |

Beide bestanden bevatten 72 geldigheidstijden, +5 tot en met +360 minuten
in stappen van vijf minuten. De catalogus noemt het product nog een pilot met
een oude voorziene einddatum van 31 januari 2026; de datasetstatus is echter
`onGoing` en de API publiceerde op de waarnemingsdatum aantoonbaar actuele
bestanden. De ingest behandelt schemawijzigingen daarom als harde fouten en
behoudt bij een mislukte refresh de vorige atomair gepubliceerde manifestversie.

Bronnen: [ensembleleden](https://dataplatform.knmi.nl/dataset/seamless-precipitation-ensemble-forecast-members-1-0)
en [overschrijdingskansen](https://dataplatform.knmi.nl/dataset/seamless-precipitation-ensemble-forecast-probabilities-1-0).

## NetCDF-structuur

Het membersbestand is NetCDF4 bovenop HDF5. De relevante variabelen zijn:

| variabele | vorm / waarde |
| --- | --- |
| `ens_number` | `(20)`, realizations 1…20 |
| `time` | `(72)`, seconden 300…21.600 sinds de run |
| `lat` | `(780)`, 48,9955…56,0065°, stap 0,009° |
| `lon` | `(780)`, −0,00725…11,28825°, stap 0,0145° |
| `precip_intensity` | `(20,72,780,780)`, `uint16`, gzipchunk `(1,1,780,780)` |

`precip_intensity` is instantane neerslagintensiteit in mm/u met
`scale_factor=0,01`, `add_offset=0` en `_FillValue=65535`. De coördinaten
lopen zuid→noord en west→oost. Reprojectie gebruikt nearest neighbour naar
het gedeelde 1km-EPSG:3857-grid; de gather schrijft dat doelgrid weer in de
contractoriëntatie noord→zuid. Buiten het bronraster komt no-data.

## Deterministische kaartwaarde

De file markeert geen controlelid, mediaanlid of ander best-estimate: alle
twintig velden zijn alleen als realizations 1…20 beschreven. Motregen neemt
daarom per cel en geldigheidstijd de ensemblemediaan. Bij twintig geldige
leden is dat het gemiddelde van de waarden op rang 10 en 11; missende leden
worden genegeerd en een cel zonder geldige leden blijft no-data. Dit is
deterministisch, robuust tegen ensemble-uitbijters en introduceert geen
willekeurige voorkeur voor één realization.

De kansendataset wordt niet gedownload of gecachet. Die blijft materiaal voor
een latere kans-/percentielfunctie en hoort niet bij de deterministische kaart.

## Refreshcadans en bytes

Een membersfile bevat ook de eerste twee uur en alle twintig leden; de Open
Data-download is daardoor 54,0–59,9 MB, ook al publiceert motregen alleen de
mediaan na +2 uur. De native vijfminutencadans zou 288 downloads en circa
15,6–17,3 GB per dag kosten (468–518 GB per dertig dagen). De gekozen
standaard is daarom één check/download per vijftien minuten via
`MOTREGEN_SEAMLESS_CADENCE=15m`: 96 downloads en circa 5,2–5,8 GB per dag,
exact een derde van de native ingress.

Bij iedere check wordt steeds het nieuwste vijfminutenbestand gekozen. De verse
pySTEPS-nowcast blijft +0…+2 uur bezitten, waardoor vijfminutenrefresh van de
veel duurdere verre blend weinig extra kaartwaarde geeft. Een beheerder kan de
cadence bewust lager zetten wanneer bandbreedte minder belangrijk is.

Een T2h-profiel met `taskset -c 0,1` mat vóór optimalisatie 266,03 seconden voor
een volledige +125…+360-refresh. De NetCDF/gzip-read kostte 25,66 seconden en de
28,6 miljoen broncelmedianen 2,05 seconden. Het werk ná de mediaan domineerde:
de ingebouwde regentabel werd voor ieder van de circa 81 miljoen doelcellen
opnieuw opgebouwd en gevalideerd, gevolgd door seriële motion en zstd-encoding.

De regentabel wordt nu eenmaal procesbreed geïnitialiseerd, bronframes worden
via een iterator direct gegatherd en gekwantiseerd, en motionparen plus de
onafhankelijke zstd-frameleden gebruiken maximaal twee threads. Een live
2-core-nameting met opnieuw 48 frames kostte 32,62 seconden: 27,58 seconden
framevoorbereiding en 4,40 seconden motion plus encoding, 8,16× sneller dan de
baseline. De volledige eenmalige ingest ging van 484,23 naar 44,33 seconden.
De piek-RSS steeg door twee gelijktijdige zstd-workspaces van 247 naar 353 MB;
dat blijft ruim binnen het 4-GB-budget.

## Publicatie

Standaard publiceert de ingest alleen leads ná de ingestelde
`MOTREGEN_NOWCAST_MINUTES` (dus +125…+360 minuten bij de standaard +120).
De mrf-chunk heeft `source: "seamless"`, `field: "rain_rate"`, het gedeelde
grid en de normale regentabel. Ieder frame na het eerste krijgt dezelfde
motion-annex als de overige regenbronnen. De bestandsnaam bevat run,
leadvenster en de T2d-generatiesuffix over formaatgeneratie, veld, grid en
kwantisatietabel, bijvoorbeeld
`seamless-20260828T2020-m125-360-g….mrf`.

`spec/seamless_reference.py` berekent de celmedianen onafhankelijk met h5py
en NumPy. `spec/spot_check_seamless.py` vergelijkt drie live bronframes na
reprojectie met de gepubliceerde mrf-codes en hun lokale kwantisatiestap.

De daemon voert maximaal één seamless-refresh tegelijk uit in een eigen worker.
Alle daemonstaat en manifestpublicatie blijven op de hoofdthread; een resultaat
dat nog op een inmiddels vervangen AROME-windprior is gebaseerd wordt verworpen.
RTCOR, nowcast, AROME en UV publiceren ieder direct na hun volledige refresh een
nieuw atomisch manifest. Daardoor kan een lopende seamless-refresh radar niet
meer serieel ophouden. Op een lege start verschijnt het eerste bruikbare
manifest zodra AROME en RTCOR gereed zijn; nowcast, UV en seamless worden daarna
elk atomisch toegevoegd. Downloadcache- en chunkpruning blijven na iedere
geslaagde manifestpublicatie actief.
