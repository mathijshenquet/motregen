# Track U20 — windregressies na U12/U19: zoom-fade, heftiger beeld, artefacten boven land (claude opus)

Read first: `AGENTS.md`, `web/src/core/wind-layer.ts` en de commits van
vandaag erop (`git log --oneline -8 -- web/src/core/wind-layer.ts`: U3b
trailbuffer, U8c eigen canvas, U12 zoom/pan-overleving + buffer-blit bij
resize, U19 default-intensiteit ⅔ + windfocus), `web/src/core/focus-mode.ts`
(U19 windfocus), `web/src/App.tsx` (windTuning laden/bewaren, focus →
`visibility`/intensiteit), `.dev/tracks/u12-wind-zoom/LOG.md`,
`.dev/tracks/u3b-wind-middenweg/LOG.md` (defaults, meetscripts `wind-ink`,
`wind-density`, `measure-wind`). Your LOG: `.dev/tracks/u20-wind-regressie/
LOG.md` — committed, append-only, timestamped. Branch `track/u20-wind-
regressie` vanaf main. Eigen worktree. Preview: http://ageq-mthq:4300/.

## PO (2026-09-24, na de merges van vandaag)

"Het wind ziet er anders uit: (1) een zoom-fade-regressie, (2) het ziet er
eerder heftiger uit dan eerst i.p.v. minder heftig, (3) boven land zijn er
artefacten." Verwachting was: ⅔ intensiteit als default (U19), zoom zonder
wegvallen (U12).

## Opdracht

1. **Bisect met beelden**: bouw drie builds (main vóór U12 = `c6236129^`,
   ná U12 = `c6236129`, ná U19 = huidige main) en maak per build dezelfde
   opnames (desktop 1280×800, DPR 2, live data, zoom z6→z8 en terug, 8 s
   video + stills na 2/4/6 s; land + zee in beeld; licht en donker). Leg
   vast welke commit welk symptoom introduceert. Let op localStorage: test
   zowel met lege `motregen-wind-tuning-v2` als met een tuning-set die de
   PO waarschijnlijk heeft (U3b-defaults; vraag in LOG welke JSON de PO
   kan sturen via "Kopieer als JSON").
2. **Verdachten**: (a) U19 verlaagt de default via de tuning-default maar de
   PO heeft opgeslagen tuning → oude intensiteit 1,9 blijft, of de
   windfocus-tween eindigt niet op ⅔ maar op 1 (of stapelt met
   `visibility`); (b) U12's blit van de trailbuffer bij transform laat oude
   trails staan of dubbelt inkt (artefacten boven land, "heftiger"); (c) de
   fade-in van aanvullers zonder stagger spawnt in één klap (zichtbaar
   pulseren); (d) resize/zoom-blit op DPR 2 verschuift een halve pixel
   (rasterartefact). Meet inkt land/zee met `wind-ink` per build.
3. **Fix** zodat: ⅔ intensiteit de effectieve default is (ook bij oude
   opgeslagen tuning: migreer of scaleer de opgeslagen intensiteit één keer,
   met LOG-motivatie), zoom/pan geen blank én geen dubbeling geeft, geen
   rasterartefacten; windfocus tweent ⅔ → 1 en terug, meer niet.
4. Regressietests: unit voor de tuning-migratie en de focus-eindwaarden;
   e2e-still na zoom (geen blank, inkt binnen ±20 % van vóór de zoom).

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, `MOTREGEN_E2E_PORT=4356
MOTREGEN_E2E_DATA_PORT=8356 pnpm e2e` (hostlock, load < 16, één Chromium,
poorten vooraf vrij) green, synchrone exit statussen in LOG. Previews:
eerst `pnpm build` of eigen `--outDir`. Video's/stills vóór/na in de LOG-
map. Draft-PR vroeg. Geen codex.
