# U82 — bewegingsvectoren zonder windprior (ingest)

Eigenaar: worker `u82-motion-zonder-wind` (gpt-6.1-sol). Orkestrator: Claude (PM-rol voor deze track).
Branch `track/u82-motion-zonder-wind`, afgetakt van `origin/repro/regenbeweging` (bevat de reproductierig).
Track-LOG: `.dev/tracks/u82-motion-zonder-wind/LOG.md` in je worktree (append-only, met tijd uit `date`; git-ignored
`.dev/tracks/` is de projectconventie — controleer met `git check-ignore`). Werk het bij na elke stap.

## Het probleem (door de orkestrator gereproduceerd op 2026-10-16)
PO: "De regenvelden bewegen soms vrij non-lineair over het scherm, waarschijnlijk in de geëxtrapoleerde frames …
tussen 8:00 en 9:00 tussen de Noordzee ter hoogte van Amsterdam en Texel". Twee lichte drijvers boven zee
(≈ 3,97°E 53,06°N en 3,85°E 52,89°N) vallen halverwege elk interval van 5 minuten in twee lobben uiteen en springen
dan terug.

Bevroren snapshot: `~/motregen-profiles/data-snapshots/2026-10-16-0810/` (manifest + alle chunks van prod om 06:07Z,
plus `raw/` met de KNMI-bestanden rtcor/nowcast en de twee laatste seamless). Lees `repro`-commit 282ee81 voor de rig.

Gevonden oorzaak (de orkestrator heeft dit gemeten, controleer het zelf voordat je bouwt):
1. De KNMI-nowcast verschuift de regen daar eenparig (+5 oost, −3 rij) cellen per 5 min (1 cel = 1 km EPSG:3857).
2. `motion::correlate` meet dat goed waar het iets vindt (+4/+5, −3, vertrouwen ≈ 0,9).
3. De opgeslagen annex (`motion::blend_with_wind`, sinds 823ef8c, 2026-08-31) geeft daar (+1…+2,5, −7…−8): de 300 m-
   HARMONIE-windprior domineert, want bij motregen hebben de meeste blokken geen correlatie; `smooth` trekt ook de
   sterke blokken mee. De per-run kalibratie (`motion::calibrate`) is onbruikbaar: de rotatie zit deze week in ruim
   een derde van de runs tegen de klem (±60°) en springt verder alle kanten op (prod-journal `motion wind calibration`).
4. `motion::estimate` (zonder wind: `damp_outliers` → `inherit_empty` → `smooth`) geeft op dezelfde blokken (+5, −3).
   Zie `cargo run -p motregen-ingest --example motion_probe -- <chunk> 4 12 15 17 21`.
5. De app-kant is in orde: met `?geenwarp` (alleen op de repro-branch) loopt de drijver vloeiend; de warpformule op de
   CPU nagerekend (`web/scripts/rain-warp-sim.ts`) geeft met correcte vectoren een eenparige baan.

## Opdracht
1. **Windprior uit de annex** voor rtcor, nowcast en seamless: lege blokken krijgen hun vector uit de eigen
   correlatie van die run (wat `estimate` al doet: erven van buren), niet uit wind. Sterke correlatieblokken
   (vertrouwen ≥ `STRONG_CONFIDENCE`) mogen door het gladmaken niet wezenlijk verschuiven; laat met een test zien dat
   een eenparig veld met een paar sterke blokken in een verder leeg raster overal die snelheid krijgt.
2. **HARMONIE (`arome`)**: zelfde vraag, maar met uurframes zijn de verplaatsingen groot. Meet op de snapshot
   (`harmonie`-chunk) of de annex daar met of zonder wind beter overeenkomt met de werkelijke verschuiving tussen
   opeenvolgende uren (zelfde meetmethode als `web/scripts/motion-vs-displacement.ts`, die met
   `signedView` de byteOffset respecteert — let daarop, de orkestrator struikelde erover). Kies op bewijs en zeg het.
3. **Wind niet weggooien zonder spoor**: laat de kalibratiecode staan als ze nog ergens gebruikt wordt; anders weg.
   Logregel blijft bruikbaar als diagnose of verdwijnt mee. Geen nieuwe configuratieknop tenzij nodig; motiveer.
   De root cause van de slechte 300 m-wind is een aparte vraag: noteer wat je tegenkomt, los het niet op.
4. **Snapshot opnieuw coderen**: een klein hulpprogramma (bijv. `crates/ingest/examples/reencode_motion.rs`) dat
   een bestaande regenchunk inleest en een nieuwe schrijft met dezelfde frames en de nieuwe motion-annex (zelfde
   bestandsnaam/manifest blijft geldig als header_len gelijk blijft; anders schrijf je een aangepast manifest naast).
   Lever `~/motregen-profiles/data-snapshots/2026-10-16-0810-u82/` (kopie, origineel onaangeroerd).
5. **Bewijs met de rig** (alles in `web/`):
   - `scripts/snapshot-serve.sh <snapshot> <app-poort> <data-poort>` (bouw eerst `pnpm build`; vrije poorten:
     app 4399, data 8397), dan `scripts/rain-motion-strip.ts http://localhost:4399 tmp/<map> 2026-10-16T06:15:00Z
     2026-10-16T06:40:00Z 0.5 4.2 53.0 9` en `uv run --with numpy --with pillow python -I scripts/rain-comoving.py
     tmp/<map> tmp/<uit>.png 3.97 53.06` (en 3.85 52.89). Voor/na naast elkaar; de zaagtand (±15 px, massapuls
     40–50 %) moet weg zijn. Bekijk de vellen zelf.
   - `motion-vs-displacement.ts` voor rtcor, nowcast en seamless vóór/na: tabel in de LOG.
6. **Gate** (synchrone exitstatus, `; echo EXIT: $?`): `cargo fmt --all --check`, `cargo clippy --workspace
   --all-targets -- -D warnings`, `cargo test -p motion -p motregen-ingest -p mrf`, `nix flake check --no-build`,
   `nix build .#nixosConfigurations.motregen.config.system.build.toplevel`. Exacte reproduceercommando's in de LOG.

## Afbakening en bar
Alleen de ingest/motion-crate (+ het hulpprogramma). Geen app-wijziging; de repro-haken in `web/src/App.tsx` horen
bij de rig en gaan niet naar main (de orkestrator haalt ze eruit bij de integratie). Leesbaarheid: geen één-letter-
namen, geen slimme one-liners, commentaar alleen voor het niet-vanzelfsprekende waarom. Commit elke 15–20 minuten,
push, en wacht binnen je turn op je eigen gates. Een eerlijke "dit klopt niet, want…" is evenveel waard als groen.
Geen prod-acties. Meld **"U82 klaar"** met head-sha, de voor/na-tabel en de paden van de vellen.
