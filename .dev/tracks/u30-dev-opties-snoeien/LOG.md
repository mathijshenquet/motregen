# U30 — dev-opties snoeien (MIP-12) — worker LOG (append-only)

## 2026-09-25 11:10 — start, inventaris op main `ab3fb05`

Worker: claude opus 5.5. Branch `track/u30-dev-opties-snoeien`, rebased = main (U22 en U25 zitten
erin, U24 nog niet → windknoppen wachten, PO-aanvulling: rest nu).

Inventaris vóór (verschilt van MIP-12 omdat U22/U25 al snoeiden en toevoegden):

- URL-parameters (6): `?dev`, `?perf=1`, `?labelfade`, `?histogram=wait`, `?zon=markering`,
  `?uvbalk=stip` (`?klok`/`?zoekpaneel` al weg door U22).
- Dev-paneel (30 bedieningselementen + 2 notities): Isolijnen, Vulling, Vulling afval,
  Kaartverzadiging (U25, vervallen in U25b), Tijdvenster, Label-afstand, Label-spatiëring,
  Vectorlijnen, Lusjes <, Verdichting, Bicubisch, Contour px/CSS-px, Contour max, Glad (labels),
  Vervagen, |∇T| laag, |∇T| hoog, Snelheid laag, Snelheid hoog, Veldblur, Focus dim, Tween in,
  Tween uit, Wolkrand, Grafiek vult, Min. breedte, Temp-afstand, Splash ×, Herhaal splash,
  Reset alle instellingen; notities "Maximale kaartzoom", reset-status.
- PerfHud windknoppen (15), `motregen-wind-tuning-v3`.

Bundle vóór (`pnpm build`, BUILD-EXIT 0): JS `index-*.js` 1 298,10 kB (gzip 367,49 kB),
CSS 121,65 kB (gzip 21,07 kB), workers 4,17 / 8,91 / 9,16 kB.

Plan: (1) URL-params + weg-knoppen + Wolkrand-laag weg, constanten met herkomst; (2) paneel
groeperen met uitleg; (3) PerfHud-knop in paneel; (4) docs/dev-opties.md + AGENTS-regel;
(5) na U24-merge: wind v4.
