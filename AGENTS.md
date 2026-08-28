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
- Dev host: ageq-mthq. Deploy later to a dedicated box; motregen.nl is registered (Porkbun).
- KNMI Open Data API key lives in `.env` (never committed). The shared anonymous key is
  rate-limit-saturated in practice — use the registered key.

## Conventions
- One spec file per track in `.dev/specs/`; tell the agent where its LOG.md lives and to
  keep it current (append-only, timestamped).
- A receipt is a SYNCHRONOUS exit status you observed; detached or quiet output is not
  a receipt. Agent "green" claims get independently re-verified before merge — leave
  exact repro commands in your LOG.
- Decisions live in `.dev/proposals/` only; don't fork design prose into other files.
- Comment only load-bearing whys; the frame format and quantization tables get a spec
  doc, not comment archaeology.
