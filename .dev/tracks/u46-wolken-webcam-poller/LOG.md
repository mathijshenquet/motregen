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

## 2026-10-07T10:35:20+02:00 — vroege draft en timer actief

- Eerste coherente commit `490c0da` gemaakt en gepusht; `git ls-remote origin track/u46-wolken-webcam-poller` gaf exact dezelfde hash. Draft-PR vroeg geopend: https://github.com/mathijshenquet/motregen/pull/71.
- Receipt: `tools/skywatch/install.sh` exit 0. De gegenereerde user-service gebruikt de genegeerde `.env` uitsluitend als `EnvironmentFile`; `skywatch.timer` is enabled en active (waiting). De synchrone eerste oneshot eindigde met `Result=success`, `ExecMainStatus=0`.
- **Handrun 2 en 3 geldig:** beide `uv run --project tools/skywatch skywatch-poll` exit 0, samples `20261007T083457Z` en `20261007T083458Z`. Daarmee zijn de gevraagde drie handruns synchroon voltooid; ongewijzigde webcam-bytes verwezen correct naar het bestaande hostbeeld.
- De eerste door de installatie gestarte service schreef sample `20261007T083446Z` met exit 0. Eerstvolgende stap: een autonome kalendertrigger observeren en daarna dagboek/grading/analyse afmaken.

## 2026-10-07T10:43:30+02:00 — autonome poll en lucht-dagboek

- De autonome timertrigger van 10:40 CEST schreef sample `20261007T084002Z`; journal meldde `Finished`, `systemctl show` gaf `Result=success` en `ExecMainStatus=0`. Daarmee draait de prioriteit-1-poller aantoonbaar zonder agentproces.
- `?dev` heeft nu de vijf gevraagde luchtklassen, knop `Lucht nu` en `Kopieer dagboek`. Entries bewaren ISO-tijd, klasse en de gekozen locatie afgerond op 0,1° in `motregen-sky-diary`; reset bewaart dit menselijke meetdagboek. `docs/dev-opties.md` vermeldt eigenaar U46 en vervaldatum na de analyse.
- Receipt: eerste `pnpm test` exit 1 doordat de genegeerde synthetische MRF-fixture in deze verse worktree ontbrak; geen producttest faalde. `pnpm synthgen` exit 0, daarna `pnpm test` exit 0: 48 bestanden, 329 tests. `pnpm typecheck` exit 0.

## 2026-10-07T10:50:30+02:00 — render-, grading- en analyseketen

- `render.ts` bouwt een echte Vite-preview, start hem tijdelijk en maakt met Playwright een vaste 960×360-render van drie uur wolkendoorsnede. De route gebruikt rechtstreeks `cloudBand` uit de bestaande tekening; visuele controle van sample `20261007T083213Z` gaf een geldige hoge/midden/lage doorsnede.
- Receipt: `pnpm --dir web exec tsx ../tools/skywatch/render.ts --sample 20261007T083213Z --output-dir /tmp/skywatch-render-check-2` exit 0. Een afzonderlijke Python-aanroep van `grade.render_graphs` exit 0 en las de stdout als exact één JSON-resultaat.
- `grade.py` volgt het officiële Decisions-contract: `gpt-6-luna`, inline data-URL, dezelfde choice/score/predicate voor webcam en grafiek, daglicht >5°, unieke gewijzigde beelden, antwoordvalidatie, append-only ruwe response/usage/latency en kostenschatting. De officiële OpenAI-documentatie bepaalde het endpoint, de vraagtypen en de huidige tokenprijzen.
- `analyse.py` berekent Cohen's kappa, Spearman, dominante modellaag × webcamklasse en een diepte-2-regressieboom met RMSE. Een eerste pytest-run exit 1 door `zip(strict=True)` op aangrenzende splitwaarden; gecorrigeerd naar de bewust één kortere iterator. Een eerste pyright-run meldde onbekende JSON-types; expliciete runtimechecks/casts toegevoegd.
- De autonome 10:50-trigger schreef een nieuw beeld/sample `20261007T085015Z`; `Result=success`, `ExecMainStatus=0`, timer active en volgende elapse 11:00 CEST. De webcam bleek na 18,03 minuten gewijzigd.

## 2026-10-07T10:53:20+02:00 — eindgates en rooktestblokkade

- Receipt: `cd tools/skywatch && uv run pytest` exit 0: 11 tests; `uv run pyright` exit 0: 0 errors/warnings/informations.
- Receipt: `cd web && pnpm typecheck` exit 0; `pnpm test` exit 0: 48 bestanden, 331 tests. De nieuwe tests dekken toevoegen, 0,1°-afronding, kopieer-JSON, corrupte opslag en behoud bij reset.
- Receipt: gerichte `tsc` voor `render.ts` exit 0; gerichte `tsc` voor `sample-model.ts` exit 0; `git diff --check` exit 0.
- Receipt: `uv run python analyse.py --output /tmp/skywatch-empty-report.md` exit 0; het lege rapport is alleen een uitvoerbaarheidscheck en wordt niet als rooktestresultaat gecommit.
- Rooktestgate synchroon en zonder API-verkeer gecontroleerd: `uv run python grade.py --limit 10 --require 10` exit 1 met `Slechts 2 nieuwe daglichtbeelden beschikbaar; vereist 10`. `env -u OPENAI_API_KEY uv run python grade.py --limit 1` exit 1 met `OPENAI_API_KEY ontbreekt`.
- Openstaand: de timer moet nog acht unieke daglichtbeelden verzamelen en de genegeerde `.env` moet een `OPENAI_API_KEY` krijgen. Pas dan kunnen de vereiste twintig Decisions-calls, echte kosten/latency/ruwe antwoorden en het rooktestrapport worden vastgelegd; dit is niet als groen voorgesteld.
- Na de laatste UI-wijziging opnieuw synchroon gecontroleerd: `pnpm typecheck` exit 0, `pnpm test` exit 0 (48 bestanden/331 tests), `pnpm build` exit 0; `uv run pytest` exit 0 (11 tests) en `uv run pyright` exit 0.

## 2026-10-07T10:55:10+02:00 — tweede snede gepubliceerd

- Commit `f8126b7` bevat dagboek, render/grading/analyse, contracttests en de tot dan verzamelde append-only samples. `git commit` exit 0.
- Receipt: `git push origin HEAD:track/u46-wolken-webcam-poller` exit 0 (`490c0da..f8126b7`). Draft-PR #71 blijft draft en wordt bijgewerkt met de feitelijke groene gates en de twee rooktestblokkades.

## 2026-10-07T10:57:30+02:00 — slot: gemerged en overgedragen

- U46 is op `main` gemerged als `68087d1`; receipt: `git ls-remote origin refs/heads/main` exit 0 en wees naar `68087d18abca5b46d47009eee6eeec0ba1503b91`.
- Onafhankelijke mergegate door de orkestrator: typecheck exit 0, unit exit 0, build exit 0, pytest 11 tests exit 0 en pyright exit 0.
- De skywatch-user-timer is opnieuw geïnstalleerd vanuit `/home/mathijs/motregen`. Lokale controle exit 0: `WorkingDirectory=/home/mathijs/motregen`, timer `ActiveState=active`, laatste service `Result=success` en `ExecMainStatus=0`. Deze trackworktree hoeft niet meer te pollen.
- De Decisions-rooktest met `OPENAI_API_KEY` en tien daglichtbeelden is expliciet overgedragen aan een verse worker vanaf `main`. U46-slot gesloten; geen werk meer open in deze track.
