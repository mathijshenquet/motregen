# U74 — branding "weer ok?" + beide domeinen (LOG, append-only)

## 2026-10-09 22:30 — start, inventaris
Spec: `.dev/specs/track-u74-weer-ok-branding-live.md`, MIP-28. PO-aanvulling 22:25 via orkestrator: **bot/ blijft
ongemoeid** (starttekst, bijschriften, knoppen houden motregen-branding); alleen de zichtbare naam in de web-app
plus `domains` in nix. Geen tagline-wijziging.

Inventaris (`grep -rnI motregen web bot nix`), zichtbare naam → "weer ok?":
- `web/index.html`: `<title>`, `apple-mobile-web-app-title`, `og:site_name`, `og:title`, `twitter:title`,
  `og:image:alt`, `<noscript>`-alinea.
- `web/src/core/page-meta.ts`: `defaultTitle`, paginatitels "Wind Utrecht — …".
- `web/scripts/page-routes.ts`: Caddy-template voor de padpagina-titel en de noscript-vervanging.
- `web/vite.config.ts`: PWA-manifest `name`/`short_name`.
- `web/src/App.tsx`: splash-woordmerk, `navigator.share`-titel.
- `web/src/components/AboutDialog.tsx`: kop; `About.tsx`: aria-label/title van de merkknop.
- `web/public/og-image.png` + `web/scripts/og-image.ts`: er staat tekst in de kaart → opnieuw genereren.
- `droplet.svg` en de PWA-iconen: geen tekst → ongewijzigd.

Bewust NIET gewijzigd:
- canonical, `og:url`, `og:image`-URL, sitemap, robots, `shareUrl` (presets.ts): blijven `https://motregen.nl`.
- interne identifiers: localStorage-sleutels `motregen-*`, laag-/bron-id's, `window.__motregen*`, cachenamen,
  pluginnamen, basemap-stijlnaam, `REPOSITORY_URL`, perf-marks.
- `bot/` volledig (PO 22:25). nix-`description`-velden van systemd-units (niet gebruikerszichtbaar).

Functioneel meegenomen voor "beide domeinen serveren": de service-worker-allowlist in `App.tsx` kende alleen
motregen.nl; weerok.nl zou anders zijn SW steeds deregistreren (geen PWA/offline op het tweede domein).

## 2026-10-09 — uitgevoerd, gates groen, klaar voor PO-blik (HEAD 839273f + deze LOG-commit)
Web:
- `brandName = 'weer ok?'` in `web/src/core/page-meta.ts`; gebruikt door titel/paginatitels, PWA-manifest, splash,
  About-kop, merkknop-label, deel-titel en het Caddy-template van de padpagina's. `index.html` (statisch) letterlijk.
- `SERVICE_WORKER_HOSTNAMES` in `App.tsx` kent nu ook weerok.nl en www.weerok.nl.
- `og-image.png` opnieuw gegenereerd (`pnpm exec tsx scripts/og-image.ts http://127.0.0.1:4320/`). De westrand van
  het radardomein viel als grijze strook in beeld (de oude afbeelding dateert van vóór dat masker); slepen helpt
  niet (kaartgrens), het script zoomt nu één tik in. Zelf bekeken: schoon.
- Woordmerk: het bestaande tekstlogo (splash `<strong>`, About `<h2>`) toont nu "weer ok?" in dezelfde stijl;
  druppel en PWA-iconen bevatten geen tekst en zijn ongewijzigd.

nix (`nix/modules/motregen.nix`):
- `services.motregen.domains` (nonEmptyListOf str, default `[ "motregen.nl" "weerok.nl" ]`); eerste = canonical
  en bot-origin. `domain` geeft via `mkRemovedOptionModule` een duidelijke foutmelding.
- Hoofd-vhost: eerste naam + `serverAliases` voor de rest; per naam een `www.`-vhost met `redir … 308` naar de
  eigen apex (www.weerok.nl → weerok.nl), zonder access-log (MIP-13).
