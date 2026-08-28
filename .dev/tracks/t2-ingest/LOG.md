# Track T2 — ingest

## 2026-08-28T16:00:00Z — Start en contextopbouw

- Doel: live RTCOR-, nowcast- en AROME-neerslag omzetten naar het gedeelde grid, mrf-chunks en een atomair manifest, plus lokale Caddy-serving.
- Gelezen: trackspecificatie, `AGENTS.md`, MIP-1 §3/§5 + changelog, MIP-2, MIP-3 §3/§5, `docs/contract.md`, `docs/arome.md`, `docs/mrf.md` en het actuele projectlog.
- Omgeving: `.envrc` is toegestaan en door direnv geladen; opdrachten worden via `direnv exec .` uitgevoerd. De API-sleutels blijven uitsluitend in het ongecommitteerde `.env`.
- Besluit: deze trackspecificatie noemt het log expliciet gecommit; dat is specifieker dan de generieke voorkeur voor een genegeerd taaklog en wordt daarom gevolgd.
- Huidige stap: bestaande crate-API's en KNMI live API/HDF5-structuren inventariseren; daarna gedeeld grid en indexmaps vastleggen.

## 2026-08-28T15:52:00Z — Live radarstructuur, fixtures en grid

- Live API met geregistreerde sleutel: RTCOR 5-min-bestand 122.318 bytes, nowcast 1.264.416 bytes; AROME-run 867.368.960 bytes en uurpublicatie bevestigd.
- HDF5 vastgesteld: RTCOR heeft drie `imageN`-groepen (regen, quality, adjustment), nowcast 25 regengroepen; `uint16`, calibratie `0,01*PV`, maskers 65534/65535, vijfminutenaccumulatie dus ×12 naar mm/u. Volledige bevindingen staan in `docs/radar.md`.
- `crates/knmi-hdf5` plus onafhankelijke h5py-exporter en echte 4×5-minifixtures toegevoegd. Nowcast cross-check is groen; RTCOR-test legde terecht de niet-neerslaggroepen bloot en wordt op parameterselectie afgerond.
- Definitief gedeeld grid gekozen: EPSG:3857, 650×700 op 1 km, extent x=250–900 km/y=7200–6500 km. Dit is NL met ruime marge en valt volledig binnen beide bronrasters. Rust-indexmaps rekenen projectie één keer uit en maken frames daarna gathers; details in `docs/grid.md`.
- Omgevingsmuur: `direnv exec .` is geblokkeerd. `devenv shell` probeerde te evalueren maar kon tijdelijk `cache.nixos.org` niet resolven en gaf ondanks de mislukking exit 0. Voor tussentests is daarom een reeds gerealiseerd devenv-profiel expliciet gebruikt; finale receipts wachten op herstelde direnv-activatie.
- Volgende stap: grid/HDF5-tests groen maken, coherent eerste commit publiceren, daarna ranged-tar-meting en daemon.

## 2026-08-28T15:56:00Z — Eerste mijlpaal groen

- RTCOR- en nowcast-minifixtures stemmen voor metadata, tijden, maskers en alle float32-cellen exact overeen tussen Rust en h5py.
- Gedeelde-gridtests bevestigen de KNMI-hoekcoördinaten tegen de eigen stereografische formule en nul buitenbereikcellen voor radar en AROME.
- Synchrone receipts (exit 0): `cargo clippy -p knmi-hdf5 -p motregen-ingest --all-targets -- -D warnings`; `cargo test -p knmi-hdf5 -p motregen-ingest`; `git diff --check`. Tijdelijk uitgevoerd met het reeds gerealiseerde devenv-profiel wegens de eerder genoemde direnv-blokkade.
- Fixturehygiëne voor `knmi-grib`: ontbreekt de 1,2-GB-conformancesample, dan meldt de test luid `SKIP` en slaagt; is hij aanwezig, dan blijft de volledige elementvergelijking lopen.
- Volgende stap: eerste commit + draft-PR, daarna AROME Range-onderzoek.

## 2026-08-28T16:16:00Z — Ranged tar en live smoke end-to-end

