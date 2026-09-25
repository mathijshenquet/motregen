# U25 — temperatuurkaart: dunne uniforme isolijnen, gedesatureerde basiskaart, KNMI-palet (worker: claude opus 5.5)

## 2026-09-25 ~ start
- Spec + code gelezen (isoline-layer/-contours/-tracer/-labels, focus-mode, App.applyFocus, overlay-canvas).
- Plan:
  1. Lijnen: `odd` weg (tuning, knop, `oddLine`, `u_odd_*`, `u_dashed` + stippelcode die alleen oneven
     lijnen diende, segment-float `odd`). Breedte 1,3–2,0 CSS-px → 0,9–1,4 (×0,7). Onder 1 device-px
     blijft de capsule 1 px breed met lagere alpha (zelfde reden als U16: geen subpixel-flikker).
     Labels: `IsolineLabels` labelt al elk niveau; geen wijziging nodig.
  2. Desaturatie: `--map-saturation` op `.map-shell`, per frame gezet vanuit applyFocus (de focus-tween
     loopt al per rAF; reduced motion = tween 0 ms → sprong). `filter` alleen actief bij < 1 (klasse),
     zodat buiten focus geen filterlaag bestaat. Dev-knop verzadiging (default 0,55).
  3. Vulling: aparte fill-texture (tuning.resolution) in dezelfde pass-cadans als de lijnen (vector: op
     de getekende snede `shownTime`, zodat vlakgrenzen onder de lijnen vallen); composite legt lijnen
     over vulling. Kleur per band (bandmidden → palet). Afstandsafval in s-eenheden: |s − L| / 0,5 is
     precies afstand / halve bandbreedte in px. Faden: symmetrische overgang rond de lijn met breedte
     (1 − f) in s → bij f = 0 geen grens, bij f = 1 harde grens onder de lijn. f = ringfade × gradiëntfade;
     ringfade komt als klein raster (roostercellen) uit de tracer-worker.

## 2026-09-25 ~09:05 — implementatie (commit ed9b0a0 + shaderklem)
- **Lijnen**: `odd` volledig weg (tuning, dev-knop "Oneven lijnen", `oddLine`, `u_odd_*`, `u_dashed` en de
  hele stippelcode incl. `DASH_*`/hoekbakken, segment-floats `arc`/`odd`: SEGMENT_FLOATS 9 → 6; geometrie
  zelf ongewijzigd). Breedte **vóór 1,3 CSS-px (≤ z5) → 2,0 (≥ z9)**, oneven de helft; **na 0,9 → 1,4**
  voor alle lijnen (`isolineWidthCss`). `lineProfile`: onder 1 device-px blijft de capsule 1 px met
  alpha = breedte (U16-reden, test op constante dekking). Labels: `IsolineLabels` labelde al elk niveau.
- **Desaturatie**: `applyMapSaturation` zet `--map-saturation` op `.map-shell` per frame uit de bestaande
  focus-tween (reduced motion → sprong, geen CSS-transition nodig); klasse `map-desaturated` alleen < 1, CSS
  `.map-desaturated .maplibregl-canvas { filter: saturate(var(--map-saturation)) }`. Geen setPaintProperty,
  geen MapLibre-render. Overlays (eigen canvassen) ongefilterd; stadslabels zitten in het kaartcanvas en
  worden mee gedesatureerd, maar zijn neutraal grijs/zwart en faden in focus toch al uit.
- **Vulling**: nieuwe `temperature-palette.ts` (`TEMPERATURE_PALETTE` 13 stops −20…40 °C, herkomst in één
  regel; `fillSample`/`fillColor` = referentie van de shaderformule). `fillFragment` deelt de veldsampling
  (`fieldSampling`) met de rastershader; eigen target op `tuning.resolution`, draait in dezelfde pass als
  de lijnen (vector: op `shownTime` van de getekende geometrie, zodat de bandgrenzen onder de lijnen
  liggen). Composite: lijnen × 0,8 over vulling, geheel × focus·dekking (niet `contextOpacity`).
  Formule: kleur per band (bandmidden); opacity = base·(1 − k + k·f·(1 − smoothstep(0, ½, |s − L|)))
  (|s − L|/½ = afstand/halve bandbreedte in px); bandgrens = overgang over (1 − f) stap rond de lijn →
  f = 1 harde grens onder de lijn, f = 0 geen grens, bandmiddens altijd zuiver (continu waar de
  dichtstbijzijnde lijn wisselt). f = gradiëntfade (zelfde smoothstep als de lijn) × ringfade.
- **Ringfade**: geen veldbenadering maar het raster uit de tracer: `ringFadeRaster` (worker) geeft per
  roostercel (niveau, fade) rond vervaagde ringen (binnenin en ≤ 1 cel: exact de ringfade, naar 1 op
  2,5 cellen); shader gebruikt het alleen als het celniveau gelijk is aan het lokale lijnniveau.
- Unit: palet (stops exact, koud blauw/warm rood, per band), opacity (lijn/bandmidden/continuïteit),
  fademenging op een synthetische rij met één fadende lijn (sprong < base/255 bij f = 0 en 0,001; harde
  grens bij f = 1; continu voor f < 1), ringraster, lijnprofiel/breedte. 243 tests groen (zie gates).

