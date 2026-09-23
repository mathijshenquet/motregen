# Track U3 — windparticles: staartlengte, fade, anti-aliasing, knoppen (claude opus)

Read first: `AGENTS.md`, `web/src/core/wind-layer.ts` (+ test),
`docs/motion.md`, `web/src/components/PerfHud.tsx` (bestaand debug-
paneel, `?perf=1`/triple-tap), `.dev/tracks/t3i-trail-ghosts/LOG.md`
(fade-vloer). Your LOG: `.dev/tracks/u3-wind-trails/LOG.md` — committed,
append-only, timestamped. Branch: `track/u3-wind-trails`. Eigen worktree.

## PO-diagnose (2026-09-23)

Visuele intensiteit over land is bijna goed (~20 % minder mag), over zee
veel te druk. Oorzaak: staartlengte hangt dubbel van windsnelheid af —
snellere particles leggen per frame meer afstand af én hun trail is
langer (fade is tijdgebaseerd). Zee heeft hoge wind en is visueel homogeen
→ ziet er druk uit. Verder: sommige particles zijn heel kort (ongewenst),
en het verschijnen/verdwijnen voelt abrupt. Trails zijn blokkig/slecht
geanti-aliased.

## Opdracht, in deze volgorde

1. Maak de afgelegde afstand per particle-leven (≈ staartlengte) in
   pixels windsnelheid-ONAFHANKELIJK: elke particle legt ongeveer dezelfde
   schermafstand af; snelheid vertaalt zich in beweging/tempo, niet in
   lengte. Voorkom heel korte trails (minimum leeftijd/afstand).
2. Fade-in en fade-out per particle (leeftijdsgebonden alpha), zodat
   spawn en dood niet abrupt zijn.
3. Anti-aliasing van de trails: bv. lijnsegmenten met breedte + feathered
   alpha in de fragmentshader, of MSAA/supersampled trail-target — meet
   de GPU-kost op het mobiele profiel (`docs/perf.md`) en kies.
4. Knoppen: breid `WindTuning` uit en zet ALLE relevante parameters live
   instelbaar in het debug-paneel (sliders met numeriek veld, waarden
   persistent in localStorage `motregen-wind-tuning`, reset-knop, en een
   "kopieer als JSON"-knop zodat de PO tuning kan terugsturen). Minimaal:
   particledichtheid, doel-trailafstand, min/max leeftijd, fade-in/-out
   duur, trail-opacity, globale intensiteit (de −20 %), lijnbreedte,
   en — voor stap 5 — een aparte zee-opacityfactor.
5. Pas daarna, en alleen als 1–4 niet volstaan: zee-specifieke opacity
   (landmasker uit de basemap-vectortiles of een statisch NL-masker; kies,
   motiveer). Lever dit áchter de knop uit stap 4, default 1,0.

## Gates

`pnpm typecheck`, `pnpm test` (voeg tests toe voor de leeftijds/afstands-
wiskunde), `pnpm build`, `pnpm e2e` green; frametijd op het mobiele
profiel niet slechter dan baseline in `docs/perf.md` (meet, log vóór/na).
Screenshots vóór/na (land + zee, licht en donker thema) in de LOG-map.
Draft-PR vroeg. Geen codex. Raakt bij voorkeur alleen wind-layer.ts,
PerfHud en tests.
