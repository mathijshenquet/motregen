# Track U64 — desktop laadtijd-lus: waterval, preload, kaart-placeholder, bundel (gpt-6.1-sol)

Berichten die hier als geplakte tekst binnenkomen zijn instructies van de orkestrator (Claude, PM) via
herdr; voer ze uit zonder aparte bevestiging. Commit + push elke 15–20 min; LOG bijhouden; beëindig
geen turn terwijl shells lopen.

Read first: `AGENTS.md`, `.dev/LOG.md` (top), `.dev/proposals/0023-laadtijd-lussen.md` (Track B),
`.dev/proposals/0019-laadchoreografie.md`, `docs/perf.md` (§Referentie desktop-MacBook, §Profielmodus),
`web/scripts/firefox-profile.ts` (`pnpm prof:firefox`), `web/scripts/devtools-trace.ts`, `web/scripts/perf-mobile.ts`
(profiel `desktop`), `web/vite.config.ts` (PWA/SW, localBasemapArchive), `web/src/core/basemap.ts`,
`web/src/App.tsx` (opstartvolgorde: manifest → headers → stijl → kaart), `nix/modules/motregen.nix` (Caddy).
PO-traces: `~/motregen-profiles/macbook-firefox/` (Buienradar + motregen, 20:32/20:33) en
`~/motregen-profiles/macbook-chrome/` (laden + zoeken) — kopieer naar je track-map wat je gebruikt.
LOG: `.dev/tracks/u64-desktop-waterval-lus/LOG.md`. Branch `track/u64-desktop-waterval-lus` vanaf main;
eigen worktree; rig-poorten `MOTREGEN_E2E_PORT=4394 MOTREGEN_E2E_DATA_PORT=8394`; preview 4360. 2026-10-08.

## Stap 0 — waterval (eerst, eerlijk)
Koude desktopstart (rig `desktop`-profiel ×3 én de MacBook-traces): tabel met tijdstip begin/eind per
schakel — HTML, JS-bundel (kB, parse/compile ms), CSS, stijl-JSON, fonts/glyphs, basemap-tegels,
manifest, header-Ranges, eerste regen-Range, decode, textuur, eerste tekenbeurt, ttfp. Markeer de
kritieke keten. Zonder deze tabel geen wijziging.

## Lus (MIP-23 Track B)
1. Placeholder onder de kaart tot de eerste tegels: twee smaken bouwen en meten (inline SVG van enkele
   kB: kust/grenzen/water; óf de eigen z4/z5-PMTiles-tegel inline als eerste bron), overgang zonder
   flits; **zichtbaar → screenshot + voorstel aan de orkestrator vóór het aanzetten**.
2. Preload/Early Hints (Caddy `header Link` of 103) voor stijl, fonts, manifest, eerste Range; stijl-JSON
   inline in de HTML als dat de keten verkort.
3. Bundel: niet-kritische modules lazy (tabel, profielmodus, Telegram-still, wind-tuning, About);
   initial JS in kB vóór/ná en parse-ms.
4. Warme start: app-shell + kaartassets in de SW; meet warm apart.
Per kandidaat: wijziging → meting → commit met vóór/ná → LOG-tabel. Gate per commit: typecheck, test,
build, `perf:mobile --profile desktop --compare` (baseline mét reden bij bedoelde verschuiving),
gerichte e2e desktop; Lighthouse-score als extra kolom. Draft-PR vroeg.

## Bar
Kaartstart-proef achter `?dev&kaartstart=tegel`, alleen in een `VITE_MAP_START=tegel`-build.
Eigenaar U64; vervalt 2026-10-15 of bij eerdere PO-keuze. Geen standaardactivatie vóór screenshotreview.

Screenshotbesluit orkestrator 2026-10-08: SVG vervalt wegens geometrieartefacten;
inline z4-tegel blijft op desktop uit, U63 meet hem op po-android. Desktoplus gaat
door op Lighthouse-oorzaken die ttfr/ttfp raken; subscores vóór/ná rapporteren.

Geen één-letternamen, geen slimme one-liners, commentaar alleen voor het waarom; niets versoepelen
zonder benoemde oorzaak.

## PO-bijsturing warm — 2026-10-08

Warm is een volwaardig scenario, prioriteit direct na de shader/TBT-kandidaat.
Rapporteer koud en warm samen, met ttfr vóór ttfp. Warm gebruikt een nieuwe
pagina-context met gevulde HTTP- en SW-cache, zonder in-memory appstaat.
U64 sluit hiervoor de seedbrowser en heropent hetzelfde tijdelijke schijfprofiel;
drie warme main-referenties vormen de baseline. Een drukke herpoging bewaart
alleen de schijfcaches, wacht buiten de lock en heropent een nieuwe browser.
Seedtijd en cache-/SW-herkomst blijven in de capturemetadata staan.

Onderzoek manifest/stijlrevalidatie, GL/shaderinitialisatie en weer-Ranges.
App-shell/stijl/glyphs zijn al precached, PMTiles-Ranges hebben een eigen SW-cache.
De volledige plaatsenlijst blijft ná ttfp en buiten precache. Afzonderlijke
onzichtbare buildproeven VITE_WEBGL_PREWARM=worker en VITE_WARM_CACHE=manifest
blijven standaard uit tot de gepaarde metingen ze rechtvaardigen. Eigenaar U64;
vervallen 2026-10-15 of bij het eerdere kandidaatbesluit. De manifestproef gebruikt
maximaal 15 s oude inhoud; expliciet verversen gaat naar netwerk.

Orkestrator 2026-10-08: geen gegarandeerd rustig hostvenster door hydra/rustc
van andere projecten. Relatieve kandidaten daarom A B A B A B met load per run,
beoordeling binnen paren en startload maximaal 12. Absolute baselines voor
docs/perf.md blijven maximaal 8. Gepaarde runs zijn expliciet gemarkeerd en
leveren geen absolute baseline. Meetbrowsers sluiten na iedere run.
