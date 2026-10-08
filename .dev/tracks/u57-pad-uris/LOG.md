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
