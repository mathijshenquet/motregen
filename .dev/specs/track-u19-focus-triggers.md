# Track U19 — isolijn-trigger van de kaartlabels af; wind gedempt met hover-focus (claude opus)

Read first: `AGENTS.md`, `web/src/core/focus-mode.ts` (+ test),
`web/src/App.tsx` (focus-handlers: hover/focus op `motregen-temperature`-
kaartlabels én op de tabelkolom "Gevoel"; `ForecastTable` focus-props;
`windTuning`/`intensity`), `web/src/components/ForecastTable.tsx`,
`web/src/core/wind-layer.ts` (tuning `intensity`, `visibility`),
`web/e2e/focus.spec.ts`. Your LOG: `.dev/tracks/u19-focus-triggers/LOG.md`
— committed, append-only, timestamped. Branch `track/u19-focus-triggers`
vanaf main. Eigen worktree. Preview: http://ageq-mthq:4300/.

## PO (2026-09-24)

"Zet de isolijnen-op-hover op de temperatuurlabels op de kaart uit, dat is
me iets te gortig. Wind iets terugschroeven, bv. naar 2/3 opacity, en bij
hover op het windveld terug naar vol."

## Opdracht

1. Isolijn-focus wordt NIET meer getriggerd door hover/tik/focus op de
   stadstemperatuurlabels op de kaart; wel nog door hover/toetsenbordfocus
   op de tabelkolom "Gevoel" (kop + cellen) en de touch-pin op de kolomkop.
   Verwijder de kaart-handlers (geen dode code laten staan); e2e in
   `focus.spec.ts` aanpassen (map-hover-case → asserteert géén focus).
2. Wind: standaard-intensiteit ×2/3 (via de bestaande tuning-default, zodat
   de knop en localStorage-override blijven werken; bestaande opgeslagen
   v2-tuning van de PO respecteren — alleen de default wijzigt). Nieuwe
   focusmodus "wind": hover/toetsenbordfocus op de tabelkolom "Wind"
   (kop + cellen) tweent de windlaag naar volle intensiteit (factor 3/2
   t.o.v. de gedempte default, dus 1,0), en dimt niets anders; touch: tik
   op de kolomkop "Wind" pint, zoals bij Gevoel. Dezelfde tween-familie
   (`focus-mode.ts`, reduced-motion). Beide focussen sluiten elkaar uit
   (laatste wint).
3. Unit tests voor de focus-state-machine met twee modi; e2e: wind-kolom-
   hover verhoogt `data-wind-focus`/intensiteit en de map-label-hover doet
   niets meer.

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, `MOTREGEN_E2E_PORT=4351
MOTREGEN_E2E_DATA_PORT=8351 pnpm e2e` (hostlock, load < 16, één Chromium,
poorten vooraf vrij checken) green, synchrone exit statussen in LOG.
Previews voor screenshots: eerst `pnpm build` of eigen `--outDir`. Draft-PR
vroeg. Geen codex. U17 (UI-polish) en U18 (DCT-veld) werken parallel —
blijf bij focus-mode/App-focuspaden/ForecastTable-props/wind-tuning.