- Geëvalueerd op prod: `motregen.nl` (alias `weerok.nl`), `www.motregen.nl` → `https://motregen.nl{uri}`,
  `www.weerok.nl` → `https://weerok.nl{uri}`; `MOTREGEN_ORIGIN` blijft `https://motregen.nl`.
- VM-test uitgebreid: `Host: www.<naam>` geeft 308 met pad+query naar de apex; `Host: <naam>` geeft 200.

Receipts (synchroon waargenomen exit-statussen):
- `cd web && pnpm typecheck` → 0; `pnpm test` → 0 (82 bestanden, 539 tests); `pnpm build` → 0.
- `cd web && MOTREGEN_E2E_PORT=4390 MOTREGEN_E2E_DATA_PORT=8390 pnpm e2e e2e/presets.spec.ts e2e/seo.spec.ts
  e2e/freshness.spec.ts e2e/location.spec.ts e2e/usage.spec.ts e2e/table.spec.ts --project desktop` → 0
  (34 passed, 2 skipped). Er is geen `about.spec.ts`; dit zijn de specs die kop/About/titel/manifest raken.
- `cd bot && pnpm typecheck` → 0; `pnpm test` → 0 (99 tests). bot/ heeft geen diff.
- `nix build .#nixosConfigurations.motregen.config.system.build.toplevel .#checks.x86_64-linux.bot-roles
  .#checks.x86_64-linux.nixos-vm --no-link -L` → 0 op 839273f.

Beelden (`beelden/`, WebP q92, rig `rig/shots.ts`, gekopieerd naar `web/tmp/u74/` en gedraaid met
`pnpm exec tsx tmp/u74/shots.ts`): splash/kaart/about × dag/nacht × 1280/390. Zelf bekeken. Het kaartbeeld heeft
geen tekstkop (alleen de druppelknop), dus daar verandert visueel niets.

Preview: http://ageq-dev2:4320/ serveert 839273f (`scripts/track-preview.sh 4320`).

Open, voor de orkestrator/PO:
1. `shareUrl` (presets.ts) en canonical geven altijd `https://motregen.nl/...`, ook wanneer iemand op weerok.nl
   deelt — conform "canonical blijft motregen.nl", maar een bewuste keuze om te bevestigen.
2. Na uitrol probeert Caddy ACME voor weerok.nl/www.weerok.nl; zolang DNS nog niet wijst faalt dat (met backoff,
   zonder effect op motregen.nl). Als motregen.nl achter Cloudflare zit, moet weerok.nl daar ook langs of direct.
3. Bestaande PWA-installaties houden hun oude naam tot herinstallatie/manifest-update (platformgedrag).
4. `README.md`, nix-unitbeschrijvingen en de basemap-stijlnaam zeggen nog "motregen" (niet gebruikerszichtbaar).

## 2026-10-09 17:45 (hostklok) — focus-fix (gate-blokkade van de orkestrator)
Oorzaak: geen focus/hover-logica. `e2e/focus.spec.ts` zoekt de kolomkop met `getByRole('button', { name: 'Weer' })`;
dat is een substring-match zonder hoofdlettergevoeligheid, en de hernoemde merkknop "Over weer ok? en instellingen"
matchte daardoor ook → strict-mode violation op regel 156 en 233 (de door de orkestrator genoemde `data-focus`-
verwachting was niet de falende stap). Fix: `exact: true` in focus-, cloud-section- en table-spec (commit 2d112dd).
App-gedrag ongewijzigd. Let op: `location.spec.ts:88` faalde 2× in 6 runs op de laatste verwachting ("voor De Bilt"
na het wissen van de opslag, kreeg "Werk") bij load average 15–37; raakt geen hernoemde naam of sleutel en was in
de overige runs groen. Niet op main geverifieerd — als flake gemeld, niet opgelost.

