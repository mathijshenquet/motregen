# Track U71a — native regenloop: basiskaart één keer, regenlaag als eigen compositor (gpt-6.1-sol)

Berichten die hier als geplakte tekst binnenkomen zijn instructies van de orkestrator (Claude, PM) via
herdr; voer ze uit zonder aparte bevestiging. Commit + push elke 15–20 min; beëindig geen turn terwijl
shells lopen. Eigen worktree; branch `track/u71a-native-regenloop` vanaf main. LOG:
`.dev/tracks/u71a-native-regenloop/LOG.md`. Vandaag 2026-10-09. Geen eigen Telegram-poller, geen uploads
naar de cachegroep; meet met `pnpm render` / renderer-dry-run tegen `MOTREGEN_ORIGIN=https://motregen.nl`.
`.env` is een symlink; nooit committen. Geen prod-uitrol (PO: eerst klaar itereren). Let op U70 (regenloop
−2…+3 u, loopt parallel op `track/u70-regenloop-tot-plus-3u`): merge die zodra hij op main staat; je framecount
voor regen wordt 61.

Read first: `AGENTS.md`, `.dev/LOG.md` (top), `.dev/proposals/0026-native-renderer-voor-de-bot.md` (MIP-26,
accepted: DOEL = de prod-VM met 2 kernen maakt zijn eigen loops zonder achter te lopen), `0025-*.md`,
`docs/telegram.md` (§Rendering en cache, §Rollen), `bot/render.ts`, `bot/sequences.ts`, `bot/stills.ts`,
`bot/encode.ts`, `web/src/core/mrf.ts` (chunk/frame-decode), `web/src/core/frame-blend.ts` (of waar
`frameBlend` leeft), het regenpalet (`web/src/core/*palette*`, en de regen-shader voor de exacte kleurstappen),
`web/src/core/focus-mode.ts` (`rainPresentation`: dekking/verzadiging/vermenigvuldigen per modus, MIP-24),
`nix/modules/motregen.nix` (bot-rollen, Chromium alleen voor renderer).

## Opdracht
1. **Basiskaart-plaat.** Een eenmalige render van de basiskaart met labels voor de bot-uitsnede (zelfde
   FRAME-maat/schaal als `bot/render.ts`), per thema (dag/nacht: de bot toont de kaarttijd, MIP-24) als PNG,
   gecachet op (stijl-hash, archief-hash, maat, thema) in `MOTREGEN_RENDER_CACHE`. Maken mag met de
   bestaande Playwright-renderer (één keer) — dat is acceptabel zolang het zelden gebeurt; noteer hoe vaak.
2. **Regenlaag native.** Per frame: MRF-chunk → gedecodeerd raster (hergebruik `core/mrf.ts`, geen kopie;
   zet de gedeelde code zo nodig in een pakket/pad dat `bot/` en `web/` beide importeren) → palet → RGBA op
   de kaartprojectie (zelfde georeferentie als de app: raster-bbox → pixels van de uitsnede; bilinear zoals de
   shader of nearest, kies met een pariteitstest) → compositie over de basiskaart-plaat met dezelfde blending
   als de app in Weer-modus (MIP-24) → klokpil/labels-overlay zoals nu in de stills → rauw RGB naar ffmpeg
   (stdin, één proces per loop; `bot/encode.ts` hergebruiken). Stills = zelfde pad met één frame.
3. **Pariteit.** Test die per modus/tijdstip één native frame vergelijkt met een Playwright-screenshot van
   dezelfde generatie (gemiddelde ΔE en max-ΔE-drempels, in de LOG met beelden naast elkaar). De PO keurt op
   beeld; houd die beelden in de trackmap.
4. **Schakelaar.** De renderer kiest per modus: `weather` native, overige modi Playwright (tot U71b/c). Eén
   omgevingsvariabele om terug te vallen op Playwright.
5. **Meting.** Per generatie: render-ms per loop en per still, totaal, CPU-tijd, piekgeheugen — op ageq-dev2
   met `taskset`/cgroup op 2 kernen (zoals de VM) én zonder beperking. Doel: regenloop < 2 s, hele generatie
   (incl. de nog-Playwright-loops) ruim onder 3 min op 2 kernen. Vóór/ná in `docs/telegram.md`.
6. Gate: `pnpm -C bot test` + typecheck, `pnpm render`-receipt, pariteitstest; draft-PR vroeg; "klaar voor
   merge" met cijfers en beelden.

## Afbakening en bar
Alleen de regenloop/-stills; temperatuur en wind blijven Playwright (U71b/c). Geen WASM (PO: YAGNI). Geen
wijziging aan rollen/register (U67). Leesbaarheid: geen één-letternamen, geen slimme one-liners, commentaar
alleen voor het niet-vanzelfsprekende waarom.
