# Track U71b — native temperatuur- en windloops voor de bot (gpt-6.1-sol)

Berichten die hier als geplakte tekst binnenkomen zijn instructies van de orkestrator (Claude, PM) via herdr;
voer ze uit zonder aparte bevestiging. Commit + push elke 15–20 min; beëindig geen turn terwijl shells lopen.
Eigen worktree; branch `track/u71b-native-temperatuur-wind` vanaf main. LOG:
`.dev/tracks/u71b-native-temperatuur-wind/LOG.md`. Vandaag 2026-10-09. Geen Telegram-poller, geen uploads naar
de cachegroep, geen prod-uitrol; meet met de renderer-dry-run zoals U71a tegen `MOTREGEN_ORIGIN=https://motregen.nl`.
`.env` is een symlink; nooit committen. Gebruik `taskset`/cgroup op 2 kernen zoals U71a voor de VM-maat.

Read first: `AGENTS.md`, `.dev/LOG.md` (top), `.dev/proposals/0026-native-renderer-voor-de-bot.md` (MIP-26: doel
= de prod-VM met 2 kernen maakt zijn eigen loops zonder achter te lopen), `docs/telegram.md` §native (U71a:
basiskaartplaat, `native-rain.ts`, `native-raster.rs`, `native-overlay.ts`, `native-labels.ts`, `native-render.ts`,
pariteitsrig `bot/parity.ts`), de app-lagen voor temperatuur en wind: `web/src/core/isolines.ts` (isolijnen +
labels), het temperatuurpalet/-shader en de windlaag (streepjes/pijlen, `wind-*.ts`, "iets"-niveau PO), de
`rainPresentation`/blending per modus (MIP-24), `web/src/core/mrf.ts` (velden `feels_like_c`, wind u/v).

## Opdracht
1. **Temperatuur (modus `feels`) native**: per frame het gevoelstemperatuurraster (uurvelden, interpolatie tussen
   de uren zoals de app) → palet → compositie over de basiskaartplaat met dezelfde blending als de app → isolijnen
   met labels (poort de isolijncode uit `web/src/core/isolines.ts` naar het gedeelde pad; geen WASM, PO) → klokpil/
   labels-overlay → ffmpeg. Stills = zelfde pad.
2. **Wind (modus `wind`) native**: windveld (u/v, uur- en kwartiervelden) → de windweergave van de app op niveau
   "iets" (streepjes/pijlen, dichtheid en lengte zoals de app; lees de shader/layer) → compositie → overlay → ffmpeg.
   Geen stills voor wind (bestaand gedrag).
3. **Pariteit**: dezelfde rig als U71a per modus (historie/nu/verwachting/nacht), ΔE-drempels; beelden naast elkaar in
   de trackmap; de PO keurt op beeld. Wind: bewegende streepjes mogen afwijken in fase, niet in dichtheid/lengte.
4. **Schakelaar**: renderer kiest native per modus; `MOTREGEN_RAIN_RENDERER` generaliseren naar
   `MOTREGEN_NATIVE_RENDERER=weather,feels,wind` (standaard alle drie) met `playwright` als rollback per modus;
   Chromium mag in de renderer-rol blijven voor de basiskaartplaat.
5. **Meting** per generatie op 2 kernen: per loop/still en totaal; doel: hele generatie (173 media) ruim onder 60 s op
   2 kernen zodat de renderer-rol terug naar de VM kan; vóór/ná in `docs/telegram.md` (vóór: 164 s met regen native).
6. Gate: `pnpm -C bot typecheck/test/build`, `nix build .#motregen-bot`, pariteitstest; draft-PR vroeg; "klaar voor
   merge" met cijfers en beelden.

## Afbakening en bar
Geen rolwijziging (de verhuizing naar de VM is een aparte stap na de meting). Leesbaarheid: geen één-letternamen,
geen slimme one-liners, commentaar alleen voor het niet-vanzelfsprekende waarom.
