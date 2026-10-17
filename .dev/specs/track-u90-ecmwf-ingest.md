# U90 — ECMWF-dagverwachting ingest (MIP-36 C)

Eigenaar: worker `u90-ecmwf-ingest`. Orkestrator: Claude. Branch `track/u90-tien-dagen` (deze worktree).
Track-LOG `.dev/tracks/u90-ecmwf-ingest/LOG.md`: append-only, tijd altijd uit `date`, lokale tijd is UTC+2.
**Slice**: geen e2e. Draai `cargo test -p motregen-ingest` en de tests die je toevoegt. Daarna de NixOS-test
`nix build -L .#checks.x86_64-linux.nixos-vm`, synchroon; noteer de exitstatus letterlijk. Commit en push elke
15–20 minuten. **Geen prod-acties.** Code-stijl: leesbare namen, geen slimme one-liners, commentaar alleen voor een
niet-voor-de-hand-liggend waarom.

Lees eerst:
- `.dev/proposals/0036-tien-dagen-vooruit-ecmwf.md` (sectie 2 en C);
- `docs/pollen.md` en `crates/ingest/src/cams.rs` + `src/bin/motregen-cams.rs`: dit is het patroon dat je
  volgt, met de oneshot, de sidecar-json en de manifestopname in `main.rs`;
- `docs/mrf.md` en `docs/contract.md`.

## Wat je bouwt

1. **`crates/ingest/src/ecmwf.rs` en een bin `motregen-ecmwf`.**
   - **Run kiezen**: de nieuwste 00z- of 12z-run van `https://data.ecmwf.int/forecasts/YYYYMMDD/HHz/ifs/0p25/`
     waarvan zowel `oper` (+240 u) als `enfo/…-240h-enfo-ep.index` bestaan.
   - **Ophalen**: lees per stap de `.index` (JSON-regels met `param`, `_offset`, `_length`) en haal alleen de
     benodigde berichten op met HTTP-range: `tp`, `mx2t3`/`mx2t6`, `mn2t3`/`mn2t6`, `10u`, `10v`, `10fg3`/`10fg`
     en `tcc`. Stappen: 3-uurlijks tot 144, daarna 6-uurlijks tot 240. Uit `enfo-ep` alleen `tpg1` en `tpg5`.
   - **Grenzen**: maximaal 4 verzoeken tegelijk, met herhaalpogingen. Bewaar de ruwe range-bestanden in een
     cache, zodat een herstart niet opnieuw alles ophaalt.
   - **Decoderen**: met de bestaande `eccodes`-binding. Let op: het is GRIB2 (CCSDS), niet het GRIB1 van KNMI.
     Ik heb geverifieerd dat `grib_ls` uit de devenv het leest; bevestig dat de Rust-binding dat ook kan.
   - **Rooster**: het 0,25°-rooster van de MRF-uitsnede boven NL plus een marge. Neem de bbox van CAMS of het
     HARMONIE-domein; kies en motiveer in de LOG.
2. **Dagaggregatie per lokale kalenderdag (Europe/Amsterdam)**, tot en met de laatste dag die de stappen volledig
   dekken. Gebruik de velden en definities uit de tabel in MIP-36 C2.
   - `tp`, `mx2t*`, `mn2t*` en `10fg*` zijn geaccumuleerd of "sinds de vorige postprocessing-stap". Lees de
     `stepRange` en tel geen interval dubbel.
   - Voor `day_precip_prob` kies je het `tpg1`-venster waarvan het midden het dichtst bij het midden van de
     lokale dag ligt. Doe hetzelfde voor `day_precip_prob5` uit `tpg5`.
   - **Unit-tests**: de zomertijd- en de wintertijdwissel; de overgang van stap 144 naar 150 (3 u naar 6 u); een
     run van 12z (de eerste dag is dan onvolledig en wordt weggelaten); en de-accumulatie van `tp`.
3. **Publicatie**: per veld één MRF-chunk met één frame per dag. Gebruik de quantisatie in de stijl van de
   bestaande velden en documenteer de keuze. Schrijf `ecmwf.json` als sidecar, zoals `cams.json`. De ingest-daemon
   neemt hem op achter een vlag `MOTREGEN_ECMWF_IN_MANIFEST`, standaard uit, net als CAMS. Breid
   `docs/contract.md` uit met de nieuwe velden en hun `source: "ecmwf"`.
4. **Nix**: `motregen-ecmwf.service` en een timer om 08:15 en 20:15 UTC, met `Persistent=true` en een
   herhaalpoging na 30 min als de run er nog niet is. Optie `ecmwfInManifest`. Breid de VM-test uit, zonder
   netwerk: de job mag daar niet draaien, maar de unit moet wel bestaan en de daemon moet een fixture-sidecar
   opnemen.
5. **Docs**: `docs/ecmwf.md`. Beschrijf de bron, de runs en de vertraging (zie MIP-36 2.3), het gemeten volume per
   run (zelf meten en noteren), de licentie (CC BY 4.0) en de dagdefinities.

## Receipts voor "klaar"

1. Een echte run lokaal gedraaid: `cargo run --release -p motregen-ingest --bin motregen-ecmwf -- --data-dir <tmp>`.
   Noteer in de LOG de exitstatus, de wandtijd en het aantal gedownloade bytes.
2. Een puntcontrole voor Utrecht (52,09 N 5,12 O): je `day_tmax_c` en `day_precip_mm` voor dag 3, tegenover
   `grib_ls -l 52.09,5.12,1` op de ruwe berichten. Vermeld de getallen in de LOG.
3. `cargo test -p motregen-ingest`, `cargo clippy` en de VM-test, elk met een letterlijke exitstatus.

Stop en meld het in de LOG bij een ontwerpvraag die niet in de MIP staat. Gok niet.
