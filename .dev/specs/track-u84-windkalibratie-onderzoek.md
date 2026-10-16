# U84 — onderzoek: hoe kan de wind-kalibratie van de bewegingsvectoren beter?

Eigenaar: worker `u84-windkalibratie` (gpt-6.1-sol). Orkestrator: Claude (PM-rol voor deze track).
Branch `track/u84-windkalibratie` vanaf `origin/repro/regenbeweging`. Track-LOG:
`.dev/tracks/u84-windkalibratie/LOG.md` (append-only, tijd uit `date`). Dit is een **onderzoekstrack**: je levert
metingen en een voorstel, geen productiewijziging. Parallel haalt track U82 de windprior uit de annex
(`.dev/specs/track-u82-motion-zonder-windprior.md` — lees die eerst voor de context en de gemeten feiten).

## Vraag van de PO
"Is die wind prior dan nooit nuttig?" en "Zoek ook uit hoe die calibratie beter kan."

## Wat we weten
- Sinds 823ef8c (2026-08-31) mengt `motion::blend_with_wind` de blokcorrelatie met 300 m-HARMONIE-wind, per run
  gekalibreerd met één schaal en rotatie (`motion::calibrate`, klem ±60°, schaal 0,5–2,5). Prod-journal
  (`ssh root@57.129.47.17 'journalctl -u motregen-ingest | grep "motion wind calibration"'`) toont deze week: rotatie
  in ruim een derde van de runs tegen de klem, verder verspreid tussen −60° en +60°; 2026-10-16 06:00–06:20Z elke run
  −60°, schaal 1,3–1,6.
- Op de snapshot `~/motregen-profiles/data-snapshots/2026-10-16-0810/` beweegt regen boven de Noordzee (+5, −3) cellen
  per 5 min (oost, rij omlaag = zuid); de correlatie ziet dat; de windprior trekt het naar (+1…+2,5, −7…−8).
- Omrekening wind → cellen: `motion_wind_blocks` in `crates/ingest/src/pipeline.rs` (m/s × 60 / (1000 · cos φ), v
  omgedraaid voor rij-omlaag). De 300 m-velden komen uit `crates/knmi-grib` ("300 m U/V-wind").

## Onderzoeksvragen (meet, speculeer niet)
1. **Klopt het windveld zelf?** Vergelijk de 300 m-wind (HARMONIE uit de VM-cache
   `/var/lib/private/motregen/.ingest-cache/arome/`, of decodeer lokaal een tar) met de 10 m-wind die de app als
   kaart toont en met de werkelijke regenverplaatsing. Controleer: juiste GRIB-parameter en hoogte, grid- of
   aardrelatieve componenten (resolutionAndComponentFlags), tekens, eenheden, het tijdstip dat bij het framepaar
   hoort (`wind.interpolate(midpoint)`), en de blokindex/rij-oriëntatie in `motion_wind_blocks`.
2. **Waarom springt de fit?** Meet per run: aantal betrouwbare monsters, spreiding van de hoek tussen correlatie en
   wind, en of een paar dominante blokken (rand, artefacten, clutter, nulverplaatsing van stilstaande echo's) de
   kleinste-kwadratenfit trekken. Is één rotatie+schaal per run überhaupt het juiste model (stuurwind veranderd met
   hoogte/tijd, buien die ten opzichte van de wind propageren)?
3. **Wat zou beter werken?** Bijvoorbeeld: andere stuurlaag (700/850 hPa), robuuste fit (mediaan/Huber, uitbijters
   weg), regionale of tijdsafhankelijke kalibratie, een betrouwbaarheidsdrempel waaronder je de prior niet gebruikt,
   of helemaal geen windprior maar de run-eigen mediaansnelheid. Toets elk alternatief met dezelfde maat:
   verschil tussen annexvector en werkelijke blokverplaatsing (cellen/5 min), op ten minste zes datasets
   verspreid over de week (rustig/buiig/front, dag/nacht) — haal ze van de VM-cache of uit oudere chunks.
4. **Is de prior nuttig voor de warp?** Hoe vaak heeft een blok mét zichtbare regen geen eigen correlatie, en wat
   kost de run-mediaan daar tegenover een goede wind? Dit bepaalt of het de moeite waard is.

## Oplevering
- `docs/motion-windkalibratie.md` (Nederlands): bevindingen met tabellen, de root cause als je die vindt, en een
  genummerd advies met kosten/baten. Plus een MIP-concept in `.dev/proposals/` (`Status: draft`) als een product- of
  architectuurkeuze nodig is.
- Meet- en analysecode gecommit (Rust-voorbeelden onder `crates/*/examples/` of uv-scripts), exacte reproduceer-
  commando's in de LOG. Alleen-lezen op de VM; geen prod-mutaties.
- Leesbaarheid: geen één-letternamen, geen slimme one-liners. Commit elke 15–20 minuten, push.
  Een eerlijke "dit is niet te redden" is evenveel waard als een fix.

Meld **"U84 klaar"** met head-sha en de drie belangrijkste bevindingen.
