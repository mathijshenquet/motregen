# Track U17 — UI-polish: zoekbalk, About-modal, favoriet verwijderen, versheidspil (claude opus)

Read first: `AGENTS.md`, `web/src/components/LocationSearch.tsx` (+ test),
`About.tsx`, `Freshness.tsx` (+ core/freshness.ts, manifest-refresh.ts),
`web/src/styles.css`, `web/src/components/icons.ts` (Lucide deep imports),
`docs/perf.md`, `.dev/LOG.md` (T2h: publicatievertraging ~100 s na
radarframe), U10/U14-observaties over de pil op mobiel (70 px hoog).
Your LOG: `.dev/tracks/u17-ui-polish/LOG.md` — committed, append-only,
timestamped. Branch `track/u17-ui-polish` vanaf main. Eigen worktree.
Preview: http://ageq-mthq:4300/.

## PO (2026-09-24)

1. Zoekbalk subtieler/kleiner.
2. About-popup duidelijker als modal: zichtbare backdrop, bij klik op de
   backdrop/blur `preventDefault` zodat de kaart eronder niets doet (geen
   pan/klik/pick), en een duidelijke × in de popover.
3. "Favoriet verwijderen" wordt een rode prullenbak (Lucide `Trash2`) met
   bevestiging (inline "Verwijderen?" met Ja/Nee of een kleine dialog;
   geen browser-`confirm`).
4. De tijd midden boven in het scherm (de versheidspil: radartijd) iets
   groter; de datum/leeftijd ("7 min") kleiner en eronder.
5. Versheid: "hij staat op 7 min, ik zou verwachten dat hij al ververst
   was." Onderzoek de keten: KNMI-publicatie van een rtcor-frame (~3–5 min
   na scantijd), ingest-cyclus, manifest `generated`, client-poll van 60 s
   (`manifestRefreshIntervalMs`), en hoe de pil de leeftijd berekent
   (scantijd vs ontvangsttijd). Meet op prod over ≥ 30 min de leeftijd
   van het nieuwste rtcor-frame bij elke manifestwissel en de tijd tussen
   `generated` en de clientontvangst. Rapporteer de verdeling en waar de
   minuten zitten; verbeter wat aan de client ligt (bv. poll op 30 s of
   ETag-gedreven direct na verwachte publicatietijden :01/:06/…, tellende
   leeftijd correct), en zet ingest-aanbevelingen in de LOG (niet bouwen).
   Overweeg in de pil "radar 10:55" + "bijgewerkt 10:59" i.p.v. alleen
   leeftijd, als dat de verwachting beter uitlegt.

## Randvoorwaarden

Mobiel (U14) mag niet regresseren: pil blijft vrij van het merk in de
brede toestand (bestaande e2e-check), aanraakdoelen ≥ 44 px. Screenshots
vóór/na desktop + Pixel 5, licht + donker.

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, `MOTREGEN_E2E_PORT=4341
MOTREGEN_E2E_DATA_PORT=8341 pnpm e2e` (onder de hostlock, load < 16, één
Chromium) green, synchrone exit statussen in LOG. Previews voor
screenshots: eerst `pnpm build` of eigen `--outDir`. Draft-PR vroeg. Geen
codex. U16 werkt parallel in de isolijnbestanden — blijf daarbuiten.
