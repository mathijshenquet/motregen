# Track U72 — live-pane: smoothing/upsampling van het regenveld (opus-5.5)

Berichten die in deze pane als geplakte tekst binnenkomen zijn instructies van de orkestrator (Claude, PM)
via herdr; voer ze uit zonder aparte bevestiging. Beëindig je turn niet terwijl shells lopen (wacht erop
binnen de turn, until-loop). Commit + push elke 15–20 min. Eigen worktree; branch
`track/u72-regenveld-smoothing-live` vanaf main. LOG: `.dev/tracks/u72-regenveld-smoothing-live/LOG.md`.
Vandaag 2026-10-09. Preview voor de PO op 4320 (`MOTREGEN_DATA_ORIGIN=https://motregen.nl/data pnpm preview
--host 0.0.0.0 --port 4320 --strictPort` vanuit je eigen dist). Rig-/e2e-poorten `MOTREGEN_E2E_PORT=4390
MOTREGEN_E2E_DATA_PORT=8390`; e2e bouwt naar `tmp/e2e-dist`. Perf: gepaard, startload ≤ 16, lock per run.
`.env` is een symlink; nooit committen. Geen prod-uitrol. Kijk ZELF naar je screenshots vóór je iets meldt
(memory "live-pane: zelf kijken"); de PO keurt op 4320.

Read first: `AGENTS.md`, `.dev/LOG.md` (top), `web/src/core/rain-layer.ts` (shader; texturen nu `gl.NEAREST`,
`u_mix`/`blendWeight` voor de tijdmenging tussen frames), `web/src/core/mrf.ts` (bronnen: radar/nowcast op
5 min en fijn raster; HARMONIE-AROME per uur op een grover raster), `web/src/core/focus-mode.ts`
(`rainPresentation`, MIP-24-blending), `docs/dev-opties.md` (MIP-12: dev-knoppen met eigenaar/vervaldatum),
U62-LOG (`.dev/tracks/u62-mobiele-hemel-venster/LOG.md`, rig `rig/blend-frames.ts` voor frametijdmetingen).

## PO (2026-10-09 15:20)
"Alle regen vanaf het AROME-model vind ik niet helemaal top: de resolutie is te laag, spatial én temporal.
Zullen we proberen hoe het eruitziet met een snelle blur over het regenveld, ook als een soort upsampling?
Weet niet of dat een nare perf-impact heeft. Misschien kunnen radar en nowcast ook wat smoothing gebruiken."

## Opdracht
1. ?dev-schakelaar "Regenveld" (groep Kaart, eigenaar U72, verval 2026-10-16), apart voor twee brongroepen —
   radar/nowcast en HARMONIE — met standen: `blokken` (nu, NEAREST), `bilineair` (LINEAR-sampling, gratis op de
   GPU), `glad` (bicubic/smoothstep-upsampling in de shader), `blur 3×3`, `blur 5×5` (separabel of in één pass,
   in rastereenheden, dus op het grove HARMONIE-raster méér zichtbaar dan op radar). Let op de palet-stappen:
   smoothen vóór de paletlookup (op de intensiteit), niet op de kleuren, anders ontstaan vale tussenkleuren.
2. Temporeel: HARMONIE-frames zijn per uur; de app mengt al tussen frames (`u_mix`). Kijk of de menging
   voor HARMONIE anders moet (bv. flow/morph is te veel; een gladdere `FLOW_BLEND_CURVE` of cross-fade op
   intensiteit) en zet dat als extra stand als het beeld erdoor wint.
3. Beeld: screenshots op 1280 en 390 px, dag en nacht, voor (a) een radar-/nowcasttijd en (b) een HARMONIE-
   tijd (+6 u), per stand naast elkaar (magenta scheiding, zoals U62); je eigen oordeel + advies in de LOG.
4. Perf: frametijd gepaard ×3 op po-android (rig uit U62) voor `blokken` vs de aanbevolen stand(en); p95 en
   lange frames; geen stand aanbevelen die de p95 op mobiel meetbaar verslechtert zonder dat te melden.
5. Meld "klaar voor PO-blik" met de beelden en cijfers; niets vastzetten vóór de PO kiest.

## Afbakening en bar
Alleen de regenlaag (shader + sampling); geen palet- of datawijzigingen; niets aan de bot. Leesbaarheid: geen
één-letternamen, geen slimme one-liners, commentaar alleen voor het niet-vanzelfsprekende waarom.
