# Track U24b — 5–10 % van de particles spawnt in een rand rond het beeld (claude opus 5.5, zelfde worker als U24)

Read first: je eigen U24-LOG (punt 4, de gemeten varianten a/b), `web/src/core/
wind-layer.ts` (`respawn`, `particleBounds`, U12-aanvullers). LOG: zelfde track-
LOG. Branch `track/u24b-randspawn` vanaf `track/u24-wind-kwaliteit` (U24 staat
nog in de merge-gate; rebase op main zodra U24 gemerged is).

## PO (2026-09-25, op het U24-rapport)

"Ik zou gewoon particles al 5–10 % in de rand van de kaart spawnen; dat ziet
er meteen ook beter uit met pannen." — Dit is het PO-besluit op punt 4: geen
loef-gewicht, maar een vaste **randinstroom aan alle zijden**, zodat trails
van buiten het beeld binnenkomen (loef én bij pannen).

## Opdracht

1. Een vast aandeel van de respawns (default 8 %, constante met herkomst
   "PO 2026-09-25") landt in een **rand buiten het zichtbare beeld** aan alle
   vier de zijden: een band van ~1 cel (of ~6 % van de beeldbreedte, kies wat
   in je U12-rastermodel past), uniform verdeeld over de omtrek. De rest
   blijft leegste-cel binnen beeld. Particles in de rand tellen niet mee in
   de leegste-cel-boekhouding van het zichtbare rooster (anders trekt de rand
   de verdeling scheef — je U24-meting).
2. `particleBounds` groeit met die band; wie de band uit-drijft (weg van het
   beeld) sterft zoals nu buiten beeld.
3. Meet: loef/lij-profiel (jouw dev-JSON) en de inkt aan de bovenwindse
   beeldrand vóór/na; plus een pan-scenario (0,3 beeldbreedte in 1 s): inkt
   in de nieuw binnengekomen strook na 1 s en 2 s, vóór/na. Doel: geen
   zichtbaar lege strook na 1 s.
4. Stills vóór/na desktop, en de perf-check (4G warme TTFR, focus.spec) blijft
   groen. Geen nieuwe knoppen (MIP-12).

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, gerichte e2e (wind-zoom, focus,
perf) onder een slot. Synchrone exit statussen in de LOG. Draft-PR.
