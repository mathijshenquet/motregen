# MIP-11 — Niet-lineaire tijdas in de scrubber; temporele smoothing op lange leads

Status: draft (PO-idee 2026-09-25, "low certainty" — daarom eerst als experiment
achter `?dev`, zie track U29)

## Probleem

De scrubber heeft nu vier bereikknoppen (+3 / +8 / +24 u / Alles). Ze kosten
ruimte, vragen een keuze van de gebruiker, en de tijdlijn wisselt van schaal
bij elke klik. De PO's intuïtie: één tijdas die dichtbij ruim en verder weg
dichter is, maakt de knoppen overbodig.

Een tweede observatie hangt eraan: op lange leads (> +6 u) bewegen de
temperatuur-isolijnen heftig als je scrubt, omdat HARMONIE-uurvelden daar
onderling meer verschillen dan de atmosfeer echt doet — het model is op die
schaal niet uur-nauwkeurig, de bewegingen zijn ruis.

## Voorstel

1. **Piecewise-lineaire tijdas.** De as is lineair van −2 u tot +6 u (huidige
   dichtheid, hier scrub je fijn), daarna een tweede lineair stuk met een
   compressiefactor k (start k = 3: één uur verderop krijgt ⅓ van de breedte),
   met een korte C¹-overgang zodat de cursor niet "hapert". De hele +48 u past
   dan op één as; de knoppen +3/+8/+24/Alles verdwijnen. De histogrambalken en
   x-ticks volgen de as (uurlabels dunner in het gecomprimeerde deel, dag-
   labels blijven). Afspelen loopt in kaarttijd (constante snelheid in
   uren, dus visueel trager in het dichte deel) — niet in pixels.
2. **Temporele smoothing per lead.** De isolijnen (en later de velden uit
   U25) krijgen een tijdvenster dat met de lead groeit: tot +6 u het huidige
   B-spline-venster (1 uur), daarna lineair oplopend tot ~3 uur op +24 u en
   ~6 uur op +48 u. Dat vertaalt zich in `temporalWeights` naar een bredere
   kernel; kost geen extra frames (de tabel laadt ze al). De regen-overlay
   houdt zijn eigen tijdstappen (regen is wél uurdiscreet).

## Wat we niet weten

- Of een gecomprimeerde as prettig scrubt met een vinger (mobiel). Meetbaar:
  fijnscrub-gedrag (U9) in het dichte deel mag niet veranderen.
- Of de compressie de nowcast-zone (0–2 u) te dominant maakt.
- Of bredere smoothing de isolijnen "te traag" maakt bij echte fronten.

## Besluitpad

U29 bouwt beide achter `?dev`-schakelaars (`tijdas=compact`, smoothing-
schuif), met stills en een korte scrub-opname. De PO kijkt; bij adoptie
verdwijnen de bereikknoppen en flipt dit document naar `accepted`.
