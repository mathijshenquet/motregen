# Track T3h — progressief laden (gpt-5.6-sol) — START NA T3G-MERGE

Read first: `AGENTS.md`, MIP-8 (accepted — §7 is het bindende bouwontwerp,
§2 de metingen), `docs/perf.md`, `.dev/tracks/t3g-po-iteratie/LOG.md` (de
verse UI incl. scrubber-horizon en de warm-cache-fix waar je op
voortbouwt), `web/e2e/`. Your LOG: `.dev/tracks/t3h-progressief-laden/LOG.md`
— committed. Branch: `track/t3h-progressief-laden` vanaf main ná de
t3g-merge.

## Goal

MIP-8 §7 uitvoeren: L0 (≤ ~1,5 MB direct: frame-paar rond nu + actuele
temp/wind + volledige uurtabel; TTFR ongewijzigd) / L1 (histogramvenster
rond nu als eerlijk invullend skeleton, idle-prioriteit) / L2 (volledige
reeks bij scrub-/play-intentie of diepe idle, met prefetch-ahead zodat
afspelen nooit op het netwerk wacht).

## Harde eisen

- Chunk-coalescing blijft; geen requeststorm bij eerste scrub.
- Tweede locatieklik blijft 0 requests; warm reload blijft 0 B chunks
  (de zojuist door t3g gevestigde standaard).
- Scrub naar onbeladen gebied: laatste bekende frame zonder jank + gerichte
  fetch.
- e2e: passieve meting apart van scrub-meting; nieuw passief-budget ≤ 3 MB
  (kalibreer exact); mobiele profielen meten tijd-tot-compleet; alles 2×
  achtereen green.
- Smaaktest: skeleton-vs-wachten achter een toggle; PO beslist op zicht.

## Out of scope

Server/ingest, contract, dictionary/delta (afgewezen in MIP-8).

## Gates & receipts

`pnpm build`/`typecheck`/`test`/`pnpm e2e` (2× green); SYNCHRONE receipts;
onafhankelijke re-run + live-herijking van docs/perf.md-baselines volgen.
