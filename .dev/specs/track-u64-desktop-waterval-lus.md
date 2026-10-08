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
Geen één-letternamen, geen slimme one-liners, commentaar alleen voor het waarom; niets versoepelen
zonder benoemde oorzaak.