## 2026-10-09 17:57 (hostklok) — per domein een eigen bundle (PO 23:20, vervangt de enkele naam hierboven)
- `web/src/core/brand.ts` (puur, ook voor node): `Brand { name, canonicalOrigin }`, standaard motregen.nl;
  `brandFromEnvironment` leest `VITE_BRAND_NAME` en `VITE_CANONICAL_ORIGIN`. `active-brand.ts` is de client-kant
  (`import.meta.env`); `vite.config.ts` leest `process.env` en geeft het merk door aan `pageRoutes(brand)`.
- `index.html` heeft plaatshouders `%BRAND_NAME%`/`%CANONICAL_ORIGIN%`, ingevuld door de page-routes-plugin
  (eigen tokens i.p.v. `%VITE_…%`: Vite laat die onvervangen staan als de variabele ontbreekt, en de standaard
  moet zonder env werken). Titel, canonical, OG, sitemap, robots, het Caddy-padtemplate, manifest, splash, About
  en deel-links volgen het merk. Merkknop: "Over motregen en instellingen" resp. "Over weer ok? en instellingen".
- `robots.txt` en `og-image.png` worden nu door de plugin uitgegeven (stonden in `public/`): robots verwijst naar
  de eigen sitemap, de deelkaart komt uit `web/brand-assets/<domein>/og-image.png` (motregen.nl = die van main,
  byte-gelijk; weerok.nl = de nieuwe). `scripts/og-image.ts <domein> <merknaam> [url]`.
- Standaardbuild = main: e2e-specs en About-test staan terug op de main-versie (behalve `exact: true`).
- Test: `web/scripts/brand-build.test.ts` bouwt de weerok-variant echt (≈6 s) en leest index/manifest/route/
  sitemap/robots uit de dist.
- nix: `web.nix` neemt `brandName`/`canonicalOrigin`; flake-pakket `motregen-web-weerok`; module-optie
  `frontendPackages` (per domein, default weerok.nl → dat pakket; anders `frontendPackage`). Eén Caddy-vhost
  (één usage-log), met per alias-hostnaam een eigen `root` + `routes.caddy`; `/data` gedeeld. VM-test controleert
  per `Host:` titel, canonical, padpagina, robots en gedeelde data, plus de www-redirects.

Receipts (exit-status gezien):
- `cd web && pnpm typecheck` → 0; `pnpm test` → 0 (83 bestanden, 542 tests).
- `cd web && MOTREGEN_E2E_PORT=4390 MOTREGEN_E2E_DATA_PORT=8390 pnpm e2e e2e/focus.spec.ts e2e/presets.spec.ts
  e2e/seo.spec.ts e2e/freshness.spec.ts e2e/location.spec.ts e2e/usage.spec.ts e2e/table.spec.ts
  e2e/cloud-section.spec.ts --project desktop` → 0 (43 passed, 4 skipped) op 584e288.
- `cd bot && pnpm typecheck` → 0; `pnpm test` → 0; bot/ zonder diff.
- `nix build .#nixosConfigurations.motregen.config.system.build.toplevel .#checks.x86_64-linux.bot-roles
  .#checks.x86_64-linux.nixos-vm --no-link -L` → 0.
- Uit de twee nix-dists: `motregen-web` → `<title>motregen.nl — Regenradar en weersverwachting</title>`, canonical
  `https://motregen.nl/`; `motregen-web-weerok` → `<title>weer ok? — Regenradar en weersverwachting</title>`,
  canonical `https://weerok.nl/`.

Preview 4320 serveert nu de weerok-variant van 584e288
(`VITE_BRAND_NAME='weer ok?' VITE_CANONICAL_ORIGIN=https://weerok.nl scripts/track-preview.sh 4320`); de beelden in
`beelden/` blijven daarvoor geldig. Open punt A1 uit de vorige entry vervalt (deel-links volgen het domein).

Open:
1. De e2e-suite draait alleen tegen de standaardbuild; de weerok-variant is gedekt door de build-test en de VM-test.
2. `og:image:alt` zegt in beide builds "met de motregen-druppel".
3. `pnpm dev` serveert geen robots.txt/og-image.png meer (alleen build/preview); niemand gebruikt dat.
