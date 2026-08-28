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
