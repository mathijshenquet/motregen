# U56 — klokpil: slepen = scrubben, uitgerold = tijdlijn met bronzones (LOG, append-only, nieuwste onderaan)

- 2026-10-07T13:00Z — Gestart op `5bd91f2` (branch `track/u56-klokpil-tijdlijn`), worker claude-opus-5-5. Spec, `AGENTS.md`, `Freshness.tsx`, `core/freshness.ts`, `HistogramScrubber.tsx`, `core/time-model.ts`, `core/usage.ts`, `e2e/freshness.spec.ts`, `docs/analytics.md`, `docs/dev-opties.md` gelezen. `pnpm install --frozen-lockfile` → exit 0. Poorten: preview 4345, e2e 4346/8346.
- 2026-10-07T13:08Z — Ontwerpkeuzes (terug te draaien, ter beoordeling PO):
  1. **Jog-richting**: naar rechts slepen = later (duim van een schuifregelaar, past bij `role=slider` en pijl-rechts = +1). De scrubber sleept de tijdlijn zelf en loopt dus andersom.
  2. **Jog-schaal**: default vast 2 min/px (`CLOCK_JOG_MS_PER_PX`); de scrubberschaal (8 u over de plotbreedte) komt als tijdelijke `?dev`-knop (groep Klok) zodat de PO beide kan voelen.
  3. **Pauzeren** pas zodra de sleep de tap-slop (4 px) voorbij is, niet op `pointerdown`: anders ziet het paneel bij een tik "gepauzeerd" en hervat het afspelen na sluiten niet.
  4. **Strook niet lineair**: lineair is HARMONIE ~87 % en radar/nowcast elk een streepje; elke zone krijgt minstens een kwart van de totale duur als gewicht, binnen een zone loopt de tijd lineair. De blend (seamless) valt in de zone Nowcast.
  5. `sourceZone` kent alleen observatie/voorspelling en geen kleuren; de strook neemt het regime (`kind`) daaruit en kleurt per zone in CSS.
- 2026-10-07T13:09Z — Kernmodule `web/src/core/clock-timeline.ts` (jog, toetsstappen, bronstrook, positie↔tijd) + unit. `cd web && pnpm exec vitest run src/core/clock-timeline.test.ts` → exit 0 (9 tests).
