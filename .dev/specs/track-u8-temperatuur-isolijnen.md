# Track U8 — temperatuur-isolijnen bij hover, met tween (claude opus)

Read first: `AGENTS.md`, `web/src/core/temperature.ts` (labels, layer),
`web/src/App.tsx` (`attachTemperatureLayer`, `showTemperature`,
`frameBlend`, de `forecast-panel`-tabel met `.temperature-cell`, de rain-
layer-aanhechting), `web/src/core/rain-layer.ts` (custom WebGL-laag, `mix`-
uniform), `web/src/core/wind-layer.ts` (heeft al een `visibility`-tuning
als voorbeeld van een laag-dim), `web/src/core/cloud-edge-layer.ts`,
`docs/fields.md` (feels_like_c 6-km-grid, kwantisatie), `docs/perf.md`.
Your LOG: `.dev/tracks/u8-temperatuur-isolijnen/LOG.md` — committed,
append-only, timestamped. Branch: `track/u8-temperatuur-isolijnen` vanaf
main. Eigen worktree. Integratie-instantie: http://ageq-mthq:4300/.

## PO-punt (2026-09-23)

"Als je een temperatuur-ding op de kaart of in de tabel hovert, laat
temperatuur-isolijnen zien op de kaart en de-emphasize regen en andere
dingen; graag tweenen."

## Opdracht

1. **Isolijnen** uit het getoonde gevoelstemperatuurveld (`feels_like_c`,
   dezelfde frame-blend als de labels, dus ze bewegen mee met de scrubber):
   marching squares op het 6-km-grid (209×225 — goedkoop genoeg voor de
   main thread? meet; anders een worker naast `zstd.worker.ts`), stap 2 °C
   (knop: 1/2/5), lichte smoothing (Chaikin of spline, kies), als GeoJSON
   line-laag in MapLibre met labels op de lijn (`symbol-placement: line`,
   "12°"). Kleur: neutraal/gedempt in licht én donker thema, warmer/kouder
   niet inkleuren (labels dragen de waarde). Laag zit onder de temperatuur-
   labels, boven de regen.
2. **Trigger**: hover (pointer) op een temperatuurlabel op de kaart of op
   een `.temperature-cell`/kolomkop in de tabel; op touch: tap-and-hold of
   tap op de kolomkop toggelt (kies, motiveer). Focus via toetsenbord telt
   ook als hover (a11y). Weg-hoveren → terug.
3. **Focusmodus**: tijdens hover dimmen regen, wind-particles, wolkenrand
   en zon-iconen naar ~25 % (knop), isolijnen faden in. Regenlaag: voeg een
   `opacity`-uniform toe aan `RainLayer` (nu ontbreekt die); wind via de
   bestaande `visibility`; symbol-lagen via `text-opacity`.
4. **Tween**: alles animeert (~250 ms in, ~400 ms uit, ease-out; knop),
   via één `focus`-waarde 0→1 in een rAF-loop of MapLibre paint-
   transitions waar dat kan; `prefers-reduced-motion` → direct.
5. Knoppen in het debugpaneel: stap, dimniveau, tweenduur, smoothing aan/
   uit. Unit tests voor marching squares (bekende velden, zadelgeval) en
   voor de focus-tween-wiskunde.

## Randvoorwaarden

Geen nieuwe dependencies (geen d3-contour; eigen marching squares is ~150
regels). Frametijd mobiel profiel niet slechter dan baseline in
`docs/perf.md` buiten focusmodus; in focusmodus meten en loggen. App.tsx:
U4 (urenoverzicht) en U7 (ontwerp: histogram/splash/about/labels) werken
parallel — zet de logica in `core/isolines.ts` + `core/focus-mode.ts` en
houd App.tsx-wijzigingen klein (aanhechting, hover-handlers).

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e` green (synchrone
exit status in LOG; e2e-poorten 8185/4185 zijn gedeeld — wacht in de
voorgrond, kill niets, eindig je beurt niet terwijl je wacht).
Screenshots/korte video (Playwright) van hover-in/uit, licht + donker.
Draft-PR vroeg. Geen codex.
