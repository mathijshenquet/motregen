# Track T3b — UX round 1: PO feedback on the shell (gpt-5.6-sol)

Read first: `AGENTS.md`, `.dev/proposals/0001` §3/§5, `docs/contract.md`
(note the fresh `field` amendment + changelog), and
`.dev/tracks/t3-frontend-shell/LOG.md` (what T3 built and why). T3 is merged
to main; you branch from main on `track/t3b-ux-round1`. Your LOG:
`.dev/tracks/t3b-ux-round1/LOG.md` — append-only, timestamped, committed.

## Goal

Process the PO's first visual review of the shell. Seven concrete changes,
all PO-decided (not up for debate, though execution taste is yours):

1. **Histogram = scrubber.** Merge the rain graph and the time slider into
   ONE control: the per-location rain histogram over the full timeline is
   itself the scrub surface (drag anywhere on it; cursor line; keep the
   regime segmentation visible — history | nu | nowcast | model — and the
   "nu" marker). Keep scrubbing 60 fps smooth; the separate slider disappears.
2. **Search box.** Location search via PDOK Locatieserver (free, no key,
   authoritative for NL): debounced suggestions from
   `https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest?q=...`, resolve
   via `.../lookup?id=...` (centroid), keyboard navigation, Enter → fly-to +
   set picked location. Handle offline/API-failure gracefully.
3. **Layout pass.** PO: "layout nog niet helemaal optimaal". Rework the
   responsive layout with WarnWetter as reference (mobile-first: map on top,
   histogram-scrubber + info below; desktop: sensible use of width). Your
   taste; document the choices briefly in your LOG.
4. **Hourly forecast table.** For the picked location, a compact table of the
   coming ~24 h: hour, rain (mm/h, from the existing frames) and sun
   (radiation, from the NEW `field: "radiation"` chunks — extend
   `synthgen` to also emit hourly radiation chunks with a plausible diurnal
   cycle per the amended contract). Render sun as a small icon/intensity +
   value. If radiation chunks are absent from a manifest, the column hides
   gracefully (real data lands later in T2).
5. **Theme.** Light/system/dark with a single cycler button (click cycles
   light → system → dark → light; persist choice in localStorage; "system"
   follows `prefers-color-scheme`). DEFAULT: light (PO decision). Both UI and
   basemap follow the theme.
6. **Basemap: no roads.** PO: the map is too traffic-focused. De-emphasize or
   remove road/motorway layers from the style (filter the style JSON layers;
   keep water, admin borders, place names). Provide a matching dark variant
   for the dark theme.
7. Keep the droplet identity and "Bron: KNMI" attribution; keep the core
   framework-free architecture intact (histogram-scrubber is a component over
   the existing time model, not a rewrite).

## Out of scope

Real KNMI data, Rust/ingest, deploy, PWA. No changes to `docs/contract.md`
(if it blocks you: WALL entry in LOG + stop that item).

## Gates & receipts

- `pnpm build`, `pnpm typecheck`, `pnpm test` green (extend tests where
  behavior changed: time model, synthgen radiation, table selection logic);
  SYNCHRONOUS receipts + repro commands in your LOG; independently re-run
  before merge.
- End state: `pnpm dev`/`preview` shows all seven changes working on
  synthetic data; list manual verification steps in your LOG.
