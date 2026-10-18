# motregen — agent context

Buienradar-style rain app on KNMI open data, to live at **motregen.nl**.
One unified time slider spanning history (radar), nowcast (KNMI pySTEPS)
and midcast (HARMONIE-AROME); map of the Netherlands with a WebGL rain
overlay fed by binary frames (no PNGs); location picker + browser
geolocation; a rain intensity meter for the picked location. Reference
app for feel: DWD WarnWetter.

Roles: Mathijs is product owner (decisions), the Claude orchestrator is
product manager (proposals, specs, verification), codex agents
(gpt-5.6-sol/terra) do the tracks.

## Where truth lives (read in this order to rebuild context)
1. `.dev/LOG.md` — session journal, newest entry first. Top entry = current state + open items.
2. `.dev/proposals/` — numbered proposals (MIP-n). `Status: draft` = inbox for Mathijs;
   adoption is his call and flips the status to `accepted` plus a Decision section.
   Accepted proposals are the decision registry; cite as "MIP-1". Proposals and all
   product-facing text are in Dutch (PO decision, 2026-08-28).
3. `docs/` — dataset notes and design detail, once they exist.

## Environment
- **jj** (colocated with git) is this project's VCS. The orchestrator works with jj in
  the main checkout; worker tracks run in herdr-managed git worktrees on
  `track/<name>` branches (colocation makes both views consistent).
- devenv + direnv once T0 lands. Ingest: Rust (MIP-1, subject to the T1 GRIB gate);
  Python only as throwaway exploration/independent validator via uv, never in the
  production path. Frontend: pnpm + Vite + TypeScript + SolidJS + Tailwind v4 (no shadcn).
- Dev host: ageq-dev2 (was ageq-mthq tot 2026-10-07; worker-previews op http://ageq-dev2:43xx/). Deploy later to a dedicated box; motregen.nl is registered (Porkbun).
- KNMI Open Data API key lives in `.env` (never committed). The shared anonymous key is
  rate-limit-saturated in practice — use the registered key.

## Conventions
- One spec file per track in `.dev/specs/`; tell the agent where its LOG.md lives and to
  keep it current (append-only, timestamped).
- e2e op de dev-host: `pnpm e2e*` loopt via `web/scripts/e2e-slot.sh` (twee slots, één
  Chromium per slot). Workers draaien onder een slot alleen hun EIGEN en geraakte spec-
  bestanden, **alleen `--project desktop`** (`pnpm e2e e2e/<naam>.spec.ts --project desktop`).
  De orkestrator gate per merge met typecheck/unit/build + dezelfde gerichte desktop-specs;
  de VOLLEDIGE suite in drie profielen draait maximaal één keer per dag op main (nachtelijk of
  bij sessieafsluiting), niet per merge (PO 2026-09-25: "e2e duurt veel te lang"). Perf-
  budgetten (`perf.spec`) tellen alleen in die dagelijkse run mee; onder load zijn ze ruis.
- A receipt is a SYNCHRONOUS exit status you observed; detached or quiet output is not
  a receipt. Agent "green" claims get independently re-verified before merge — leave
  exact repro commands in your LOG.
- Decisions live in `.dev/proposals/` only; don't fork design prose into other files.
- Comment only load-bearing whys; the frame format and quantization tables get a spec
  doc, not comment archaeology.
- Dev-knoppen: alleen via `?dev`, met eigenaar en vervaldatum in de spec (MIP-12). De
  levende lijst staat in `docs/dev-opties.md`.

## Changelog en releases
Lees `changes/README.md` vóór je een notitie schrijft of een release maakt. In het kort (PO 2026-10-18):
- Een release in @motregen_updates is precies een reeks posts: **per feature één bericht met een beeld of clip** en
  een kort bijschrift. Geen samenvattend tekstbericht, en geen versienummers naar gebruikers (die zijn intern).
- Wie een gebruikerswijziging bouwt, schrijft in dezelfde commit `changes/pending/<slug>.md` (Nederlandse `title`,
  `kind` `nieuw`/`beter`/`opgelost`, 1–3 zinnen) **met media**: een still of clip (H.264, ≤ 12 s, ≤ 2 MB) onder
  `changes/media/`, zelf bekeken. `changelog:check` weigert een pending notitie zonder media.
- Klein en interne afwerking (papercuts, optimalisaties) krijgt geen notitie; bij twijfel vraag je de PO.
- Concepten gaan eerst naar de privéchat van de PO (`MOTREGEN_SMOKE_CHAT_ID`); hij kiest met een emoji. Zet daarna
  `goedgekeurd: JJJJ-MM-DD` in de notitie; `tools/release.sh` weigert notities zonder die keuze.
- De orkestrator releaset met `tools/release.sh patch|minor|major` (eerst `--dry-run`); `VERSION` is de versiebron.
  Push, uitrol en `pnpm changelog:post X.Y.Z @motregen_updates` zijn aparte stappen; uitrol alleen na expliciet
  akkoord van de PO, posten pas na de uitrol.
