# U46 — wolken-webcam-poller

## 2026-10-07T10:21:20+02:00 — start

- Opdracht, `AGENTS.md`, MIP-18 en de eerste relevante data-/frontenddocumentatie gelezen.
- Worktree is schoon op `track/u46-wolken-webcam-poller` vanaf `cedf78d`; `origin/main` wijst naar dezelfde commit.
- De opgegeven tracklog bestond nog niet en is daarom hier aangemaakt als committed, append-only trackartefact.
- `direnv status` exit 0; `.envrc` is toegestaan en de devenv is actief. In deze worktree ontbreekt `.env`; vóór de echte KNMI-waarnemingspoll moet de bestaande hostsecret veilig beschikbaar worden gemaakt zonder hem te committen.
- Eerstvolgende stap: live contract en API exact vaststellen, daarna de minimale poller + tests + systemd-user-installatie bouwen en vandaag activeren.

## 2026-10-07T10:29:39+02:00 — live contract en eerste pollersnede

- Officiële KNMI-documentatie en live API gecontroleerd: het in de spec genoemde `Actuele10mindataKNMIstations/2` is sinds 2025-09-29 uit productie; de officiële compatibele opvolger is `10-minute-in-situ-meteorological-observations/1.0`. Live nieuwste file was `KMDS__OPER_P___10M_OBS_L2_202610070810.nc`.
- Exacte De Bilt-velden uit de live NetCDF vastgesteld: `qg` globale straling (W/m²), `ss` zonneschijnduur (min), `n` totale bedekking (okta), `h` wolkenbasis (ft), `vv` horizontaal zicht (m); station-id is WMO `06260` en tijd is het intervaleinde in UTC.
- Live webcam gaf HTTP 200 en `Last-Modified: 2026-10-07T08:20:06Z`; productie-manifest was gegenereerd om 08:22:37Z en bevatte alle vijf gevraagde HARMONIE-velden.
- Eerste pollersnede gebouwd met Python/uv, de bestaande TypeScript-MRF-decoder, zeven horizons, atomische append-only CSV, hoststaat voor JPEG-deduplicatie en systemd-user-unit/timer.
- Receipt: `uv lock --project tools/skywatch` exit 0.
- Receipt: `uv run --project tools/skywatch pytest` exit 1: 5 passed, 1 failed. Alleen de handmatig genoteerde verwachte Haurwitz-testwaarde was 0,069 W/m² fout; implementatie gebruikte exact `1098 * mu * exp(-0.057 / mu)`. Testverwachting gecorrigeerd; hercontrole volgt.

## 2026-10-07T10:30:50+02:00 — eerste handrun verworpen

- Receipt: `uv run --project tools/skywatch pytest` exit 0: 6 passed.
- Receipt: `uv run pyright` vanuit `tools/skywatch` exit 0: 0 errors.
- Receipt: gerichte TypeScript-check van `sample-model.ts` exit 0; live modelsampler exit 0 en gaf zeven horizons met alle vijf velden terug.
- Eerste `skywatch-poll`-proces exit 0, maar inhoudelijk verworpen: standaard `h5dump` rondde `2422512600` af naar `2.42251e+09`, waardoor 08:10 UTC verkeerd als 07:26:40 UTC werd geïnterpreteerd. De ene nog ongecommitteerde proefrij is verwijderd; dit is geen geldige poller-receipt. Fix: `h5dump -m %.17g`; controle op dezelfde file geeft nu exact `2422512600`.

## 2026-10-07T10:33:10+02:00 — geldige poller en eerste sample

- Tweede poging legde een parserrandgeval bloot: meerregelige stringwaarden uit `h5dump` moesten vóór de CSV-parser worden samengevoegd. Proces exit 1, geen CSV-rij geschreven; regressietest toegevoegd.
- **Handrun 1 geldig:** `uv run --project tools/skywatch skywatch-poll` exit 0. Sample `20261007T083213Z`; webcam gewijzigd en opgeslagen als hoststaat; observatiefile `...202610070820.nc` matcht exact `observation_at=2026-10-07T08:20:00Z`; model-h0 geldig 09:00Z uit run 04:00Z (lead 5 u), CMF 0,770331.
- Receipt: `cd tools/skywatch && uv run pytest && uv run pyright` exit 0: 6 passed; 0 errors/warnings.
- Receipt: `bash -n tools/skywatch/install.sh`, `systemd-analyze calendar '*-*-* *:00/10:00'`, gerichte TypeScript-check van de modelsampler en `git diff --check` samen exit 0. Eerstvolgende timer-elapse volgens systemd: 10:40 CEST / 08:40 UTC.
- README documenteert bronmigratie, exacte NetCDF-variabelen/eenheden, breed CSV-contract, CMF en beheercommando's. Volgende stap: eerste coherente commit pushen, draft-PR openen en daarna timer installeren/observeren.
