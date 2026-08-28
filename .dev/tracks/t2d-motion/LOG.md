# Track T2d — motion-schatter + annex

## 2026-08-28T19:56:01Z — Start en contextopbouw

- Doel: een grove Rust-motion-schatter bouwen, motion-annexen contractconform in mrf ondersteunen en `rain_rate` van RTCOR, nowcast en AROME ermee publiceren.
- Gelezen: `AGENTS.md`, de trackspecificatie, `docs/contract.md`, `docs/grid.md` en het T2c-tracklog. Het verplichte T2d-log bestond nog niet; het T2b-log is volgens het T2c-log bewust genegeerd en niet in git beschikbaar, dus de relevante context wordt uit de gemergde code en geschiedenis herleid.
- Omgeving: branch `track/t2d-motion` is schoon op de merge van T2c; direnv is toegestaan en de devenv is actief. Sleutels blijven uitsluitend in `.env`.
- Besluit: dit track krijgt een eigen `crates/motion`, omdat de schatter een los, deterministisch domeinonderdeel is dat zonder netwerk, brondecoders of publicatiecode unit- en referentiegetest moet kunnen worden.
- Huidige stap: MIP-5 en de bestaande mrf-/publisher-architectuur volledig inventariseren, daarna eerst het annexformaat en de schatter implementeren.

## 2026-08-28T20:06:38Z — Schatter, annex en generatie-incident

- Nieuwe losse crate `motion`: 32×32-blokkruiscorrelatie rond een globale advection seed, gevolgd door 3×3-mediaan-uitbijterdemping, maximaal vier buur-erfringen en 3×3-smoothing. Volledig droge gebieden blijven `(-128,-128)`; kleine signaalgaten erven geldige buren. Een synthetische translatie-unit test herkent 5 oost/3 noord-cellen over 5 minuten binnen 0,1 cel/min.
- `mrf` ondersteunt nu optionele `motion_grid`/motion-members in encoder, volledige decoder en ranged decoder. Annexen zijn eigen zstd-members na alle beeldmembers; lengte, offsets en gekoppelde no-data-componenten worden gevalideerd. `mrf inspect` toont aanwezigheid en `mrf dump-motion` schrijft ruwe i8-paren. De bestaande canonical fixture decodeert annexvrij en encodeert nog byte-identiek.
- Alleen RTCOR-, nowcast- en HARMONIE-`rain_rate`-chunks gebruiken `encode_with_motion`; alle andere velden bewijzen in een integratietest het oude annexvrije pad. `docs/motion.md` legt de schatter, buurregel en de onafhankelijke pySTEPS-acceptatiemaat vast; `spec/motion_reference.py` typecheckt groen.
- Productiesteer verwerkt: alle chunknamen krijgen een stabiele 64-bit generatiesuffix over formatgeneratie + veld + volledig grid + volledige quanttabel. Grid- en quantwijzigingen wijzigen de naam automatisch; containerlayoutwijzigingen vereisen een bump. De bestaande immutable-collisionguard blijft hard falen. De regressietest bewijst stabiliteit en verandering voor zowel grid als quant.
- Tussenreceipts, synchroon exit 0: `devenv shell -- cargo test -p motion -p mrf`; gerichte ingesttests voor rain-annex en chunkgeneratie; `devenv shell -- uv run --project spec --with pyright pyright spec/motion_reference.py`; `git diff --check`.
- Volgende stap: motion-golden fixture vastpinnen, echte daemonrun uitvoeren, annexgrootte meten en dezelfde echte frameparen met pySTEPS vergelijken.

## 2026-08-28T20:20:00Z — Live e2e en pySTEPS-correctie

