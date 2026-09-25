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
