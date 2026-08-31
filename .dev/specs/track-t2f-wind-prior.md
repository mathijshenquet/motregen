# Track T2f — modelwind als gekalibreerde motion-baseline (gpt-5.6-sol)

Read first: `AGENTS.md`, MIP-5 incl. het amendement van 2026-08-31 (het
ontwerp van dit track), `docs/mrf.md`, `docs/fields.md`,
`.dev/tracks/t2d-motion/LOG.md` (de bestaande schatter + pySTEPS-harnas).
Your LOG: `.dev/tracks/t2f-wind-prior/LOG.md` — committed. Branch:
`track/t2f-wind-prior`. Keys in `.env`. NB: track T4 werkt parallel aan
`flake.nix`/`nix/` — blijf daar weg.

## Goal

De motion-schatter valt bij zwak signaal niet meer terug op no-data
(→ crossfade in de client) maar op de **gekalibreerde modelwind**. De PO's
observatie: de tween faalt zichtbaar bij verse cellen en randen; daar weet
het model wél waarheen de lucht stroomt.

## Ontwerp (MIP-5-amendement — volg dit)

1. **Windniveau**: onderzoek eerst welke windniveaus AROME p1 werkelijk
   biedt (boundary layer tot 300 m — T1 documenteerde 49 berichten per
   leadtime). Kies het hoogste beschikbare niveau als baseline-input
   (dichter bij de stuurstroming dan 10 m); documenteer in `docs/arome.md`.
   Blijft de ingest van `wind_u_ms`/`wind_v_ms` (10 m, voor de particles)
   ongemoeid? Ja — dit is een aparte interne input voor de schatter (mag
   hergebruik zijn als alleen 10 m bestaat).
2. **Online kalibratie per run**: least-squares schaal `s` + rotatie `θ`
   tussen betrouwbare correlatievectoren (definieer betrouwbaarheid: piek-
   scherpte/energie van het blok) en de tijd-geïnterpoleerde modelwind op
   dezelfde blokken. Sanity-clamps (bijv. s ∈ [0,5, 2,5], |θ| ≤ 60°); te
   weinig betrouwbare blokken (< N, kies en documenteer) → val terug op de
   vorige run-kalibratie, anders op een gedocumenteerde default. Log s/θ
   per run op INFO — dat wordt vanzelf een leerzame reeks.
3. **Toepassing**: (a) blokken zonder betrouwbaar signaal krijgen
   `s·R(θ)·wind` in plaats van buursmoothing/no-data; (b) blokken met
   matige betrouwbaarheid worden gewogen gemengd (gewicht =
   betrouwbaarheid); (c) sterke blokken blijven puur correlatie. De
   bestaande smoothing draait ná de menging.
4. **Contract ongewijzigd**: zelfde annex, zelfde kwantisatie. De client
   hoeft niets te weten.
5. **Validatie**: pySTEPS-harnas uitbreiden — vergelijk de gemengde velden
   opnieuw (mediaan-afwijking op signaalblokken mag niet verslechteren) én
   een gerichte casus: kies een frame-paar met verse cellen/randen en laat
   met quiver-plots + vulgraad-metriek (% blokken met geldige motion vóór
   vs ná) zien wat de winst is. Rapporteer eerlijk als de winst klein is.
6. **E2e**: daemon-run; annex-vulgraad in de LOG (verwachting: veel dichter
   bij 100% dan nu); `mrf dump-motion`-spot-check dat zee-/randblokken nu
   plausibele vectoren dragen.

## Out of scope

Frontend, p3-dataset (700 hPa — aparte afweging later), particles-gedrag,
`docs/contract.md`, `flake.nix`/`nix/` (T4).

## Gates & receipts

Workspace fmt/clippy/test green; SYNCHRONE receipts (pipefail) + repro's;
onafhankelijke re-run + vulgraad/kwaliteitscheck volgen voor merge.