- Eerste live run (exit 0) publiceerde 12 RTCOR-, 3 nowcast- en 2 HARMONIE-regenframes met 40×43-motiongrid plus de acht annexvrije nevenvelden. De eerste pySTEPS-checks waren RTCOR 0,472 en nowcast 0,764 cel/min, maar HARMONIE faalde eerlijk op 2,022: de intensiteitszwaartepunt-seed wees door groei/uitdoving vrijwel tegengesteld aan Lucas-Kanade.
- Correctie: de globale seed is nu zelf genormaliseerde kruiscorrelatie op een 16× verkleind veld (±128 cellen bereik), gevolgd door de bestaande lokale blokkruiscorrelatie ±8 cellen. De vaste acceptatiegrens is niet versoepeld. Een tweede live run naar `data/t2d-e2e-v2` eindigde synchroon met `daemon_v2_exit=0`; RTCOR 12f, nowcast 3f, HARMONIE 2f en alle negen velden zijn gepubliceerd.
- Onafhankelijke checks op framepaar 0→1 van iedere bron zijn nu groen: RTCOR 226 signaalblokken/mediaan 0,512/p90 0,757 cel/min; nowcast 202/0,793/0,960; HARMONIE 879/0,273/1,352. Quiver-artefacten: `rtcor-quiver.png`, `nowcast-quiver.png`, `harmonie-quiver.png` naast dit log.
- `mrf inspect` bevestigt voor alle drie 40×43 en motion op ieder frame na frame 0. Gecomprimeerde annexmeting: RTCOR 11 leden, totaal 7.945 B, gemiddeld 722,3 B (658–775); nowcast 2, totaal 969 B, gemiddeld 484,5 B (434–535); HARMONIE 1×556 B. Ruwe `mrf dump-motion` is exact 3.440 B. De werkelijke annexen blijven dus onder de verwachte circa 1 kB per frame.
- De onafhankelijke manifestvalidator is annexbewust gemaakt (motion-grid, eerste-frame-regel, aaneengesloten offsets en payload-einde) en valideert de live manifest met 11 chunks, 4 bronnen, 9 velden en 3 grids. pyright is groen voor zowel validator als motionreferentie.
- Huidige stap: volledige fmt/clippy/test/pyright-gates draaien, diff reviewen en deze live follow-up committen. GitHub-push van de eerste commit is nog niet gelukt door tijdelijke DNS-resolutie naar github.com; opnieuw proberen na de gates.

## 2026-08-28T20:24:20Z — Finale gates en reviewpublicatie

- De globale kruiscorrelatiecorrectie heeft nu een regressietest met 48×32-cellen uurverplaatsing (ruim buiten de lokale zoekradius); de buur-erfregel heeft een directe unit test. De mrf-CLI-test bewijst zowel motion-zichtbaarheid in `inspect` als byte-exacte `dump-motion`-uitvoer.
- Finale workspacegates, synchroon exit 0: `devenv shell -- cargo fmt --check`; `devenv shell -- cargo clippy --all-targets -- -D warnings`; `devenv shell -- cargo test` (alle Rust-unit-, integratie-, property- en doctests); `devenv shell -- uv lock --check --project spec`; `devenv shell -- uv run --project spec --with pyright pyright spec/export_fixture.py spec/motion_reference.py spec/radar_reference.py spec/spot_check_arome_fields.py spec/spot_check_rtcor.py spec/spot_check_uv.py spec/validate_manifest.py` (0 fouten); `devenv shell -- uv run --project spec spec/validate_manifest.py data/t2d-e2e-v2`; `git diff --check`.
- Live repro: `devenv shell -- bash -c 'set -o pipefail; RUST_LOG=info cargo run --release -p motregen-ingest -- --once --history-hours 1 --nowcast-minutes 10 --arome-hours 2 --data-dir data/t2d-e2e-v2 2>&1 | tee /tmp/motregen-t2d-daemon-v2.log; daemon_status=${PIPESTATUS[0]}; printf "daemon_v2_exit=%s\\n" "$daemon_status"; exit "$daemon_status"'` → `daemon_v2_exit=0`.
- pySTEPS-repro per live chunk: `devenv shell -- uv run --project spec spec/motion_reference.py <chunk> 1 --output .dev/tracks/t2d-motion/<source>-quiver.png`; uitgevoerd voor RTCOR, nowcast en HARMONIE met bovengenoemde groene medianen. CLI-repro: `devenv shell -- cargo run --release -q -p mrf -- inspect <chunk>` en `... dump-motion <chunk> 1 --output <pad>`.
- Eerste commit `c6aa523` staat op de remote; draft PR: https://github.com/mathijshenquet/motregen/pull/11. Huidige stap: live correctie, validator, dependencies, artefacten en dit log als follow-up commit publiceren en de PR-beschrijving definitief maken.

## 2026-08-28T20:27:00Z — Gepubliceerd voor review

- Follow-upcommit met de live gecorrigeerde schatter, drie quiver-artefacten, annexbewuste validator en finale receipts is gepubliceerd op `track/t2d-motion`.
- Draft PR #11 is bijgewerkt met de live bron-/frametellingen, pySTEPS-medianen, gemeten annexgroottes en alle groene gates: https://github.com/mathijshenquet/motregen/pull/11.
- Geen open implementatie-items in T2d; onafhankelijke her-run en review volgen vóór merge volgens de trackspecificatie.
