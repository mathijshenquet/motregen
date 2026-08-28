# MIP-1: motregen.nl MVP architecture

Status: draft
Author: orchestrator (fable), 2026-08-28

## 1. The problem

Build motregen.nl: a buienradar-class precipitation app for the Netherlands
on KNMI open data. Product requirements from the PO:

- **Unified time slider** across three regimes: history (measured radar),
  nowcast (KNMI's operational model, ~2 h), and AROME-style midcast (~2 days).
- **Map of NL with rain overlaid** — not server-rendered PNGs but binary
  data, unpacked and animated client-side (WebGL). Codec question is split
  out into MIP-2.
- **Location picker** + browser geolocation.
- **Rain intensity meter**: the precipitation intensity at the picked
  location, readable across the whole timeline.
- Feel/reference: DWD WarnWetter.

This MIP fixes the data sources, the pipeline shape, the frontend stack, and
the MVP cut. It is the founding architecture decision.

## 2. Prior work

**Reference apps.** Buienradar (2 h nowcast as colormapped PNG frames over a
static map; the classic per-location rain graph). DWD WarnWetter (proper
pan/zoom map, timeline scrubber, per-location detail). RainViewer (global
radar tiles, smooth WebGL animation).

**KNMI data (verified against the Data Platform, 2026-08-28).** All
CC-BY-4.0, all reachable through one API
(`api.dataplatform.knmi.nl/open-data/v1/datasets/{name}/versions/{v}/files`,
list + presigned download URL per file), plus an MQTT notification service
that pushes a message per new file — KNMI explicitly prefers that over
polling.

| regime | dataset | contents |
| --- | --- | --- |
| history | `nl_rdr_data_rtcor_5m` 1.0 | 5-min radar accumulations, rain-gauge corrected in real time, 1×1 km, HDF5, every 5 min; archive since 2018-12 (separate `..._tar` dataset for bulk backfill) |
| nowcast | `radar_forecast` 2.0 | KNMI's operational pySTEPS nowcast, initialized from RTCOR-5m: 25 steps × 5 min (+0…+120 min), 1×1 km, HDF5, fresh run every 5 min |
| midcast | `harmonie_arome_cy43_p1` 1.0 | HARMONIE-AROME cy43 (UWC-West), regular lat-lon ~2 km, hourly steps to +60 h, GRIB, 4 runs/day; archive since 2026-01-08 |

Notable: KNMI also publishes a **seamless precipitation ensemble forecast**
(nowcast⊕NWP blend, 5-min resolution to +6 h, members + exceedance
probabilities). It is the natural later upgrade for the ugly seam at +2 h and
for WarnWetter-style probability shading — deliberately out of MVP scope.

**API keys.** The public anonymous key is shared across all unregistered
users; it was rate-limit-saturated during every probe today. A registered key
(free, 200 req/s, 1000 req/h) is required in practice. PO action.

**Grids.** The radar products live on the KNMI polar-stereographic 1 km
composite grid (700×765); AROME on a regular lat-lon grid. Two different
projections and resolutions that must look like *one* product on screen.

## 3. Recommendation

Three components, connected by a static file contract.

**Ingest (Python, uv).** A small daemon: MQTT notifications (poll fallback) →
download HDF5/GRIB (h5py, cfgrib) → reproject each source onto **one shared
grid** (EPSG:3857 over NL + margin, ~1 km, precomputed nearest-neighbour index
maps via pyproj — reprojection becomes a numpy gather) → quantize to 8-bit
rain-rate (curve in MIP-2) → write one compressed binary frame per timestep
(format: MIP-2) plus one `manifest.json` describing the whole timeline
(atomically swapped). Solving the radar-vs-AROME seam once, server-side, keeps
the client trivial: every frame is the same grid, same encoding, whatever its
origin.

Timeline composition: history = RTCOR frames; +0…+2 h = latest nowcast run;
beyond = latest AROME run, hourly. The manifest carries per-frame provenance
(source, run, valid time) so the UI can label regimes honestly.

**Serving.** Frames are immutable → static file tree behind a web server,
long cache lifetimes; the client polls only the small manifest. No runtime
backend in the MVP.

**Frontend (Vite + TypeScript + MapLibre GL).** MapLibre with a free vector
basemap; rain as a custom WebGL layer: decoded frames upload as single-channel
textures, a fragment shader applies the colormap LUT and blends adjacent
frames for smooth scrubbing. Retina-sharp, and animation cost is one texture
per frame. UI: the unified slider with visible regime segmentation
(history | now | nowcast | model) and play/pause; tap-to-pick + geolocation;
the intensity meter reads the *same decoded arrays* at the picked cell —
meter and map agree by construction — rendered as a current-value dial plus a
rain graph over the full timeline (the buienradar graph, but scrubbable).

**Execution plan** (tracks in herdr worktrees, spec per track):

- T0 scaffold: devenv, repo layout, CI skeleton — terra.
- T1 ingest spike: registered key, one file of each dataset decoded,
  reprojection PoC with plots — sol (measurement-sensitive).
- T2 encoder + manifest per MIP-2 — sol designs, terra hardens.
- T3 frontend shell against synthetic frames: map, WebGL layer, slider — sol.
- T4 integration + intensity meter + geolocation — terra under tight spec.
- T5 polish pass vs WarnWetter reference — orchestrator + PO review.

T1 and T3 run in parallel once T0 lands; the manifest/frame contract (MIP-2)
is written down before either side consumes it.

**MVP cuts.** History defaults to a few hours back (archive backfill is a
flag, not a feature); no PWA/push, no warnings layer, no ensemble/probability
shading; responsive web only, no native apps.

## 4. Open questions

1. **Basemap**: OpenFreeMap hosted tiles (zero setup, external dependency) vs
   self-hosted Protomaps PMTiles extract (self-contained, one more moving
   part) vs bare NL contour (buienradar-classic minimalism). Recommendation:
   OpenFreeMap for MVP; the frontend doesn't change if we switch later.
2. **History depth in the slider**: 3 h (recommended: matches the mental
   model "did that shower just pass?") or deeper (day+, needs backfill and a
   smarter frame-loading strategy)?
3. **Midcast horizon**: cut at +48 h (recommended; tail quality is low) or
   show the full +60 h?
4. **Hosting**: which box serves motregen.nl (an ageq host + caddy?), and who
   registers the domain? Decide by T4; PO action for the domain either way.
5. **Proposal language**: these are in English (public repo house style);
   fine, or prefer Dutch?

PO actions regardless of the answers: register a free KNMI Data Platform API
key; register motregen.nl.

## Changelog

- 2026-08-28: draft.
