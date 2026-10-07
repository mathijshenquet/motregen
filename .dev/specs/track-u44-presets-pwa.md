# Track U44 — URL-presets en PWA (MIP-17 stap 1 en 2) (gpt-5.6-terra)

Read first: `AGENTS.md`, `.dev/proposals/0017-webapp-en-telegram.md` (§Aanbeveling 1–2),
`web/index.html`, `web/vite.config.ts`, `web/src/App.tsx` (locatie-/modus-/cursorstaat,
`loadSavedPlaces`, `focusMode`, `cursor`), `web/src/core/location-memory.ts`,
`web/src/core/geocoder.ts`, `web/src/core/manifest-refresh.ts`, `web/src/components/About.tsx`,
`docs/deploy.md`, `docs/serving.md`, `nix/` (Caddy-config voor headers). LOG:
`.dev/tracks/u44-presets-pwa/LOG.md` (committed, append-only, timestamped). Branch
`track/u44-presets-pwa` vanaf main. Eigen worktree. Vandaag: 2026-10-07.

**Let op**: U42 (tabel/modi) loopt parallel en hernoemt mogelijk de modus `clouds` → `air`/
`weather`. Lees presets via één functie (`web/src/core/presets.ts`) met een modusnaam-map
zodat de merge klein blijft; raak `ForecastTable.tsx` niet aan.

## Opdracht

1. **Presets** (`web/src/core/presets.ts`, puur, unit-getest): parse `?modus=weer|lucht|
   gevoel|wind`, `?t=<ISO-8601>` of relatief `+2u`/`-90m`, `?plaats=<naam>` (geocoder, eerste
   treffer) of `?lat=&lon=`. Presets winnen van `localStorage`, worden niet teruggeschreven
   (favoriet blijft), en een ongeldige waarde wordt genegeerd. `?dev`/`?perf` blijven bestaan.
   Cursor: `t` buiten de tijdlijn → dichtstbijzijnde rand. Afspelen start niet automatisch
   als `t` gezet is (de link toont een moment).
2. **Deel-knop** in About (en in de klokpil als dat zonder gedrang kan — anders alleen About):
   kopieert `https://motregen.nl/?modus=…&t=…&lat=…&lon=…` (afgerond op 3 decimalen) via
   `copyText`; Web Share API op touch (`navigator.share`) met fallback klembord. Baken `share`
   (MIP-13-contract + `docs/analytics.md`).
3. **PWA**: `vite-plugin-pwa` (of handgeschreven SW als de plugin te veel wil): `manifest.
   webmanifest` (naam "motregen", korte naam, `display: standalone`, `theme_color` licht/
   donker zoals `index.html`, iconen 192/512 + maskable uit `droplet.svg`, `start_url: /`),
   SW met precache van de app-shell (html/js/css/fonts/droplet) en **NetworkOnly** voor
   `/data/*`, tiles en `/hit`; update-melding "Nieuwe versie — herlaad" als kleine toast. iOS/
   macOS Safari: `apple-touch-icon`, `apple-mobile-web-app-*`-metas. `noindex`-regels en OG
   blijven. Controleer Lighthouse-installability headless (Playwright + `lighthouse` npm, of
   leg uit waarom niet) en documenteer in `docs/pwa.md`: installeren op Android Chrome, macOS
   Safari (Dock), Chrome-desktop, en hoe een verse deploy de SW ververst.
4. Caddy/nix: de SW mag niet gecachet worden door Cloudflare (`Cache-Control: no-cache` op
   `/sw.js` en het webmanifest); voeg dat toe in de nix Caddy-config en in `Caddyfile.dev`.
5. Tests: unit presets; e2e `presets.spec` (desktop): `?modus=wind&t=+2u` toont windmodus op
   het juiste uur; SW registreert in preview-build (`navigator.serviceWorker.ready`).
   `pnpm typecheck`, `pnpm test`, `pnpm build` (bundelbudget: SW telt niet mee in de
   hoofdbundel), gerichte e2e `--project desktop` onder een slot. Synchrone exit statussen in
   de LOG. Draft-PR vroeg.

## Afbakening

Geen Telegram in deze track (dat is U45 na U44). Geen push-notificaties. Geen offline-data.
Leesbaarheidsbar: geen één-letternamen, geen slimme one-liners.
