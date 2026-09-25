# U22 — bovenrand vast, klok kaal, merk rechtsboven, zoekpil smal, scrubber stiller

## 2026-09-25 09:05 — start
- Worker: Claude Opus 5.5 (herdr-pane), worktree `track-u22-bovenrand-en-shell`, branch
  `track/u22-bovenrand-en-shell` op main 037b531 (spec).
- Gelezen: spec U22, spec+LOG U21, Freshness/About/LocationSearch/HistogramScrubber, App-overlay,
  styles (klok/zoek/merk/ctrl/media queries), e2e freshness/location/map-zoom.
- Plan, in volgorde: (1) klok als vaste tab aan de bovenrand (varianten weg, regimewoorden
  observatie/voorspelling/trend ook in time-model, amber versheidsknop, bronkleur links+rechts);
  (2) merk → ronde druppelknop rechtsboven, thema als sectie "Weergave" in de modal "motregen.nl";
  (3) NavigationControl + ctrl-CSS weg, map-zoom.spec zonder knoppen; (4) zoekpil icoon+naam,
  inhoudsbreed, ster naar het open paneel; (5) scrubber zonder bandlabels en zonder "Vandaag".
- Structuurkeuze klok: een knop in een knop mag niet (HTML), dus de klok wordt een container met
  twee zusterknoppen: de hele tab (transparante overlay-knop, aria-label met kaarttijd/regime) en
  de amber versheidsknop erbovenop (eigen aria-label). Beide openen hetzelfde paneel.
