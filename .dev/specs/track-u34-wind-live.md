# Track U34 — wind live-tuning met de PO in de pane (claude opus 5.5, interactief)

Read first: `AGENTS.md`, `web/src/core/wind-layer.ts` (na U24: default-intensiteit 0,75,
`WIND_FOCUS_INTENSITY` 1,905, bufferDpr 2, kopramp, ankermodel), `docs/dev-opties.md`,
U3b/U12/U20/U24-LOGs (wat al gemeten is), `web/scripts/wind-quality.ts` (inktmeting).
LOG: `.dev/tracks/u34-wind-live/LOG.md`. Branch `track/u34-wind-live` vanaf main.

## Werkwijze (anders dan andere tracks)

De PO zit in deze pane en geeft directe feedback op wat hij ziet. Iteratie-loop van
minuten, niet uren:

1. Eigen preview: `cd web && pnpm build && MOTREGEN_DATA_ORIGIN=https://motregen.nl/data
   pnpm preview --host 0.0.0.0 --port 4310 --strictPort` (achtergrond, blijft draaien;
   na elke wijziging alleen `pnpm build`, de preview pakt `dist` op). URL voor de PO:
   http://ageq-mthq:4310/ (hard herladen).
2. Per stap: één gerichte wijziging, `pnpm typecheck`, `pnpm build`, "klaar, herlaad" melden
   met in één zin wat er veranderd is en welke waarde. Geen e2e, geen stills, geen
   meetscript tenzij de PO erom vraagt. Commit na elke stap die de PO goedkeurt.
3. Waarden die de PO goedkeurt worden defaults (constanten met herkomst "PO 2026-09-25
   live"); knoppen komen er niet bij.
4. Afsluiting (als de PO "klaar" zegt): `pnpm test` en gerichte e2e (wind-zoom, focus,
   perf) onder een slot, LOG-slot met receipts, draft-PR.

## Startpunten (PO 2026-09-25, 20:10)

- Particles nog te dekkend in default; in windmodus veel te dekkend.
- Staart te kort, vooral bij zwakke wind (trailDistance/maxAge-relatie: bij lage snelheid
  sterft de particle op maxAge vóór hij zijn afstand heeft; een minimum-staartlengte in
  px of een maxAge die met de snelheid meeschaalt).
- Het korrelige effect is er nog (na buffer-DPR 2 en highp): kijk naar de fade-kwantisatie
  in RGBA8 (rest-grijs), de kop-AA en de trailbreedte bij DPR 2; probeer RGBA16F als
  `EXT_color_buffer_half_float` er is.