- Draft-PR-publicatie geprobeerd na commit `ba555ff`; `git push` faalde door tijdelijke DNS-fout `Could not resolve host: github.com`. Niet geforceerd/herhaald in een krappe lus; opnieuw proberen bij de volgende mijlpaal.
- Presigned S3-URL bevestigt `206`, `Accept-Ranges: bytes` en exacte `Content-Range`. `HEAD` geeft 403 omdat alleen GET is getekend; de daemon gebruikt daarom GET-probes.
- Werkelijke tar-layout: elk GRIB-lid heeft een PAX-header; één probe van 1536 bytes volstaat voor PAX + echte header. De leden staan niet numeriek (`+0`, daarna `+5`, …), dus de indexer scant unieke leden tot de volledige gewenste leadset gevonden is. Checksums, ustar/type, namen en groottes worden gecontroleerd.
- Synchrone live smoke (exit 0): `target/release/motregen-ingest --once --history-hours 1 --arome-hours 1 --data-dir data/t2-smoke`. Uitvoer: 12 RTCOR-frames, 25 nowcastframes, één AROME-uur; AROME haalde 26.207.514 bytes voor +0/+1 in 2,32 s; drie mrf-chunks en `manifest.json` atomair gepubliceerd.
- De rooktest vond en corrigeerde twee echte schema-afwijkingen: API-bestandsgrootte kan een JSON-string zijn; live HDF5 fixed-ASCII-attributen zijn één byte langer dan de h5py-crop door afsluitende NUL. De decoder converteert nu veilig naar een ruime fixed-ASCII-buffer.
- Caddy toegevoegd aan devenv; `Caddyfile.dev` serveert uitsluitend manifest/chunks op :8080 met MIP-3-headers. Repro: `MOTREGEN_DATA_DIR=$PWD/data caddy run --config Caddyfile.dev`.
- Volgende stap: volledige +24h live daemon ≥20 minuten, inspect/contract/cel-cross-check, gates en draft-PR.

## 2026-08-28T16:44:00Z — T2 compleet en eindreceipts

- Draft-PR geopend: https://github.com/mathijshenquet/motregen/pull/5. Eerste push/PR-pogingen raakten de intermitterende DNS-storing; latere pogingen slaagden zonder geschiedenis te herschrijven.
- Volledige timed live-run: `target/release/motregen-ingest --run-for 20m --data-dir data/t2-e2e` onder `bash -c 'set -o pipefail; … | tee data/t2-e2e-daemon.log'`. Startup 16:16:43Z, volledige publicatie 16:18:56Z; daarna 1.223 s gepolld en schoon gestopt om 16:39:20Z. Vier post-start nowcast-refreshes gepubliceerd (`1620`, `1625`, `1630`, `1635`), dus ruim boven de gate van twee. Geen bron- of publicatiefouten in het log.
- Eerste volledige AROME Range-run: 24 regenframes uit +0…+24, 352.864.390 bytes gedownload tegenover 867.368.960 bytes volledige tar, decode+reproject+mrf in 39,26 s. De finale exacte-code-run pakte de inmiddels verschenen run `2026082814`, 352.818.640 bytes, en publiceerde +1…+24.
- Synchrone exit-0 op de finale binary, waarbij `.env` automatisch werd gelezen: `target/release/motregen-ingest --once --data-dir data/t2-e2e`; expliciete uitvoer `daemon_exit=0`. Resultaat: 36 RTCOR-, 25 nowcast- en 24 AROME-frames, drie run+horizon-gestempelde immutable chunks en een atomair manifest.
- Manifestreceipt (exit 0): `uv run --project spec spec/validate_manifest.py data/t2-e2e` → drie bronnen, één EPSG:3857-grid van 650×700, headerlengtes/provenance/tijden/offsets/payloadlengtes/quanttabel geldig.
- mrf-receipt (exit 0): `target/release/mrf inspect data/t2-e2e/chunks/harmonie-20260828T1400-h24.mrf`; 24 onafhankelijke frames, offsets aaneengesloten, `dict=null`, tijden 2026-08-28T15:00Z…2026-08-29T14:00Z.
- RTCOR Python-spotcheck (exit 0): laatste frame `2026-08-28T16:35:00Z` met `mrf decode` uitgepakt en via `spec/spot_check_rtcor.py` onafhankelijk met h5py+pyproj herberekend; alle 455.000 cellen binnen één lokale kwantisatiestap, maxfout 0,997731 mm/u, no-data-masker gelijk.
- Caddyreceipt: `devenv shell -- caddy validate --config Caddyfile.dev` groen. Live op :8080: manifest `200` met ETag, CORS en `max-age=15`; 8-byte chunkrange `206`, `Content-Range` exact, immutable-jaarcache en bytes `mrf0…`; `.ingest-cache/*` gaf `404`. Server daarna met SIGINT schoon exit 0.
- Finale gates, alle synchroon exit 0 in de gerealiseerde devenv: `devenv shell -- cargo fmt --check`; `devenv shell -- cargo clippy --all-targets -- -D warnings`; `devenv shell -- cargo test`; `uv run --project spec --with pyright pyright spec/export_fixture.py spec/radar_reference.py spec/spot_check_rtcor.py spec/validate_manifest.py` (0 errors); `git diff --check`.
- Fixturehygiëne apart zichtbaar gemaakt: `devenv shell -- cargo test -p knmi-grib --test conformance -- --nocapture` meldt luid `SKIP: missing full KNMI GRIB conformance sample …`; exit 0. Met de sample aanwezig blijft de oorspronkelijke volledige test lopen.
- Enige omgevingsmuur: deze worktree-`.envrc` bleef volgens `direnv exec .` geblokkeerd ondanks eerdere statusoutput. De gebruiker is direct gevraagd `direnv allow` te doen. Alle finale bouw-/test-/Caddyreceipts draaiden daarom expliciet via `devenv shell`, dat na tijdelijke DNS-storingen volledig realiseerde (Caddy 2.11.4).
