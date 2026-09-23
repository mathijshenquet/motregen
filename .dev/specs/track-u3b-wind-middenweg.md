# Track U3b — windparticles: middenweg tussen buffer-trails (oud) en polylines (U3) (claude opus)

Read first: `AGENTS.md`, `.dev/specs/track-u3-wind-trails.md`,
`.dev/tracks/u3-wind-trails/LOG.md` (metingen, screenshots, ontwerpkeuze),
`web/src/core/wind-layer.ts` op main (U3: polylines met `advanceLife`/
`lifeAlpha`, tuning-knoppen in PerfHud) én de oude implementatie
`git show 07cda00e:web/src/core/wind-layer.ts` (ping-pong trail-FBO met
fade-pass, `WIND_TRAIL_FADE`), `docs/perf.md`. Your LOG:
`.dev/tracks/u3b-wind-middenweg/LOG.md` — committed, append-only,
timestamped. Branch: `track/u3b-wind-middenweg` vanaf main. Eigen worktree.
Integratie-instantie met U3 live: http://ageq-mthq:4300/.

## PO-feedback op U3 (2026-09-23)

"De oude particles hadden een nicere vibe; laten we een middenweg zoeken.
Dat de trails nu in hun geheel uitfaden is niet ideaal — het buffer-achtige
was juist mooi. Cleaner: de HEAD fadet weg / krijgt lagere intensiteit, en
de tail trekt dan vanzelf weg."

## Opdracht

1. Terug naar het buffer-model als basis (trail-FBO met per-frame fade,
   zoals vóór U3): de tail ontstaat door de buffer, niet door een
   polyline. Behoud uit U3 wat de PO wél wilde: (a) afstandsbegrensd
   leven (elke particle legt ~dezelfde schermafstand af), (b) geen korte
   stompjes (fade-in van de HEAD-alpha bij spawn), (c) einde van het leven
   = de head-intensiteit loopt af naar 0 over de laatste x px, waarna de
   tail via de buffer uitsterft — geen abrupte dood, geen "hele trail
   fadet weg", (d) anti-aliasing van de gestempelde head (feathered
   punt/segment i.p.v. 3×3-blok), (e) de tuning-knoppen + localStorage +
   JSON-export uit U3 blijven, met de knopset aangepast aan dit model
   (buffer-fade per seconde i.p.v. per frame zodat het framerate-
   onafhankelijk is, head-intensiteit, afstand per leven, fade-in-px,
   fade-out-px, dichtheid, globale intensiteit).
2. De "drukte over zee"-vraag: meet opnieuw de inkt land vs zee met U3's
   `wind-ink.ts` (hergebruik) en log vóór (main=U3), oud (07cda00e) en na.
   Doel: zee ≤ land-inkt, land ≈ 0,8× oud.
3. Frametijd mobiel profiel: de 2 fullscreen-passes komen terug; meet met
   U3's `measure-wind.ts` en houd het ≤ oud (docs/perf.md). Overweeg de
   trail-FBO op halve resolutie als dat nodig is (knop).
4. Screenshots licht/donker, land+zee, vóór/oud/na in de LOG-map; korte
   Playwright-video van spawn→dood van één particle-cluster als dat lukt.

## Gates

`pnpm typecheck`, `pnpm test` (leven/alpha-wiskunde getest), `pnpm build`,
`MOTREGEN_E2E_PORT=4299 MOTREGEN_E2E_DATA_PORT=8299 pnpm e2e` green,
synchrone exit statussen in LOG. Draft-PR vroeg. Geen codex. Scope:
wind-layer.ts, PerfHud, tests, meetscripts; App.tsx alleen als het echt
moet (U7/U8 werken daar parallel).
