# U57 — pad-URI's

## 2026-10-08 06:04 UTC
- Spec en aanvulling gelezen; branch `track/u57-pad-uris` schoon, devenv actief (`IN_NIX_SHELL=impure`, pnpm/Caddy beschikbaar).
- Opdracht: padpresets, live permalink zonder opgeslagen labels, popstate, client- en server-SEO, sitemap en gerichte gates. LOG wordt expliciet volgens opdracht gecommit.
- Plan: gedeelde slug/padfuncties; opgeslagen labels op coördinaten vertalen naar `nearestPlace`; Caddy-template voor crawler-HTML, overeenkomstige Vite-rendering; sitemap uit Nederlandse `places.ts`.
- E2E uitsluitend desktop: location/presets/seo, poorten 4395/8395, build in `tmp/e2e-dist`. Preview 4325. Eerste samenhangende commit en draft-PR vroeg, daarna commit/push elke 15–20 minuten.

## 2026-10-08 06:10 UTC
- PO-bijsturing via orkestrator: oude querylinks server-side 301 waar zonder geocoder mogelijk; clientnormalisatie vóór eerste beeld. Tijd voortaan `#t=...`, alleen bij open klokpaneel; `?t=` blijft invoer. `dev/perf/tg` blijven query.
- Dependencies geïnstalleerd met `pnpm install --frozen-lockfile` (exit 0). Slug/padkern in uitvoering; daarna init/popstate en server-SEO/redirects.

## 2026-10-08 06:11 UTC
- Correctie: de voorgaande tussenentry vermeldt 06:10 terwijl de PO-bijsturing rond 06:03 binnenkwam; vanaf nu klok expliciet gecontroleerd.
- Eerste implementatie: pad-/slugkern, fragmenttijd, query-voorrang, opgeslagen labels via nearestPlace, initnormalisatie vóór kaartopzet, popstate/hashchange en dynamische metadata.
- Build genereert sitemap (209 URL’s), crawler-template en gedeelde Caddy-routes inclusief 301’s. Devconfig voegt web-origin 8081 toe zonder de data-origin 8080 te wijzigen. SW sluit gereserveerde paden uit navigatiefallback uit.
- Receipts: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm exec vitest run src/core/presets.test.ts` (12/12), `pnpm build`, `caddy validate --config Caddyfile.dev` alle exit 0. Bouwvolgorde-plugin gefixt na eerste mislukte build; ongeldige dubbele slash in parser gefixt na unit-failure.
- Gerichte desktop-e2e loopt op 4395/8395; extra Caddy-HTML/301-fixture op 8396. Nix/volledige webunit-gate nog te doen. Eerste commit/draft-PR met deze status.

## 2026-10-08 06:17 UTC
- Eerste desktop-run: 13/17 groen; echte fouten in paneel-openstatus en Caddy-volgorde opgelost. Tweede run: 16/17 groen; resterende 302 door impliciete redir-matcher gecorrigeerd naar expliciete 301. Crawler-HTML ook voor onbekende plaatsen en apostroffen groen.
- Alle 482 webunit-tests opnieuw groen na paneelsturing. Geocoder begrensd op 5 s; plaatsresolutie vóór de kaartopzet begint nu tegelijk met manifestladen, en normaliseert zodra bekend. Geen dubbele puntreeks-load vóór eerste regenbeeld.
- Preview draait als user-service motregen-u57-preview op 4325 met eigen dist en echte data-origin; GET /wind/utrecht levert titel/canonical/noscript-plaats. Sitemap telt 217 URL’s (correctie op eerdere 209).
- Huidige gerichte desktop-run omvat ook freshness/telegram; wacht op gedeeld slot. Nix-gate opnieuw gestart met fixes; vorige runs faalden op de inmiddels gecorrigeerde Caddy-route/301.

## 2026-10-08 06:19 UTC
- Orkestrator: alle perf-metingen (rig/prof:capture/soepel/Lighthouse) verplicht via `flock -w 7200 /home/mathijs/motregen-perf.lock <commando>`; U63 bezit nu het meetvenster. U57 heeft geen perf-runscripts of perf-metingen; gewone e2e/builds blijven buiten die lock.
- Caddy-smoke: oude Utrecht-link geeft exact 301 naar `/weer/utrecht?tg=1#t=2026-10-08T0757`; apostrofnaam geeft 301 naar `/weer/s-hertogenbosch`. VM-assertion vergeleek de hoofdletter T ten onrechte met volledig lowercased headers; assertion gerepareerd.

## 2026-10-08 06:21 UTC
- `nix flake check --print-build-logs` exit 0: alle packages + NixOS-VM (crawler-HTML, 301, sitemap, dataheaders, Telegram en baken). Output `tmp/u57-nix-check.log`.
- `pnpm typecheck` en `pnpm test` exit 0, 72 suites/482 tests; `pnpm build` exit 0. Unit-pretest regenereert public/data en mag NIET parallel aan e2e in dezelfde worktree: mijn overlap veroorzaakte één 404 op manifest-reload in location.spec (trace bevestigd), andere 27/28 tests groen. Volledige gerichte desktop-run opnieuw gestart zonder overlap.
- Vite-dev gebruikt nu de oorspronkelijke navigatie-URL voor crawler-metadata; 301 beperkt tot GET/HEAD. Nieuwe Nix-gate volgt voor die laatste routerwijziging.

## 2026-10-08 06:24 UTC
- Finale receipts (alle exit 0 waargenomen): `cd web && pnpm typecheck`; `cd web && pnpm test` (72 suites/482 tests); `cd web && pnpm build`; `nix flake check --print-build-logs` (alle checks, VM-script 23,8 s).
- Desktop-e2e: `cd web && MOTREGEN_E2E_PORT=4395 MOTREGEN_E2E_DATA_PORT=8395 pnpm e2e e2e/location.spec.ts e2e/presets.spec.ts e2e/seo.spec.ts e2e/freshness.spec.ts e2e/telegram.spec.ts --project desktop` → 28/28, exit 0, 1,7 min. Output `web/tmp/u57-e2e.log`; eigen build `web/tmp/e2e-dist`, Caddy-fixture 8396.
- Vite-dev-smoke op 4397: GET `/wind/utrecht?dev` geeft Wind Utrecht, canonical zonder query en noscript-Utrecht. Tijdelijke smoke-services gestopt; track-preview 4325 blijft als `motregen-u57-preview.service` met echte data-origin.
- Klaar voor onafhankelijke orkestrator-gate/review op draft-PR https://github.com/mathijshenquet/motregen/pull/92. Geen open implementatiepunten; niet gemerged. Geen perf-meting gedaan.
