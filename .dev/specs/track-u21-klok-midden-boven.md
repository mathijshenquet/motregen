# Track U21 — versheidspil (radartijd/kaarttijd) midden boven op de kaart (claude opus)

Read first: `AGENTS.md`, `web/src/components/Freshness.tsx`, `web/src/
styles.css` (`.map-clock*`, overlay-posities, media queries ≤430/≤768/
≤959), `web/src/App.tsx` (overlay-insets voor de contain-fit uit U14:
`constrainView`-padding; zoekbalk linksboven, themaknop rechtsboven op
mobiel, zoomknoppen, merk linksonder desktop / boven op mobiel),
`web/e2e/freshness.spec.ts` (overlapchecks pil vs merk), `.dev/tracks/
u17-ui-polish/LOG.md` en U14-LOG (waarom de pil waar staat). Your LOG:
`.dev/tracks/u21-klok-midden-boven/LOG.md` — committed, append-only,
timestamped. Branch `track/u21-klok-midden-boven` vanaf main. Eigen
worktree. Preview: http://ageq-mthq:4300/.

## PO (2026-09-25)

"Die klok zou nu toch midden boven moeten staan?" — U17 maakte de pil
groter (tijd groot, leeftijd eronder) maar liet hem rechtsonder (desktop)
en rechtsboven (mobiel) staan. Gewenst: de pil horizontaal gecentreerd aan
de bovenrand van de kaart, op desktop én mobiel.

## Opdracht

1. Positioneer `.map-clock` top-center van het kaartvlak (transform
   translateX(-50%)), safe-area-inset-top meegenomen. Desktop: vrij van de
   zoekbalk links en de zoomknoppen rechts (bij smalle desktopbreedtes
   moet de zoekbalk krimpen of de pil eronder gaan; kies, motiveer). Mobiel:
   vrij van zoekbalk/themaknop/merk; als de eerste rij vol is, pil op een
   tweede rij onder de zoekbalk, gecentreerd.
2. Werk de U14-overlay-insets bij zodat de contain-fit (NL volledig in
   beeld) ook onder de pil vrij blijft (Groningen/Wadden-labels niet onder
   de pil).
3. Het versheidspaneel (tik op de pil) opent gecentreerd onder de pil.
4. e2e: vervang de "pil rechts van merk"-checks door "pil gecentreerd (±8
   px), geen overlap met zoekbalk/themaknop/zoomknoppen/merk" op desktop,
   Pixel 5 portrait en 320 px; screenshots vóór/na licht/donker.

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, `MOTREGEN_E2E_PORT=4358
MOTREGEN_E2E_DATA_PORT=8358 pnpm e2e` (hostlock, load < 16, één Chromium,
poorten vooraf vrij) green, synchrone exit statussen in LOG. Previews:
eerst `pnpm build` of eigen `--outDir`. Draft-PR vroeg. Geen codex.
