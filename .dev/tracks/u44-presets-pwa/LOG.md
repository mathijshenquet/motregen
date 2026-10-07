## 2026-10-07T10:18:00Z
- Track U44 gestart op `track/u44-presets-pwa`. Specificatie, MIP-17, appstaat, analytics-contract, serving/deploy en Caddy-config gelezen.
- De runner had deze worktree niet via direnv geladen; voor alle projectcommando's gebruik ik daarom expliciet `devenv shell -- …`. Receipt: `devenv shell -- pnpm --version` → exit 0 (pnpm 11.21.0).
- Volgende stap: pure URL-presetparser met tests, daarna koppeling aan locatie/modus/tijd en vroege draft-PR.

## 2026-10-07T10:20:00Z
- PWA-tooling toegevoegd: `vite-plugin-pwa` 2.0.0 met de benodigde assetgenerator, Sharp, ICO-writer en `workbox-window`. De build maakt 192/512-pictogrammen, een maskable pictogram en Apple-touch-icon uit `web/public/droplet.svg`.
- URL-presets geïmplementeerd in pure `web/src/core/presets.ts`: `modus`, ISO/relatieve `t`, plaatsnaam of directe coördinaten; directe coördinaten winnen van plaatsnaam en een tijd buiten de tijdlijn klemt op de rand. De app berekent relatieve tijden tegen `manifest.now`, zet een gedeeld moment stil en schrijft geen preset terug naar opslag.
- PO-aanvulling verwerkt in `web/index.html`, PWA-manifestconfig en About: naam en short_name zijn `motregen.nl`; titel/OG/Twitter/About/manifest gebruiken nu “Regenradar en weersverwachting”.
- Deelknop in About toegevoegd, met Web Share op touch en klembordfallback. Het anonieme `share`-baken is toegevoegd aan client, docs en servercontract; contractversie is daarom 2.
- SW/manifest krijgen `Cache-Control: no-cache` in de productie-Nixconfig en `Caddyfile.dev`; `/data/*`, `/hit` en OpenFreeMap-tegels zijn NetworkOnly. `docs/pwa.md` beschrijft installatie en SW-updates.
- Receipts: `devenv shell -- pnpm typecheck` → exit 0; gerichte `vitest` (presets/usage/About) → exit 0. Eerste volledige `pnpm test` faalde omdat de verse worktree `uv_clear-20260828.mrf` miste; na `devenv shell -- pnpm synthgen` → exit 0 is `devenv shell -- pnpm test` → exit 0 (49 bestanden, 336 tests).
- Volgende stap: finale build, gerichte desktop-e2e op `presets.spec`, preview :4340 en daarna de vroege draft-PR.
