# Track U57 — pad-URI's: motregen.nl/weer/Utrecht (claude-opus-5-5)

PO 2026-10-07: "zullen we niet ook motregen.nl/weer/Utrecht doen?" — leesbaar, deelbaar, en elke
plaats × modus wordt een eigen indexeerbare pagina (Search Console: nu 3 vertoningen in zes weken).

Read first: `AGENTS.md`, `web/src/core/presets.ts` (`parsePresets`, `applyPresetParams`,
`shareablePlace`, `shareUrl`), `web/src/App.tsx` (`initialSearch`, live-permalink-effect,
`shareCurrentState`), `web/index.html` (title/OG/canonical), `web/vite.config.ts` (PWA
`navigateFallback`), `Caddyfile.dev`, `nix/modules/motregen.nix` (Caddy-routes), `docs/pwa.md`,
`web/e2e/presets.spec.ts`, `web/e2e/seo.spec.ts`. LOG: `.dev/tracks/u57-pad-uris/LOG.md`
(committed, append-only). Branch `track/u57-pad-uris` vanaf main. Eigen worktree. Preview 4325.

## Opdracht

1. **URI-schema**: `/` (standaard), `/<modus>` (`weer|lucht|gevoel|wind`), `/<modus>/<plaats>`;
   plaats als URL-slug (kleine letters, spaties en diakrieten → `-`, bv. `/weer/s-hertogenbosch`),
   met een slug→naam-afleiding die de geocoder begrijpt. Querypresets blijven werken (`?t=`
   alleen zolang het klokpaneel open is, `?dev`, `?perf`, `?tg`); een query-`plaats` of
   `lat/lon` wint boven het pad en wordt naar het pad genormaliseerd zodra de plek bekend is.
2. **Live-permalink** schrijft voortaan het pad (`history.replaceState`), niet `modus`/`plaats`
   als query; `shareUrl` idem. Terug/vooruit-knop van de browser: `popstate` past modus en plek toe.
3. **Server**: Caddy serveert `index.html` voor deze paden (SPA-fallback) in prod (nix) en dev
   (`Caddyfile.dev`, Vite preview `appType: 'spa'` dekt dev al); de SW-`navigateFallback`
   blijft kloppen; `/data/*`, `/telegram/*`, `/hit`, `/sw.js` onaangetast.
4. **Vindbaarheid per pagina**: per pad een eigen `<title>`/`og:title`/`canonical` ("Regenradar
   Utrecht — motregen.nl", "Wind Groningen — motregen.nl") gezet door de client (en voor crawlers
   zonder JS: de noscript-alinea noemt de plaats uit het pad via een Caddy-`templates`-regel of
   een klein edge-script — kies het eenvoudigste dat Google's rendering niet nodig heeft).
   `robots.txt` blijft; sitemap met de ~50 grootste plaatsen × 4 modi (`/sitemap.xml`, statisch
   uit `places.ts`), zodat Search Console ze kan oppakken.
5. Tests: unit voor slug↔naam en pad-parsing; e2e: `/wind/utrecht` opent windmodus op Utrecht,
   deeplink met query normaliseert naar pad, terugknop werkt, title per pad; `seo.spec`
   uitbreiden. Gates `pnpm typecheck`/`test`/`build`, gerichte e2e desktop, `nix flake check`
   (Caddy-route + VM-test). Draft-PR vroeg.

## Afbakening

Geen verandering aan de datapaden of het baken. Leesbaarheidsbar: geen één-letternamen.
