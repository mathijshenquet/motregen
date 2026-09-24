# U14 — mobiele layout (claude opus) — LOG

- 2026-09-24 11:40 CEST — Start. Spec `.dev/specs/track-u14-mobiel-layout.md`. Omgeving:
  `direnv allow`, `pnpm install --frozen-lockfile` (web/). Vóór-shots: `pnpm build` op main-HEAD
  (eac6b5d), `MOTREGEN_DATA_ORIGIN=https://motregen.nl/data pnpm preview --port 4314`, dan
  `node ../.dev/tracks/u14-mobiel-layout/shots.mjs http://127.0.0.1:4314/ before` → exit 0.
  Set: Pixel 5 portrait (393×727) + landscape (727×393), licht/donker; per combinatie viewport,
  volledige pagina (`-full`), gescrold 400 px (`-scrolled`) en open zoekveld (`-search`).
- Bevindingen vóór (metingen uit het script, px):
  - Portrait: kaart 0–349 (48 % van 727), dan `.sidebar-nav` 349–411, scrubber 411–709,
    tabel vanaf 709. Landscape: kaart 320 (81 %, via `minmax(320px, 48svh)`), nav 62, scrubber
    pas vanaf 382 = volledig onder de fold.
  - De lege band is NIET `current-weather` (bestaat niet meer in de JSX) maar `.sidebar-nav`:
    62 px min-height met op mobiel alleen de UV-chip (alleen bij insmeren) + de thema-segmented,
    die ≤959 px verborgen is (thema zit als ronde knop op de kaart). Zonder UV-advies = leeg.
  - Overlays: zoekbalk 12–54 en themaknop 12–56 bovenin, merk 300–339 linksonder, versheidspil
    269–327 rechtsonder. In portrait (hoogte-gebonden contain) valt Terschelling/Vlieland onder
    de zoekbalk en Zeeland onder het merk.
  - Landscape: verticale naad bij x≈158 CSS-px links in de kaart (zichtbaar in donker) — nader
    te bekijken, mogelijk contain-rand.
