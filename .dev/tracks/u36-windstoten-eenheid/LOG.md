# U36 LOG — windstoten + eenheidsinstelling (worker: claude opus 5.5)

## 2026-09-25 — start
- Branch track/u36-windstoten-eenheid op main c44fb22 (spec: .dev/specs/track-u36-windstoten-eenheid.md).
- Plan: (1) knmi-grib: 162/163 @10m TRI 2 decoderen; (2) ingest: uurveld gust_ms = |(162,163)|, 0,5 m/s tot 60;
  (3) web: summarizeWind per eenheid + stoot; (4) About-instelling motregen-wind-unit; (5) baken-veld unit.

## 2026-09-25 — ingest gust_ms (f69790f)
- grib_ls op het echte run-2026082812: 162/163 @ sfc 10 m, TRI 2, +0 stap 0–0, +1 stap 0–1 → max over het uur.
- knmi-grib decodeert ze verplicht (zoals de andere velden); pipeline: |(u,v)| per AROME-cel → gather →
  6 km-blokgemiddelde (factor 3, zelfde als wind) → tabel 0..127 m/s stap 0,5. De mrf-tabel eist 255
  stijgende waarden, dus "tot 60" = het bruikbare bereik; boven 60 ongebruikt (docs/fields.md).
- Conformance-test op het echte +1-lid: stoot ≥ wind in ≥99% van de cellen, alles in 0..60.
- Receipts: `direnv exec . cargo test --workspace` → CARGO-EXIT: 0;
  `cargo test -p knmi-grib --test conformance gusts` (met data/-symlink naar main) → CARGO-EXIT: 0.

## 2026-09-25 — web, baken, rebase op U35 (main 9ad27ab), gates
- Kolom Wind: `→ 3 Bft · 23`. `summarizeWind(u, v, gust, unit)` → hoofdwaarde afgerond in de eenheid; stoot
  alleen als stoot ≥ hoofdwaarde + 1 stap in die eenheid.
- **Interpretatie om te toetsen (PO):** bij Bft staat de stoot in km/u (Bft is op gemiddelde wind gedefinieerd; KNMI
  meldt stoten in km/u; de MIP-14/spec-voorbeeld `3 Bft · 45` is ook km/u). De drempel blijft wel "+1 Bft".
  Bij km/u is 1 stap klein → de stoot staat er vrijwel altijd; volgens de spec letterlijk gelaten.
- Eenheid: About › Weergave, tweede segmentrij Bft/knopen/km/u/m/s, `motregen-wind-unit`; tooltip/aria-label in die
  eenheid ("Wind uit W, 3 Bft, stoten tot 23 km/u"). Scrubber-readout bestaat nog niet (U28): WindUnit + summarizeWind
  zijn daarvoor klaar.
- Baken: veld `unit` (bft/kn/kmh/ms), `v` blijft 1 (spec); USAGE_FIELDS, docs/analytics.md, nix/usage/contract.jq
  (dimensie), fixture + VM-assert (`unit.kmh == {n:1,pct:25}`). Unit-test lengtegrens 240 → 260 B (alle velden aan).
- Laden: `gust_ms` gaat mee met de andere uurvelden (L0/refresh/L2/complete/cache/history). Bytes, echte run 2026082812,
  24 leden, zelfde pad als de pipeline (tijdelijke test, niet gecommit): gust_ms 347.594 B/dagchunk vs wind_u_ms 452.536 B.
- Breedte (stills web/tmp/shots/u36, niet gecommit): desktop 469/469, Pixel 5 393/393 in bft/kmh/kn. Op 320 px liep de
  tabel over (bft 335/320, kmh 344/320; zonder stoot al 323/320 — vooraf bestaand); fix: ≤ 360 px staat de stoot onder de
  hoofdwaarde (zoals luchttemp onder Gevoel) → 320/320 in alle eenheden.
- Rebase op U35: conflicten in knmi-grib/pipeline/fields.md/synthgen/contract.ts, beide kanten behouden; hourly-test 16→18
  chunks; docs/ingest.md "acht" → "negen uurvelden". synthgen-manifest opnieuw gegenereerd (gelijk aan gecommit).
- Receipts (sync, na rebase):
  `direnv exec . cargo fmt --all --check` → FMT-EXIT: 0
  `direnv exec . cargo test --workspace` (met data/-symlink) → CARGO-EXIT: 0
  `pnpm typecheck` → 0; `pnpm test` → 0 (45 files, 298 tests); `pnpm build` → 0
  `pnpm e2e e2e/table.spec.ts e2e/usage.spec.ts e2e/focus.spec.ts e2e/freshness.spec.ts --project desktop` → E2E-EXIT: 1:
    15 passed, 1 failed = focus.spec:195 "temperature focus desaturates…" (filter 'saturate(1)' vs 'none', tween-race,
    raakt wind niet); los `-g desaturates --repeat-each 3` → E2E-FOCUS-EXIT: 0 (3/3) → flake.
  `nix flake check -L` → NIX-EXIT: 0 (VM-test print dimensie unit).

## 2026-09-25 — slot
- Gemerged op main als 9cf6241 (merge van 562434d; `git merge-base --is-ancestor 562434d origin/main` → ja).
- Geleverd: uurveld `gust_ms` (ingest + contract/docs), stoot in de kolom Wind, eenheidsinstelling Bft/knopen/km/u/m/s
  (About › Weergave, `motregen-wind-unit`), baken-veld `unit` (v 1), stoot onder de waarde op ≤ 360 px.
- Open voor de PO: (1) stoot in km/u bij Bft-modus; (2) in km/u-modus is de "+1 stap"-drempel zo klein dat de stoot
  er vrijwel altijd staat — eventueel een grovere drempel (bv. +1 Bft in elke eenheid, dan verschijnt/verdwijnt de
  stoot niet bij het wisselen van eenheid).
- Open voor agents: U28 (scrubber-readout windmodus) kan `summarizeWind(u, v, gust, unit)` en `WindUnit` hergebruiken;
  focus.spec:195 (temperatuurfocus, filter 'saturate(1)' vs 'none') is flaky onder load; `web/.mcp.json` (niet van
  deze track) stond ongetrackt in de worktree.
