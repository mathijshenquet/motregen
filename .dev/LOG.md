# motregen — orchestrator log (newest first)

## 2026-08-28 — PO-ronde 1 op MIP-1

- PO answered MIP-1: 3 h history, +24 h midcast (not 48), dev on ageq-mthq +
  dedicated box later, domain already via Porkbun, droplet logo, everything in
  Dutch. Asked for a serious Rust-vs-Python weighing and frontend
  framework/styling proposals (React vs SolidJS vs frameworkless; shadcn vs own).
- Revised MIP-1 (now in Dutch): recommendation flipped to Rust ingest
  (hdf5-metno + eccodes FFI; T1 must decode one AROME GRIB end-to-end as the
  ontbindende voorwaarde; Python stays as uv-based throwaway explorer and T2
  cross-validator). Frontend: SolidJS + Tailwind v4, no shadcn; core
  (decoder/WebGL/time model) framework-free TS so the shell stays swappable.
  Decisions recorded in §5; sole remaining open question = stack sanction.
- MIP-2 and proposals README translated to Dutch; AGENTS.md updated.
- KNMI portal check: Open Data API and Notification Service are separate key
  requests; EDR/WMS not needed. PO registers both keys.
- Open with Mathijs: stack sanction (MIP-1 §4), MIP-2 adoption + its three open
  questions, the two KNMI keys. Open for agents: still nothing until adoption.

## 2026-08-28 — kickoff: research + founding proposals

- PM/PO kickoff (Mathijs = PO, fable = PM/orchestrator, codex sol/terra = workers).
- Verified KNMI data coverage for the unified slider: `nl_rdr_data_rtcor_5m` 1.0
  (history, archive since 2018-12), `radar_forecast` 2.0 (pySTEPS, 25×5 min),
  `harmonie_arome_cy43_p1` 1.0 (hourly to +60 h). Found the seamless 6 h ensemble
  blend product (post-MVP candidate). API: list + presigned URL per file; MQTT
  notification service preferred over polling.
- Anonymous API key is rate-limit-saturated (every probe today 429'd, incl. after
  60 s backoff) → registered key required. PO action.
- Repo scaffolded: jj colocated, `.claude/CLAUDE.md` → `AGENTS.md`, MIP process
  (lightweight composix-CIP variant, flat `.dev/proposals/` per Mathijs).
- Wrote MIP-1 (MVP architecture: Python/uv ingest → shared-grid 8-bit frames +
  manifest → static serving → Vite/TS/MapLibre/WebGL frontend; tracks T0–T5) and
  MIP-2 (mrf binary format, intra+zstd; video-codec idea preserved as measured
  epsilon track). Both Status: draft — awaiting PO.
- Open with Mathijs: adopt/answer MIP-1 + MIP-2 open questions; KNMI key;
  motregen.nl domain. Open for agents: nothing until MIPs land.
