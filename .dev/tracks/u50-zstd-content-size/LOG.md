# Track U50 — zstd content size

## 2026-10-07T10:06:28Z

- Track gestart vanaf `0ab7807` op `track/u50-zstd-content-size`; worktree was schoon.
- Specificatie, `AGENTS.md` en de actuele projectlog gelezen. De gevraagde U49-log ontbreekt in deze checkout, daarom zoek ik de meting in de bereikbare gitgeschiedenis en leg ik de concrete bron vast.
- `direnv status` toont dat deze nieuwe worktree nog niet is toegestaan; ik activeer de bestaande devenv expliciet voordat ik gates of metingen draai.

## 2026-10-07T10:09:32Z

- De encoder gebruikt nu één `compress_member`-helper met `zstd::bulk::compress` voor bitmap-, predictieve en motion-members; `COMPRESSION_LEVEL` blijft 19. `docs/mrf.md` legt de algemene pledged-content-size-regel vast in plaats van de oude pred-only/bitmap-uitzondering.
- Rusttest toegevoegd die elk bitmap- en motion-member in één MRF op bekende content size controleert en via de gerange-decode byte-identiek terugleest; de predictive test controleert nu ieder pred-member.
- Synchroon receipt: `direnv exec . cargo test -p mrf every_member_pledges_its_content_size_and_roundtrips` → exit 0 (1 test). Volgende stap: bestaande byte-exacte raw/motion-goldens vernieuwen en de volledige MRF-test draaien.

## 2026-10-07T10:12:01Z

- De twee bestaande byte-exacte MRF-goldens zijn herbouwd via hun oude header en gedecodeerde bytes; alleen de zelfstandige zstd-members veranderen, het chunk-contract en de gedecodeerde payload blijven gelijk.
- Synchrone receipts: `direnv exec . cargo fmt` → exit 0; `direnv exec . cargo test -p mrf` → exit 0 (5 unit + 16 integratie-tests); `git diff --check` → exit 0.
- De eerste coherente commit omvat encoder, tests, vernieuwde goldens, documentatie en deze log. Daarna open ik direct de draft-PR; browser- en twee-ingestmetingen blijven als vervolgstap open.

## 2026-10-07T10:16:35Z

- Commit `c71eae9` gepusht op `track/u50-zstd-content-size`; draft-PR: https://github.com/mathijshenquet/motregen/pull/76. De beschrijving markeert ingestvergelijking, echte-chunkbenchmark en overige gates eerlijk als open.
- `web/scripts/bench-zstd-content-size.ts` toegevoegd: leest een lokaal manifest en vier echte MRF-members (`rain_rate`, `temp_c`, `wind_u_ms`, `cloud_low`), decodeert elk eerste member 50× met `fzstd` en print membergrootte, uitvoerlengte en p50. Synchroon proefreceipt op de bestaande datamap: `direnv exec . pnpm --dir web exec tsx scripts/bench-zstd-content-size.ts public/data` → exit 0; alle vier velden gevonden en 50× gedecodeerd.
- `docs/ingest.md` noemt inmiddels een ambigue `cargo run --release -p motregen-ingest`: door de tweede binary faalt die vorm synchroon met exit 101. De geldige meetvorm is `cargo run --release -p motregen-ingest --bin motregen-ingest -- …`; ik corrigeer die documentatie samen met de meetuitvoer.

## 2026-10-07T10:29:53Z

