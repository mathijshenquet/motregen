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

## 2026-10-07T10:29:00Z
- Eerste commit `b56c5bc` gepusht en draft-PR geopend: https://github.com/mathijshenquet/motregen/pull/70. De beschrijving noemt de nog lopende checks; daarna PR bijgewerkt met vervolgwerk.
- Gerichte e2e probeerde eerst de standaarddata-poort 8185 en kreeg exit 1 omdat een parallelle `perf.spec` die poort bezet hield. Niet geraakt; herhaald met eigen poorten. Receipt: `MOTREGEN_E2E_PORT=4284 MOTREGEN_E2E_DATA_PORT=8284 devenv shell -- pnpm e2e e2e/presets.spec.ts --project desktop` → exit 0 (2/2). Na toevoeging van manifestasserties opnieuw op 4286/8286 → exit 0 (2/2). Test dekt `?modus=wind&t=+2u`, pauzeren op het juiste uur, SW-ready en manifestnaam/standalone/192/512/maskable iconen.
- Lighthouse 13.5 nagegaan via `pnpm dlx`; de eerste start zonder headless-vlag faalde (geen X-server). Met `--headless=new` start Chromium wel, maar Lighthouse 13.5 retourneert `unrecognized category: pwa`: deze versie heeft geen PWA-categorie meer. Dit staat expliciet in `docs/pwa.md`; de bovenstaande preview-build e2e is de installabilitycontrole.
- Orkestratorbesluit verwerkt: `origin/main` gemerged als `82c5f3e` (ageq-dev2). De PWA-config bleef conflictvrij behouden. Preview opnieuw gebouwd en herstart op poort 4340; receipt `curl -H 'Host: ageq-dev2:4340' http://127.0.0.1:4340/` → HTTP 200. Werkende URL: `http://ageq-dev2:4340/`.
- Nieuwe npm-dependencies maakten de Nix pnpm-depshash ongeldig; `nix/packages/web.nix` bijgewerkt naar de door Nix gemelde hash. Receipts: `nix build .#motregen-web --no-link` → exit 0; `nix build .#checks.x86_64-linux.nixos-vm --no-link` → exit 0 (inclusief nieuwe Caddy-headerasserties).
- Volgende stap: log/docs/Nix-hash committen, PR pushen en verificatiestatus in de draft bijwerken.

## 2026-10-07T08:33:34Z
- Vervolgwerk vastgelegd als `b201674` (`Verify PWA deployment integration`) en branch gepubliceerd. Receipts: `git push origin HEAD:track/u44-presets-pwa` → exit 0; `git ls-remote --heads origin track/u44-presets-pwa` bevestigt `b201674123a57ce26756d92722aca71c6654571f`.
- Draft-PR #70 bijgewerkt met alle afgeronde receipts, inclusief de Lighthouse-13.5-beperking. Receipt: `gh pr edit 70 ...` → exit 0; `gh pr view 70 ...` → draft=true op `track/u44-presets-pwa`.
- Preview blijft actief op `http://ageq-dev2:4340/`; synchrone receipt: `curl -H 'Host: ageq-dev2:4340' http://127.0.0.1:4340/` → HTTP 200.
