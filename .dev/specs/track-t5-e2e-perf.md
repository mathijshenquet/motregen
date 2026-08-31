# Track T5 — e2e- en perf-suite (gpt-5.6-sol)

Read first: `AGENTS.md`, MIP-7 (accepted — §3 is je blauwdruk, §5 de
PO-calls), `docs/contract.md`, de web-LOG's (t3b/t3e/t3f) voor de bestaande
test- en cache-architectuur. Your LOG: `.dev/tracks/t5-e2e-perf/LOG.md` —
committed. Branch: `track/t5-e2e-perf`.

⚠️ **Conflict-discipline**: track t3g-po-iteratie werkt PARALLEL in `web/`
(PO-gedreven, onvoorspelbare scope). Houd jouw voetafdruk in bestaande
bestanden minimaal: perf-module en HUD in NIEUWE bestanden
(`web/src/core/perf.ts`, `web/src/components/PerfHud.tsx`), e2e-suite in
`web/e2e/`, en raak `App.tsx` met zo min mogelijk regels (mount + de
meetpunt-hooks; kies waar mogelijk event-/performance-API-gebaseerde meting
boven code-instrumentatie). De orchestrator lost merge-volgorde op.

## Taken

1. **Perf-module** (framework-vrij): TTFR (navigationStart → eerste
   gerenderde regenframe — definieer het meetpunt precies en documenteer),
   scrub-latency p50/p95 (input-event → frame-commit), lopende fps
   (rAF-venster), sessie-bytes + request-count (Resource Timing, gesplitst
   manifest/chunks/tiles/overig), manifest-leeftijd. Continu, goedkoop
   (geen meetbare overhead — toon dat aan).
2. **HUD**: overlay geactiveerd via `?perf=1` én triple-tap op het logo;
   compact, leesbaar op mobiel, beide thema's; toont de metrics live +
   een kopieerbare JSON-dump-knop (voor het delen van metingen).
3. **Lab-suite** `web/e2e/` (Playwright, chromium): draait tegen
   `pnpm preview` + synthgen (deterministisch; de suite start dat zelf op):
   - cold load: TTFR-budget < 2,0 s; geen console-errors;
   - warm reload: TTFR < 0,5 s en netwerk ≈ alleen manifest;
   - scripted scrub over de volledige tijdlijn: geen request-storm
     (budget: < 1 request per 3 frames bij eerste pass), geen errors;
   - locatieklik 1 → data; locatieklik 2 → **0 requests** (sessie-versie
     van de HAR-regressietest);
   - sessietotaal < 8 MB.
   Kalibreer de budgetten op wat werkelijk haalbaar is (streng maar
   stabiel groen — geen flaky gates) en documenteer de gekozen waarden +
   meetruis in `docs/perf.md`. fps: loggen, NIET asserteren (SwiftShader).
   Entrypoint: `pnpm e2e` — dit is een ON-DEMAND target (PO-besluit §5),
   géén CI-koppeling; wel opnemen in de standaard gates-lijst in je LOG.
4. **Live-smoke-script** `scripts/smoke.sh` (of klein Rust/TS-hulpje, jouw
   keuze): manifest-versheid < 15 min, MIP-3-headers, Range→206, index 200
   tegen een opgegeven origin-URL; exit-status als receipt. Wordt later de
   systemd-timer op de VPS (niet in dit track activeren).
5. **Nulmeting**: draai de suite en de HUD tegen zowel synthgen als de
   echte data (caddy :8080 via 4173) en leg de eerste meetreeks vast in
   `docs/perf.md` — dat is de baseline waar we voortaan tegen regresseren.

## Out of scope

CI-workflows, RUM-beaconing, Rust/ingest, deploy-activatie van de smoke.
`docs/contract.md` niet wijzigen.

## Gates & receipts

`pnpm build`/`typecheck`/`test` én `pnpm e2e` green (SYNCHROON, pipefail,
repro's in LOG); onafhankelijke re-run volgt. De e2e-suite zelf moet twee
keer achter elkaar green draaien (flakiness-check) — rapporteer beide runs.
