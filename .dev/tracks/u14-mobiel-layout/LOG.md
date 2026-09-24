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
- 2026-09-24 12:40 CEST — Draft-PR https://github.com/mathijshenquet/motregen/pull/41 geopend na de vóór-commit.
- 2026-09-24 13:10 CEST — Layout gebouwd (CSS in `styles.css`, blokken "Mobiel (U14)" en "Telefoon liggend"):
  - **Portrait ≤959 px**: `.app-shell` block i.p.v. grid; kaart `max(60dvh, 100dvh − 236 px − safe-bottom)`,
    scrubber vaste hoogte 236 px (+ safe-bottom), `scrub-surface` flex-vult. Pixel 5: kaart 0–491 (67 %),
    scrubber 491–727 (eindigt precies op de fold), tabel vanaf 727. Kleine telefoon (320×568) valt terug op
    60dvh = 341 px kaart.
  - **Sticky-keuze: scrubber blijft zichtbaar** (sticky top: safe-area-top), kaart krimpt NIET mee. Waarom:
    CSS-only, nul JS per scroll-frame; meekrimpen = per scroll-frame kaart + wind/regen/isolijn-canvassen
    herschalen (WebGL-realloc en herrender — precies de kosten die U8c eruit haalde). En de scrubber houdt
    tijd/regen-context bij het lezen van de tabel. Zie `after-portrait-*-scrolled.png` (scrollY 700):
    scrubber plakt bovenin, tabelrijen schuiven eronder door. Boven de notch een vaste strook in
    `--surface` (`body::before`, hoogte `env(safe-area-inset-top)`, op de Pixel 5 0 px).
  - **Liggend (≤959 breed, ≤540 hoog)**: kaart en paneel naast elkaar zoals desktop (paneel 52 %,
    eigen scroll), scrubber NIET sticky daar (236 van 393 px zou de tabel op 157 px zetten). Kaart
    blijft links altijd in beeld. Zie `after-landscape-*`.
  - **Lege band** was `.sidebar-nav` (62 px, zie boven). Op mobiel is de nav nu een overlay op de kaart
    linksboven onder de zoekbalk (alleen de UV-chip, absolute positie → geen layoutsprong als de chip
    bij scrubben verschijnt/verdwijnt; thema-segmented stond daar al verborgen). Chip gecheckt met een
    geïnjecteerde chip: `after-*-uvchip.png` (Noordzee-hoek, raakt niets).
  - **Contain-fit en zoekbalk**: `map-constraint` kreeg `Viewport.insets`; contain en clamp gelden voor het
    vrije deel. App meet de zoekbalk (input-onderrand + 4 px) alleen als die ≥ de halve kaartbreedte
    beslaat (telefoon); desktop 0. Gemeten inset 60 px. Portrait: zoom ongewijzigd (breedte-gebonden, vrije
    hoogte 431 > 391 px), NL schuift 30 px omlaag onder de zoekbalk. Liggend 349×393: zoom iets lager zodat
    de Wadden onder de balk vandaan komen. Onderrand bewust geen inset: merk/versheidspil staan in de
    hoeken (Frans-Vlaamse kust, Duits-Belgische grens), een bandinset zou NL in portrait ~15 % kleiner maken.
    `data-inset-top` op `.map` voor de e2e (`map-zoom.spec.ts` rekent er nu mee). Unit-test voor insets.
  - **Aanraakdoelen (pointer: coarse)**: zoekinput 42→44, versheidsknop 28→44 (padding), zoekresultaatrijen
    en opslaan-editor ≥44, geschiedenisknop 31→44, cursorpil/temperatuurknop onzichtbare ::after-rand.
    Audit via het shots-script: alle zichtbare knoppen ≥44 of met ::after-uitbreiding (segmented −7 px,
    save-place −6 px, cursorpil −8 px, temp −12 px).
  - **Geen horizontale scroll**: pagina was al 393 breed, maar de tabel liep 21 px (portrait) / 25 px
    (liggend) over in zijn eigen scrollbox (REGEN-kolom afgesneden, ook vóór). Celpadding mobiel 6→3 px,
    paneelpadding 16→12 px: overflow 0. Alleen spacing, geen kolominhoud (U15).
  - **Safe areas**: zoekbalk/thema/merk/versheid/scrubber/tabel met `env(safe-area-inset-*)`.
    `100dvh` overal op mobiel; `48svh` (search-results max) vervangen.
  - Meetvalkuil: een Playwright `fullPage`-screenshot heft in Chromium de pointer:coarse-emulatie op voor
    de rest van de context. De vóór-metingen en vóór-`-scrolled`/`-search` shots zijn daardoor zonder
    coarse-regels gemaakt (verschil alleen 39→44 px merk, 42→44 input); het script maakt de fullPage nu
    als laatste. Vóór-set niet opnieuw geschoten.
  - Niet van deze track: landscape-vóór toonde een verticale naad bij x≈158 in donker; in de nieuwe
    liggende layout (kaart 349 breed) niet meer in beeld. Vermoedelijk de westrand van een datagrid.
  - Repro na-shots (vanuit `web/`): `pnpm build`, `MOTREGEN_DATA_ORIGIN=https://motregen.nl/data pnpm
    preview --host 127.0.0.1 --port 4314 --strictPort`, `node ../.dev/tracks/u14-mobiel-layout/shots.mjs
    http://127.0.0.1:4314/ after` → exit 0.
