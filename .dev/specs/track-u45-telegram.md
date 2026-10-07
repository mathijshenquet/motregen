# Track U45 — Telegram: Mini App + inline-bot met stills (MIP-17 stap 3 en 4) (gpt-5.6-sol)

**Start na de merge van U44** (URL-presets + PWA): de Mini App en de "Open in motregen.nl"-knop
bouwen op de presets.

Read first: `AGENTS.md`, `.dev/proposals/0017-webapp-en-telegram.md` (§Aanbeveling 3–4 en de
open vragen), `web/src/core/presets.ts` (U44), `web/e2e/` + `web/playwright*.config.ts`
(Chromium headless, stills), `docs/deploy.md`, `nix/` (systemd-services, `secrets.env` zoals
de ADS-sleutel), `docs/analytics.md` (MIP-13-privacycontract). Bot-token: `TG_BOT_KEY` in
`.env` (dev) en `secrets.env` (prod); nooit committen. LOG: `.dev/tracks/u45-telegram/LOG.md`
(committed, append-only, timestamped). Branch `track/u45-telegram` vanaf main. Eigen worktree.

## Opdracht

1. **Package `bot/`** (TypeScript, pnpm-workspace naast `web/`, grammY of de kale Bot API
   met fetch — kies het kleinste dat long polling + inline + callback + Mini App-knoppen doet).
   Config via env: `TG_BOT_KEY`, `MOTREGEN_ORIGIN` (default https://motregen.nl),
   `MOTREGEN_RENDER_CACHE` (map). Geen database; alleen in-memory chat-id's voor lopende
   berichten; niets persoonlijks op schijf (About krijgt één regel; `docs/telegram.md`).
2. **Mini App**: `/start` antwoordt met een korte uitleg + `web_app`-knop (motregen.nl met
   `?tg=1`); in de app detecteert `window.Telegram.WebApp` (script alleen laden bij `?tg=1`):
   `expand()`, themakleuren naar het thema van de app, `startapp`-parameter → presets.
   Bot-menu-knop (`setChatMenuButton`) opent de Mini App.
3. **Stills-renderer** (`bot/render.ts`): Playwright-Chromium laadt de app in een vaste staat
   (`?modus=…&t=…&still=1`: geen UI-chrome, vaste kaartuitsnede NL+Vlaanderen, 900×1200,
   `deviceScaleFactor 2`) en screenshot als PNG/JPEG. Cache per (modus, tijdstap, manifest-
   `generated`) op schijf; vooraf renderen bij een nieuwe manifestversie voor de knoppen-
   matrix (modi Regen/Lucht/Gevoel/Wind × stappen nu, +1u, +2u, +3u, +6u, +12u, +24u),
   ~30 stills per verversing. Meet en log de rendertijd. Bijschrift: "za 14:10 · Gevoels-
   temperatuur · bron KNMI" in de stijl van de app.
4. **Inline-modus**: `@<bot> ` (leeg) → de vier modi als resultaten (foto + knoppenraster);
   `@<bot> wind` filtert. Knoppen (modus × tijdstap) verversen het bericht in place via
   `editMessageMedia`; knop "Open in motregen.nl" = Mini App met dezelfde presets. Chat-
   commando's `/regen`, `/wind`, `/gevoel`, `/lucht` doen hetzelfde in een gewone chat.
5. **Deploy**: systemd-service `motregen-bot` in de nix-module (prod-box), Chromium uit
   nixpkgs (`playwright-driver.browsers`), token uit `secrets.env`; de renderer draait als
   dezelfde unit. `nix flake check` groen. Documenteer in `docs/telegram.md` hoe de PO de bot
   bij BotFather instelt (inline-modus aan, menu-knop, Mini App-URL).
6. Tests: unit voor caption/presets/cache-sleutels; een lokale rooktest met het dev-token
   tegen de preview (`MOTREGEN_ORIGIN=http://localhost:4340`) — beschrijf de receipt in de
   LOG (bericht-id, rendertijd). `pnpm typecheck`, `pnpm test`, `pnpm build`. Draft-PR vroeg.

## Afbakening

Geen pollen-knop tot de kolom bestaat (U38). Geen locatiegebonden stills (nationaal; "mijn
plek" is de Mini App). Geen webhook (long polling volstaat). Leesbaarheidsbar: geen
één-letternamen, geen slimme one-liners.
