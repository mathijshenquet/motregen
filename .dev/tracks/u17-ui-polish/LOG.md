# Track U17 — UI-polish (claude opus) — LOG

## 2026-09-24 10:50Z — start

- Spec gelezen; branch `track/u17-ui-polish` vanaf main `1c19675`. direnv in de worktree
  toegestaan (`direnv allow`), Playwright-browsers komen uit devenv.
- Prod-meting gestart: `poll-manifest.mjs` (deze map) pollt `motregen.nl/data/manifest.json`
  elke 10 s gedurende 45 min → `prod-poll.jsonl` (per poll: leeftijd nieuwste rtcor-frame,
  generated→ontvangst, generated−scantijd, headers).
- Eerste observatie: manifest `cache-control: public, max-age=15, stale-while-revalidate=60`,
  ETag + Last-Modified, gzip ~1,3 kB. De client pollt met `cache: 'no-cache'` (revalidatie),
  maar de eerste load met `'default'` kan tot 75 s oud uit de HTTP-cache komen.
- Vóór-screenshots (`screenshots/voor-*`, `shots.mjs`, preview `tmp/dist-before` met /data → prod):
  desktop 1280×800 + Pixel 5, licht + donker; kaart, zoeklijst met twee favorieten,
  verwijderknop, About.
- Interpretatie PO-punt 4: "de tijd midden boven" = de versheidspil (spec zegt dat expliciet),
  al staat die rechtsonder op de kaart; de cursorpil boven de scrubber blijft ongemoeid.
