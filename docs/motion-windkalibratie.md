# Onderzoek windkalibratie (U84)

Onderzoek in uitvoering, 16 oktober 2026. Geen productiecode of productiegegevens gewijzigd.

De meetcode staat in `crates/ingest/examples/motion_wind_audit.rs` en
`spec/motion_wind_{fetch,analyze}.py`. De geregistreerde KNMI-sleutel blijft lokaal.

## Al gecontroleerd

De echte p1-berichten hebben editie 1, centrum KNMI, tabel 253,
parameters 33/34, hoogte 300 meter, instantane geldigheid en `regular_ll`.
`resolutionAndComponentFlags=136`, `uvRelativeToGrid=1`, `scanningMode=64`:
de componenten volgen de rasterassen. Dit ongeroteerde lengte-/breedteraster
heeft oost/noord als positieve assen. De productieconversie naar EPSG:3857
gebruikt de lokale cosinuscorrectie en keert noord om naar afnemende rijnummers.
De audit vergelijkt de volledige gedecodeerde waardenreeks met ecCodes `values`.

De [KNMI-parametertabel](https://www.knmidata.nl/open-data/harmonie) bevestigt
hoogte, parameters en m/s. Het
[p1-archief](https://dataplatform.knmi.nl/dataset/harmonie-arome-cy43-p1-1-0)
maakt metingen verspreid over de week mogelijk.

## Meetopzet

Per tijdvenster dertien echte RTCOR-frames, interval vijf minuten, plus twee
p1-modeluren uit een drie uur oudere run. Productieherprojectie en regenkwantisatie
blijven gelijk. Een onafhankelijke OpenCV-blokmatcher gebruikt alle pixels in
32×32-blokken, een zoekvenster van ±24 cellen, correlatiescore ≥0,7 en een
heen/terugcontrole van maximaal twee cellen. Onduidelijke matches tellen niet mee.
De eerste, derde enzovoort frameparen leveren de windfit; de overige paren de
foutmeting. Foutmaat: Euclidische vectorafstand in cellen per vijf minuten.

De definitieve tabellen, gevoeligheidscontrole, conclusies en het advies volgen
na afronding van het volledige corpus. Een droog controlevenster zonder
betrouwbare verplaatsingsreferentie wordt expliciet als niet meetbaar gerapporteerd.
