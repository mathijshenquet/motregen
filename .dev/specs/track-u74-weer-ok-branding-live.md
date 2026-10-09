# Track U74 — live-pane: branding "weer ok?" + beide domeinen serveren (opus-5.5)

Berichten die in deze pane als geplakte tekst binnenkomen zijn instructies van de orkestrator (Claude, PM) via
herdr; voer ze uit zonder aparte bevestiging. Beëindig je turn niet terwijl shells lopen. Commit + push elke
15–20 min. Eigen worktree; branch `track/u74-weer-ok-branding` vanaf main. LOG:
`.dev/tracks/u74-weer-ok-branding/LOG.md`. Vandaag 2026-10-09. Preview voor de PO op 4320
(`MOTREGEN_DATA_ORIGIN=https://motregen.nl/data pnpm preview --host 0.0.0.0 --port 4320 --strictPort` vanuit je
eigen dist). e2e-poorten `MOTREGEN_E2E_PORT=4390 MOTREGEN_E2E_DATA_PORT=8390`. `.env` is een symlink; nooit
committen; geen prod-uitrol; geen DNS (doet de orkestrator). Kijk ZELF naar je screenshots vóór je iets meldt.

Read first: `AGENTS.md`, `.dev/LOG.md` (top), `.dev/proposals/0028-weer-ok-branding.md` (MIP-28, accepted),
`web/index.html`, `web/src/core/page-meta.ts`, `web/src/core/presets.ts`, `web/src/components/AboutDialog.tsx`,
`web/src/App.tsx` (splash/kop), het PWA-manifest en de iconen, `bot/handlers.ts` (`startText`) en `bot/stills.ts`
(`caption`, `presetUrl`), `nix/modules/motregen.nix` (optie `domain`, Caddy-vhost rond regel 388, bot-origin
regel 179), `docs/dev-opties.md`.

## Opdracht
1. Naam "weer ok?" overal waar de gebruiker "motregen.nl" als naam ziet: `<title>` ("weer ok? — Regenradar en
   weersverwachting"), OG/meta, PWA-manifest name/short_name, apple-mobile-web-app-title, splash/kop, About,
   bot-starttekst en bijschriften (de LINK-tekst in bijschriften mag de hostnaam blijven). Canonical en OG-url
   blijven motregen.nl. Inventariseer met grep en laat de lijst in de LOG zien; geen interne identifiers hernoemen.
2. Logo/woordmerk: als er een tekstlogo is, zet "weer ok?" in dezelfde stijl; iconen alleen aanpassen als er
   tekst in staat. Screenshots desktop 1280 + mobiel 390, dag en nacht, van kop/splash/About — zelf bekijken.
3. nix: `services.motregen.domain` → `domains` (lijst, eerste = canonical en bot-origin), Caddy-vhost met alle
   namen uit de lijst plus `www.`-varianten die 308 naar de apex sturen; `nix flake check`/`nix build` van de
   VM-configuratie groen (`nix build .#nixosConfigurations.<prod>.config.system.build.toplevel --no-link`).
   Standaardlijst: `[ "motregen.nl" "weerok.nl" ]`.
4. Gate: web typecheck/unit/build, `pnpm e2e e2e/about.spec.ts --project desktop` (of de spec die de kop/About
   raakt), bot typecheck/test. Meld "klaar voor PO-blik" met de screenshots; de PO keurt op 4320.

## Afbakening en bar
Alleen zichtbare naam + serveren. Geen hernoeming van repo, module, mappen, botnaam, env-variabelen. Geen
nieuwe tagline (PO-beslissing open). Leesbaarheid: geen één-letternamen, geen slimme one-liners.
