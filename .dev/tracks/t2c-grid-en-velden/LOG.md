# Track T2c — ruimer grid + humidity/bewolking

## 2026-08-28T20:00:00Z — Start en contextopbouw

- Doel: het gedeelde radargrid verruimen en AROME-velden `rel_humidity` en `cloud_frac` contractconform publiceren, met onafhankelijke Python-controles en een live e2e-receipt.
- Gelezen: `AGENTS.md`, het actuele `.dev/LOG.md`, MIP-4 ronde-4-amendement, `docs/contract.md`, `docs/grid.md`, `docs/arome.md`, `docs/fields.md`, T2-log en het T2b-log uit diens worktree (dit tracklog is daar bewust genegeerd en dus niet in git beschikbaar).
- Omgeving: `.envrc` is in deze nieuwe worktree nog niet door direnv toegestaan; de aanwezige devenv wordt expliciet via `devenv shell -- …` gebruikt. Sleutels blijven uitsluitend in het ongecommitteerde `.env`.
- Besluit: deze trackspecificatie eist expliciet dat dit log wordt gecommit; die specifieke instructie geldt boven de globale log-uitzondering.
- Huidige stap: radar-footprint en de nog niet gedocumenteerde AROME-bewolkingsparameter op echte brondata vaststellen; daarna constants, indexmaps, velden en controles coherent wijzigen.

## 2026-08-28T20:08:00Z — Bronmetingen en gridbesluit

- Werkelijke RTCOR-HDF5-metadata bevestigt het 700×765 stereografische raster (`x=0…700 km`, `y=−3650…−4415 km`). Een dichte EPSG:3857-transformatie van alle 535.500 broncelcentra geeft `x=0,7…1.207.526,2 m`, `y=6.257.933,1…7.552.278,8 m`; het oude raster bevat slechts 185.575 cellen (34,65%), dus 349.925 (65,35%) bruikbare broncellen vallen weg.
- Besluit: gedeeld raster wordt `x=0…1.250 km`, `y=7.600…6.250 km`, 1.250×1.350 op 1 km. Dit neemt alle broncentra op met 7 km zuid-, 48 km noord-, circa 1 km west- en 42 km oostmarge. Afgeleide 2km- en 5km-grids blijven exact uitlijnd (625×675 respectievelijk 250×270), zodat elke chunktype dezelfde nieuwe extent heeft.
- Echte AROME +1-inspectie: tabel 253/parameter 71/sfc/instant is totale bewolkingsgraad, waarden 0,0000916…1,0; productieconversie is dus `×100` naar procent. Bestaande RH parameter 52 is eveneens fractie en wordt voor publicatie `×100`. Beide velden kosten geen extra ranged-downloadbytes.
- Volgende stap: decoder/pipeline/indexmaptests, Python-spotcheck en documentatie wijzigen; manifestvalidator krijgt expliciete percent-veldvalidatie.

## 2026-08-28T20:23:00Z — Implementatie en live-validatie

- `SHARED_GRID` is nu 1.250×1.350/1 km; de exact uitgelijnde `HOURLY_GRID` en `UV_GRID` zijn 625×675/2 km en 250×270/5 km. De gereviseerde gridtests bewijzen zowel de stereografische hoekformule als dat alle 535.500 radarbronindices door de target-grid worden gerepresenteerd; hoekresten buiten de gebogen footprint en AROME/UV-buitengebieden blijven no-data.
- AROME-decoder selecteert totale bewolking op tabel 253/param 71/sfc/instant. De publisher schrijft `rel_humidity` (param 52 ×100) en `cloud_frac` (param 71 ×100) op het 2km-grid met dezelfde lineaire 0…100%-tabel (stap 100/254). De bestaande relatieve vochtigheid blijft vóór de omzetting fractie voor de gevoelstemperatuurformule.
- Python-spotcheck is uitgebreid met beide nieuwe velden én vergelijkt na de grotere extent correct alleen bedekte AROME-cellen; het eist tegelijk exact no-data buiten AROME. Manifestvalidator herkent de percentvelden en valideert hun 0…100%-quanttabel.
- Volledige live +24h-publicatie naar `data/t2c-e2e` is gereed: 11 chunks, 9 contractvelden en 3 grids. Manifestvalidator meldt alle negen velden. De cfgrib-vergelijking op 401.875 bedekte cellen rapporteert maxfouten: temp 0,149994 °C, U-wind 0,124894 m/s, RH 0,196849% en bewolking 0,196846% (ieder binnen één kwantisatiestap); alle 20.000 onbedekte cellen zijn precies no-data. `mrf inspect` bevestigt beide nieuwe 625×675-chunks met 24 onafhankelijke frames en de 0…100%-tabel.
- Volgende stap: finale workspacegates, een korte synchrone daemonreceipt op de gevulde cache, diffreview en commit inclusief dit log.

## 2026-08-28T20:31:00Z — Eindreceipts en commitklaar

- Synchrone daemonreceipt (exit 0): `devenv shell -- bash -c 'set -o pipefail; RUST_LOG=warn target/release/motregen-ingest --once --history-hours 1 --nowcast-minutes 1 --arome-hours 1 --data-dir data/t2c-e2e; daemon_status=$?; printf "daemon_exit=%s\\n" "$daemon_status"; exit "$daemon_status"'` → `daemon_exit=0`. Cache was gevuld door de voorafgaande volledige +24h-run; manifest bevat daarna weer 11 chunks en alle negen velden.
- Synchrone inspect/validatiereceipts (exit 0): `devenv shell -- uv run --project spec spec/validate_manifest.py data/t2c-e2e`; `devenv shell -- uv run --project spec spec/spot_check_arome_fields.py data/t2c-e2e <cached +1 member>`; `devenv shell -- cargo run --release -p mrf -- inspect <rel_humidity chunk>`; idem voor `cloud_frac`. Inspect bevestigt 24 onafhankelijke 625×675-frames en `quant[0]=0`, `quant[254]=100`, `quant[255]=null` voor beide nieuwe velden.
- Finale workspacegates, synchroon exit 0: `devenv shell -- cargo fmt --check`; `devenv shell -- cargo clippy --all-targets -- -D warnings`; `devenv shell -- cargo test` (28 Rust-tests + doctests); `devenv shell -- uv run --project spec --with pyright pyright spec/export_fixture.py spec/radar_reference.py spec/spot_check_arome_fields.py spec/spot_check_rtcor.py spec/spot_check_uv.py spec/validate_manifest.py` (0 fouten); `git diff --check`.
- Huidige stap: coherente wijzigingen én dit verplichte tracklog committen; daarna branch- en upstreamstatus verifiëren.

## 2026-08-28T20:33:00Z — Gepubliceerd voor review

- De eerste publicatiecommit bevat implementatie, documentatie, validators én dit tracklog; de logaanvulling is vervolgens in dezelfde commit geamendeerd en met `--force-with-lease` bijgewerkt op de trackingbranch.
- Draft PR geopend conform projectconventie: https://github.com/mathijshenquet/motregen/pull/9. Beschrijving noemt de grid/veldenwijzigingen en alle groene/live verificatie.