- **Zelfde invoer, twee ingest-builds.** Voor = tijdelijke detached worktree op `c71eae9^` (`0ab7807`); na = deze branch. Beide draaien beperkt maar volledig door de ingest: `--once --history-hours 1 --nowcast-minutes 5 --arome-hours 1 --arome-history-hours 0`. De na-map deelt uitsluitend de downloadcache van voor en houdt eigen chunks. De eerste twee runs kruisten een nieuwe vijfminuten-RTCOR-publicatie (10:15 → 10:20); de dual-benchmark weigerde daarom met exit 1 een niet-byte-gelijke regenframevergelijking. De voor-run is daarna op de gedeelde 10:20-cache herhaald. Daarmee zijn alle vier gemeten eerste frames byte-identiek na decode; alleen hun zstd-members verschillen.
- Synchrone ingest-receipts: `RUST_LOG=warn direnv exec . bash -c 'cd /tmp/motregen-u50-before.VIac6I && cargo run --release -p motregen-ingest --bin motregen-ingest -- --once --data-dir /tmp/motregen-u50-before-data --history-hours 1 --nowcast-minutes 5 --arome-hours 1 --arome-history-hours 0 --cache-age 24h'` → exit 0; `RUST_LOG=warn direnv exec . cargo run --release -p motregen-ingest --bin motregen-ingest -- --once --data-dir /tmp/motregen-u50-after-data.nOFYyt --history-hours 1 --nowcast-minutes 5 --arome-hours 1 --arome-history-hours 0 --cache-age 24h` → exit 0. De voor-run die de 10:20-vergelijking vastzet, eindigde ook synchroon met exit 0.
- **fzstd-metingen (één CPU, 10 warm-up + 50 metingen per eerste member, voor/na afgewisseld):** `taskset -c 0 direnv exec . pnpm --dir web exec tsx scripts/bench-zstd-content-size.ts /tmp/motregen-u50-before-data /tmp/motregen-u50-after-data.nOFYyt` → exit 0.

  | veld | member B voor → na | uit B | p50 ms voor → na | sneller |
  | --- | ---: | ---: | ---: | ---: |
  | regen | 40.570 → 40.573 | 1.687.500 | 4,689 → 2,013 | 2,33× |
  | temperatuur | 13.371 → 13.570 | 47.025 | 0,901 → 0,208 | 4,33× |
  | wind | 18.807 → 18.910 | 47.025 | 1,186 → 0,266 | 4,47× |
  | wolken | 1.378 → 1.379 | 6.715 | 0,609 → 0,035 | 17,57× |

- De meting reproduceert de U49-richting en bijna diens afgeronde factoren (U49: 2,2–2,5× regen, 4,5–5× temperatuur/wind, ~20× wolken); de verschillen van 4–12 % zijn binnen de p50-ruis van deze gedeelde host. De zstd-header is geen contractwijziging: de decoder bevestigt dezelfde bytes.
- `docs/ingest.md` gebruikt nu expliciet `--bin motregen-ingest`, want de oorspronkelijke vorm kan door de tweede binary niet meer starten.

## 2026-10-07T10:34:50Z

- **Slotgates op `70bffaa` (allemaal synchroon):** `direnv exec . cargo fmt --check` → exit 0; `direnv exec . cargo clippy` → exit 0; `direnv exec . cargo test -p mrf` → exit 0 (5 unit + 16 integratie); `direnv exec . cargo test -p motregen-ingest` → exit 0 (35 lib + 4 binary-tests); `direnv exec . nix flake check` → exit 0 (alle 21 checks, inclusief NixOS-VM); `direnv exec . pnpm typecheck` → exit 0; `direnv exec . pnpm test` → exit 0 (366 web + 10 bot); `direnv exec . pnpm build` → exit 0.
- De eerste `pnpm test`-receipt was exit 1 vóór het uitvoeren van de normale fixturevoorbereiding: verse worktree mistte het genegeerde `web/public/data/chunks/uv_clear-20260828.mrf`, zodat alleen `mrf.test.ts` niet kon laden (343 tests waren al groen). Synchroon herstel: `direnv exec . pnpm --dir web synthgen` → exit 0 (849 frames, 44 chunks); de herhaalde volledige test hierboven is daarna groen. Het gegenereerde bestand en de build-output zijn genegeerd; `git status --short --branch` was daarna schoon.
- Eindstaat: twee commits (`c71eae9`, `70bffaa`) gepusht op de draft-PR; geen chunk-contract-, client- of andere-cratewijziging.

## 2026-10-07T10:39:21Z — slot

- U50 is gemerged op `main` als `9bf082f53ebfd96d9b2cf18a5ffac9d8c0eeec0f` (`merge track/u50-zstd-content-size`).
- Onafhankelijke gate na merge: fmt en clippy exit 0, MRF-tests groen, web 377/377, `nix flake check` exit 0. De drie `knmi-hdf5`-cross-checks falen ook op `main` door de uv/pysteps-bouwfout onder Python 3.14 en vallen buiten deze track.
- Track afgerond.
