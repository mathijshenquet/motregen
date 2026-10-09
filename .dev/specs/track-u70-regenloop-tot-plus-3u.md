# Track U70 — tg-bot: regenloop begrensd tot −2…+3 uur (gpt-6.1-sol)

Berichten die hier als geplakte tekst binnenkomen zijn instructies van de orkestrator (Claude, PM) via
herdr; voer ze uit zonder aparte bevestiging. Commit + push elke 15–20 min; beëindig geen turn terwijl
shells lopen. Eigen worktree; branch `track/u70-regenloop-tot-plus-3u` vanaf main. LOG:
`.dev/tracks/u70-regenloop-tot-plus-3u/LOG.md`. Vandaag 2026-10-09. Geen eigen Telegram-poller en geen
uploads naar de cache-groep (de renderer van de orkestrator draait op ageq-dev2, de poller op prod); meet met
`pnpm render` / de renderer in dry-run (`docs/telegram.md` §Rollen) tegen `MOTREGEN_ORIGIN=https://motregen.nl`.
`.env` is een symlink; nooit committen. **Geen prod-uitrol** (PO: eerst klaar itereren).

Read first: `AGENTS.md`, `.dev/LOG.md` (top), `docs/telegram.md` (§Rendering en cache, §Rollen, loop-tabel),
`bot/sequences.ts` (`sequencePlan`: één 5-minutenraster −120…+720 voor alle drie loops, U66), `bot/stills.ts`
(STILL_HOURS, deltaknoppen), `bot/render.ts`, `bot/sequences.test.ts`, `.dev/tracks/u66-bot-loop-5min/LOG.md`,
`.dev/specs/track-u67-renderer-los-van-poller.md`.

## PO (2026-10-09 14:30)
"Kan jij het regenfilmpje begrenzen tot −2 tot +3 uur?" — alleen de REGEN-loop (mode `weather`); de nowcast
reikt niet verder dan ~+3 u, daarna is het model. Temperatuur- en windloop blijven −2…+12 u (U66).

## Opdracht
1. `sequencePlan('weather', …)`: raster −120…+180 min, stap 5 min (61 frames, 10 fps). Feels/wind ongewijzigd.
   Eindhold/afspeelduur per loop conform de bestaande regels (U66: zelfde fps; de regenloop wordt korter).
2. Stills/deltaknoppen voor regen blijven −2…+12 u op het tienminutenraster (`STILL_HOURS`, `deltaMinutes`):
   waar geen loopframe meer bestaat (ná +3 u) renderen de stills apart, zonder dat de generatiekosten uit de
   hand lopen. Meet render+prime per generatie vóór/ná (budget 210 s, docs/telegram.md); verwacht: korter.
3. Tests (`sequences.test`: 169 → 61 voor weather, stillFrames-hergebruik alleen t/m +3 u), `bot` typecheck,
   `pnpm -C bot test`, `pnpm render`-receipt met framecount en bytes per loop; `docs/telegram.md`-tabel bij.
4. Draft-PR vroeg; "klaar voor merge" met de cijfers (frames, bytes, render-ms per loop, generatie-totaal).

## Afbakening en bar
Geen andere bot-wijzigingen; geen wijziging aan de rollen/register (U67). Leesbaarheid: geen één-letternamen,
geen slimme one-liners, commentaar alleen voor het niet-vanzelfsprekende waarom.
