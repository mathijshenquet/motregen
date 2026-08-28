# motregen — orchestrator log (newest first)

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
