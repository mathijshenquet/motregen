# Track U4 — urenoverzicht: bereik, UV, zon, huidige tijd, regenkans (claude opus)

Read first: `AGENTS.md`, `docs/arome.md`, `docs/fields.md`, `docs/ingest.md`,
`docs/contract.md`, `web/src/core/forecast.ts`, `web/src/core/sun.ts`,
`web/src/core/solar.ts`, `web/src/core/uv.ts`, `web/src/App.tsx`
(`forecast-panel`), `crates/ingest/src/pipeline.rs` (harmonie-chunks,
`horizon_hours`), `crates/ingest/src/main.rs` (`history_hours`, prune).
Your LOG: `.dev/tracks/u4-urenoverzicht/LOG.md` — committed, append-only,
timestamped. Branch: `track/u4-urenoverzicht`. Eigen worktree.

## Bevindingen orchestrator (prod-manifest 2026-09-23 12:35Z)

De harmonie-chunks bevatten precies 24 uurstappen van run 08:00
(09:00 → 08:00 morgen). De run is bij publicatie al ~4,5 u oud, dus de
tabel reikt maar ~16–19 u vooruit, en er is geen historie ouder dan de
run-start. `buildHourlyForecast` vraagt 4 u historie + 24 u vooruit, maar
de data is er niet. UV-bron eindigt op 12:00 (alleen analyse, 25 frames).

## PO-punten (2026-09-23)

A. Bereik: laat het urenoverzicht ook de laatste uren (historie) en het
   volledige vooruitzicht tonen. Ingestkant: publiceer meer leadtijden
   van de HARMONIE-run (tot 48 u is beschikbaar; kies en motiveer op
   bytes — data-dieet MIP-8 blijft gelden, meet met `pnpm e2e` passief-
   budget) en bewaar de analyse-nabije uren van eerdere runs zodat er
   ≥ 6 u historie is (uurvelden zijn klein t.o.v. regen). Frontend: tabel
   volgt de beschikbare data; historie-rijen visueel onderscheiden; "nu"-
   rij gemarkeerd.
B. UV-intensiteit als kolom in het urenoverzicht: historie uit de uv-bron,
   vooruit afgeleid uit `radiation`/zonshoogte (documenteer de afleiding
   in `docs/fields.md`; wees eerlijk in het label als het een schatting is).
C. Zonsopgang/zonsondergang in het urenoverzicht: bereken uit `solar.ts`
   voor de gekozen locatie; presenteer als dunne tussenrij of markering
   in de uurkolom (kies één vorm, motiveer in LOG met screenshot; PO
   beslist op zicht, dus maak het makkelijk om de andere vorm te tonen).
D. Huidige tijd op de kaart: een compact "nu"-label (klok, lokale tijd)
   op de kaart, en de scrubber-tijd erbij als die ≠ nu is.
E. Regenkans per uur: er is GEEN ensemble/kansveld in de bronnen. Schrijf
   een MIP-draft (`.dev/proposals/0009-regenkans.md`, Status: draft, in
   het Nederlands, stijl van de bestaande proposals) met opties, bv.
   (1) ruimtelijke-buurtfractie (neighbourhood probability) uit het
   seamless/harmonie-regenveld, (2) tijd-in-uur-fractie natte 5-min-
   frames uit nowcast, (3) KNMI-EPS-bron als die via Open Data
   beschikbaar is (verifieer). Geef aanbeveling + bytes-kost. NIET
   implementeren; PO beslist.

## Gates

Rust: `cargo test --workspace`, `cargo clippy --workspace -- -D warnings`;
als `Cargo.lock` wijzigt ook `nix flake check -L` (VM-test; lang). Web:
`pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e` green, passief-
budget in de LOG. Synchrone exit statussen in LOG. Draft-PR vroeg, ook
voor het ingest-deel apart als dat helpt bij review. Geen codex. U2
werkt parallel in App.tsx (locatie/kaart) — houd je diff daar lokaal bij
de tabel/uurpaneel en het kaartlabel.