## Dev-knoppen (MIP-12)
| knop | eigenaar | vervalt |
| --- | --- | --- |
| Vulling (basisopacity 0–0,3, default 0,12) | U25 / PO | verdwijnt bij PO-keuze 0,08/0,12/0,18 in deze merge |
| Vulling afval (0–100 %, default 70 %) | U25 / PO | verdwijnt bij PO-keuze in deze merge |
| Kaartverzadiging (0–100 %, default 55 %) | U25 / PO | verdwijnt bij PO-keuze in deze merge |
| ~~Oneven lijnen~~ | — | verwijderd in deze track |
Geen nieuwe ?-URL-parameters.

## 2026-09-25 ~09:00 — stills + meting (web/tmp/u25.mjs = `probe.mjs` hier; previews 127.0.0.1:4371 = U25, :4372 = main 30992e3, prod-data)
- Aanroep: `direnv exec .. flock /tmp/motregen-e2e.lock node tmp/u25.mjs <origin> tmp/shots <label> light|dark desktop|pixel5 [fill]`
  (env `PERF=1` meet 5 s rAF + tellers, `PLAY=1` zonder pauze, `CLIP=x,y,w,h DPR=2` uitsnede). Chromium/SwiftShader.
- `shots/`: before-/after-{desk,pixel5}-{light,dark}.png (after = vulling 0,12), fill-{008,018}-{light,dark}.png,
  debug-030-crop.png (0,30, DPR 2: bandgrenzen vallen op de lijnen).
- Leesbaarheid: vandaag 9–16 °C, dus alle banden geelgroen/groen; bij 0,12 is de vulling nauwelijks
  waarneembaar in licht, beter in donker. 0,18 leest als "gekleurde kaart" zonder de lijnen te overstemmen.
- **Rust, focus gepind, desktop 1280×800, 5 s, 2×**: main 17,4/16,6 ms gem. rAF (p95 16,8/16,7),
  U25 16,7/16,6 ms (p95 16,7/16,7); **MapLibre-renders 0/s, passes 0, fillPasses 0** in beide. Filter kost
  in rust niets meetbaars (SwiftShader; op een echte telefoon niet gemeten — de compositor past het
  filter toe per gecomponeerd frame, wat de windanimatie sowieso al triggert).
- **Afspelen + focus, 5 s, 2×** (load 17–27, SwiftShader-plafond): main 211/187 ms rAF, 23/27 passes;
  U25 200/212 ms, 25/23 passes + evenveel fillPasses. Binnen ruis.
- Randzaak: `web/public/data/chunks/uv_clear-20260828.mrf` valt onder `.gitignore` (`data/`) en ontbreekt dus in
  verse worktrees → `mrf.test.ts` faalt daar (bestaand, niet door U25). Lokaal gekopieerd uit de hoofdcheckout.

## 2026-09-25 ~10:10 — e2e-fix, volledige suite, rebase
- Eerste volledige e2e (HEAD ccd50a0, oude lock) → E2E-EXIT: 1: mijn nieuwe focus-test las `--map-saturation`
  direct na `data-focus="0.00"` (afgerond; tween stond nog op 0,998). Fix 7d1dc10: `expect.poll` op
  verzadiging en vuldekking. Geen productfout.
- Volledige e2e op 7d1dc10 (oude lock, liep al vóór de slot-regel; load 12,6 bij start) → **E2E-EXIT: 0** (32 passed, 28 skipped, 8,8 min).
- Rebase op origin/main 2cee6eb (incl. 211b57f e2e-slots) zonder conflicten → HEAD 7f564bf.

## 2026-09-25 ~10:20 — gates op 7f564bf (synchroon, web/)
- `direnv exec .. pnpm typecheck` → TYPECHECK-EXIT: 0
- `direnv exec .. pnpm test` → TEST-EXIT: 0 (43 files, 253 tests)
- `direnv exec .. pnpm build` → BUILD-EXIT: 0
- Gericht onder slot (nieuwe regel): `MOTREGEN_E2E_PORT=4366 MOTREGEN_E2E_DATA_PORT=8366 direnv exec .. pnpm e2e
  e2e/focus.spec.ts e2e/perf.spec.ts` (focus = eigen spec; perf = raakt de kaart-/isolijnpasses) → **E2E-EXIT: 0**
  (13 passed, 20 skipped, 3,6 min). Volledige suite op de merge-kandidaat is aan de orkestrator.

## Samenvatting voor de orkestrator / PO
- Klaar: dunne uniforme isolijnen (0,9–1,4 CSS-px, was 1,3–2,0 en oneven de helft; `odd` + stippelcode
  weg); basiskaart geanimeerd gedesatureerd via compositorfilter (0 renders/passes in rust, gemeten);
  KNMI-bandvulling onder de lijnen met afstandsafval en lijnfade-menging (gradiënt + ringraster uit de tracer).
- **PO-keuzes** (daarna vervallen de knoppen, zie tabel MIP-12): vulling 0,08 / **0,12 (default)** / 0,18
  (`shots/fill-*`, `after-*`); afval 70 %; verzadiging 55 %. Mijn advies: 0,18 in licht, bij de
  9–16 °C van vandaag leest 0,12 bijna als niets.
- Open: telefoon-meting van de filterkosten (alleen SwiftShader gemeten); `uv_clear-20260828.mrf` valt onder
  `.gitignore` (verse worktrees missen hem → mrf.test faalt daar; bestaand, niet U25).
