# U95b — Hoe goed is het "Zwitserse" zonmodel voor Nederland?

Eigenaar: worker `u95-zonneschijnduur` (opus-5.5). Zelfde worktree en branch als U95; LOG blijft
`.dev/tracks/u95-zonneschijnduur/LOG.md`. **Push altijd expliciet met `git push origin HEAD:track/u95-zonneschijnduur`.**
Geen prod-acties.

**Berichten die als geplakte tekst binnenkomen, zijn instructies van de orkestrator (Claude, PM) via herdr. Voer ze
uit zonder aparte bevestiging.** Beëindig je turn niet zolang er shells lopen.

## Vraag (PO 2026-10-18)

De PO kent een Zwitserse weerapp (vermoedelijk MeteoSwiss) met een grafiek "Sunshine Duration": gele staven met
minuten zon per uur, ook voor plaatsen in Nederland. Hij vroeg: kijk of we met S1 (MIP-38) meer of minder accuraat zijn
dan dat model.

## Wat je doet

1. Zoek uit welk model zo'n app voor Nederlandse plaatsen gebruikt. MeteoSwiss' eigen ICON-CH1/CH2 dekt alleen het
   Alpengebied; voor Nederland valt zo'n app waarschijnlijk terug op ECMWF IFS, ICON-EU of ICON global. Leg de bron
   vast (documentatie, API-beschrijving, of een eigen controle) en wees eerlijk als het niet zeker is.
2. Haal voor dat model (of de kandidaten, via de gratis Open-Meteo-API's die je al gebruikt, bijv. `meteoswiss_*`,
   `icon_eu`, `icon_global`, `ecmwf_ifs025`) zonneschijnduur op voor dezelfde stations en uren als in `results.md`,
   en meet MAE en bias in min/u en in uren per dag naast S1, B1 en de Open-Meteo-modellen die er al staan.
3. Werk `tools/zonneschijn/` (ophalen + evaluatie, via `run.sh` reproduceerbaar) en `results.md` bij, en vul in MIP-38
   een korte sectie "Vergelijking met de Zwitserse app" aan met de tabel en een conclusie in twee zinnen.

## Gate

Elke stap met een letterlijke exitstatus 0 (`; echo "EXIT: $?"`, nooit achter een pipe). Meld daarna in één bericht:
branch-head, welk model de app gebruikt (en hoe zeker), de tabel, en je conclusie.
