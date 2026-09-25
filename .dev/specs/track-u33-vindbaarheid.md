# Track U33 — vindbaarheid: metadata, robots, Search Console-verificatie (claude opus 5.5)

Read first: `AGENTS.md`, `web/index.html`, `web/public/`, `web/src/App.tsx`
(splash met merk), `nix/modules/motregen.nix` (Caddy-headers), `docs/
deploy.md` (Cloudflare-DNS-stappen). Your LOG: `.dev/tracks/u33-vindbaarheid/
LOG.md`. Branch `track/u33-vindbaarheid` vanaf main. Eigen worktree. Klein.

## Opdracht

1. `index.html`: `<title>motregen.nl — regenradar en verwachting voor
   Nederland en Vlaanderen</title>`, `meta description` (één zin, Nederlands),
   `lang="nl"` (staat), canonical `https://motregen.nl/`, Open Graph + Twitter
   card (titel, beschrijving, `og:image` = een statische 1200×630 PNG van de
   kaart met druppel in `public/`, gemaakt uit een screenshot), `theme-color`
   licht/donker. Een `<noscript>` met één alinea tekst (wat de site is, KNMI-
   bron) zodat een crawler zonder JS iets leest.
2. `public/robots.txt`: alles toegestaan, `Disallow: /data/` en `/stats/`,
   geen sitemap (één pagina).
3. Search Console: documenteer in `docs/deploy.md` de DNS-TXT-verificatie
   (Cloudflare-record; de PO plakt de waarde) — geen HTML-tag of bestand op
   de site. Geen Google-script.
4. Caddy: `X-Robots-Tag: noindex` op `/data/*` en `/stats/*`.
5. Check: Lighthouse SEO-score in headless Chromium vóór/na in de LOG;
   e2e-gericht: `robots.txt` en de meta-tags aanwezig.

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, gerichte e2e onder een slot;
`nix flake check` voor de Caddy-wijziging. Synchrone exit statussen in de LOG.
Draft-PR.
