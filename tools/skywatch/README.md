# Skywatch De Bilt

Deze meetrig legt iedere tien minuten drie gelijktijdige bronnen vast: de KNMI-webcam in
De Bilt, de HARMONIE-velden van motregen.nl op 52,10° N / 5,18° O en de automatische
stationswaarneming van De Bilt. Foto's zijn regenereerbare hoststaat onder
`~/skywatch/images/YYYY-MM-DD/HHMM.jpg`; `data/samples.csv` is het gecommitteerde,
append-only meetregister.

## Bronnen en variabelen

- Webcam: `https://cdn.knmi.nl/knmi/map/page/weer/actueel-weer/webcam/webcam.jpg`. Alleen
  gewijzigde bytes krijgen een nieuw bestand. `state.json` bewaart de vorige SHA-256 en het
  wisselmoment; de CSV bevat daardoor ook verversingsinterval en beeldleeftijd.
- Model: `https://motregen.nl/data/manifest.json`. `sample-model.ts` hergebruikt de
  productie-decoder uit `web/src/core/mrf.ts` en leest `cloud_low`, `cloud_mid`,
  `cloud_high`, `cloud_frac` en `radiation` op het De Bilt-punt. Hij neemt voor nu en
  nu+1…+6 uur het dichtstbijzijnde gezamenlijke uurframe, nooit verder dan één uur van het
  doeltijdstip, en bewaart geldigheidstijd, run, forecast-lead en tijdsafwijking.
- Station: de actuele Open Data-dataset
  `10-minute-in-situ-meteorological-observations/1.0`, station-WMO-id `06260`. Dit is de
  officiële, NetCDF-compatibele opvolger van het sinds 29 september 2025 niet meer
  bijgewerkte `Actuele10mindataKNMIstations/2` uit de oorspronkelijke trackspecificatie.

De exact gebruikte stationsvariabelen zijn:

| CSV-kolom | NetCDF | `long_name` | eenheid |
| --- | --- | --- | --- |
| `observed_radiation_w_m2` | `qg` | Global Solar Radiation Mean | W/m² |
| `observed_sunshine_duration_minutes` | `ss` | Sunshine Duration | min per 10-minuteninterval |
| `observed_cloud_cover_oktas` | `n` | Total Cloud Cover | okta |
| `observed_cloud_base_ft` | `h` | Cloud Base | ft |
| `observed_visibility_m` | `vv` | Horizontal Visibility Mean | m |

De NetCDF-`time` is het einde van het meetinterval in UTC. Een ontbrekende stationswaarde
blijft leeg in de CSV; nul blijft nul. De poller gebruikt `h5dump` uit de devenv, zodat de
Python-productiecode geen platformafhankelijke HDF5-wheel nodig heeft.

## CSV-contract en CMF

Iedere poll voegt exact één rij toe. Naast webcam- en waarnemingsmetadata bevat elke rij
elf kolommen per modelhorizon `model_h0_…` tot en met `model_h6_…`: doel-, geldigheids- en
runtijd, forecast-lead, tijdsafwijking, vier wolkenfracties, straling en CMF.

`model_h*_cmf` gebruikt dezelfde Haurwitz-basis als `web/src/core/uv.ts`: per modeluur is
de heldere-hemelstraling het gemiddelde van zes tienminuten-middelpunten over het uur dat
eindigt op de geldigheidstijd. Alleen boven 20 W/m² wordt
`CMF = clamp(straling / heldere-hemelstraling, 0, 1)` vastgelegd. `observed_cmf` gebruikt
dezelfde Haurwitz-formule op het waarnemingstijdstip.

## Handmatig en als user-timer

De sleutel staat alleen in de genegeerde `.env` en komt via de omgeving binnen:

```bash
set -a
source .env
set +a
uv run --project tools/skywatch skywatch-poll
```

Installeren of bijwerken op de huidige host:

```bash
tools/skywatch/install.sh
systemctl --user status skywatch.timer
journalctl --user -u skywatch.service
```

`install.sh` materialiseert de absolute paden van deze worktree en de actieve devenv in
`~/.config/systemd/user/skywatch.service`, installeert `skywatch.timer`, start de timer en
doet meteen een synchrone eerste service-run. De timer is persistent en loopt op iedere
tienminutengrens met maximaal vijftien seconden spreiding.

Ontwikkelchecks:

```bash
cd tools/skywatch
uv run pyright
uv run pytest
```
