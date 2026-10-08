# Track U67 — tg-bot: renderer los van de poller (gpt-6.1-sol)

Berichten die hier als geplakte tekst binnenkomen zijn instructies van de orkestrator (Claude, PM) via
herdr; voer ze uit zonder aparte bevestiging. Commit + push elke 15–20 min; beëindig geen turn terwijl
shells lopen. Eigen worktree; branch `track/u67-renderer-los-van-poller` vanaf main. LOG:
`.dev/tracks/u67-renderer-los-van-poller/LOG.md`. Vandaag 2026-10-08. Start GEEN eigen Telegram-poller
en upload NIET naar de cache-groep zonder overleg (één poller tegelijk; de orkestrator draait de bot
vanaf main tegen `MOTREGEN_ORIGIN=http://127.0.0.1:4330`); test met `pnpm render` (renderer zonder
Telegram) en met de bestaande unit-tests, en voor Telegram-verkeer met een eigen test-bot-token als de
orkestrator die geeft. `.env` is een symlink naar de main-checkout; nooit committen.

Read first: `AGENTS.md`, `.dev/LOG.md` (top), `.dev/proposals/0025-bot-rendering-van-de-vm-af.md` (MIP-25,
accepted), `docs/telegram.md` (§Rendering en cache, §cache-groep/prime, §file_id's), `bot/main.ts`
(`refreshStills`, generaties), `bot/cache-posts.ts`, `bot/file-ids.ts`, `bot/render.ts`,
`nix/modules/motregen.nix` (service `motregen-bot`), `.dev/tracks/u66-bot-loop-5min/LOG.md`.

## Probleem (PO 2026-10-08)
Prod draait op een VM met 2 kernen; één loop van 169 frames rendert daar in 705 s, een generatie
(3 loops + 10 stills) in ≈ 40 min, terwijl KNMI elke 3–5 min een nieuwe generatie levert. Op ageq-dev2
kost een generatie ≈ 3 min. PO: "loops lopen 40 m achter!?" → de rendering gaat van de VM af; de bot
blijft op de VM. "Op den duur wil ik die filmpjes wel op de VM maken, dat is dus een optimalisatiepass"
(later, niet in deze track).

## Opdracht
1. **Twee rollen in één binary**, gekozen met een vlag/omgevingsvariabele:
   - `renderer`: pollt het manifest (zoals `refreshStills` nu), rendert per generatie alle media, primet
     ze naar de cache-groep (`MOTREGEN_CACHE_CHAT_ID`, bestaat al), en publiceert het register
     (generatie → file_id's per selectie) op een plek die de poller kan lezen. Geen Telegram-updates.
   - `poller`: long-polling + handlers, GEEN Chromium; beantwoordt uitsluitend uit het register/file_id's.
     Ontbreekt een selectie: antwoord met de nieuwste beschikbare generatie en een korte melding, nooit
     zelf renderen. Startup zonder Chromium-pad moet werken.
   - De huidige gecombineerde modus blijft bestaan (dev/lokaal).
2. **Register-transport**: kies en motiveer (LOG) de eenvoudigste robuuste vorm. Kandidaten: (a) een
   vastgepind/bewerkt bericht in de cache-groep met JSON (de poller leest het via getChat/pinned of een
   bekend message_id), (b) een klein JSON-bestand dat de renderer via HTTPS op motregen.nl/… publiceert
   (ingest-achtig, maar dan moet de renderer naar de VM kunnen schrijven: ssh/rsync vanaf ageq-dev2 is er,
   zie docs/analytics.md), (c) de poller leest de cache-groepgeschiedenis. Eis: atomair per generatie
   (nooit half), file_id's zijn per bot-token — renderer en poller gebruiken dus hetzelfde token (de
   renderer stuurt alleen naar de cache-groep, dat conflicteert niet met long polling; verifieer dat met
   de Telegram-API-regels en noteer de bron).
3. **Nix**: `motregen-bot` op de VM wordt `poller` (geen Chromium in de closure voor die unit, kleinere
   geheugen-/CPU-grenzen); nieuwe optie `services.motregen.bot.role`. Een renderer-unit voor een host
   met Chromium (nu ageq-dev2, later een renderbox): systemd-user- of system-unit via dezelfde module, met
   `MOTREGEN_ORIGIN=https://motregen.nl`. Flake check moet groen (`nix flake check --no-build`).
4. **Gate**: `pnpm -C bot test` + typecheck; een unit-test die bewijst dat de poller zonder Chromium
   start en uit het register antwoordt; een end-to-end-proef met `pnpm render` + een dry-run-prime
   (geen echte upload) die het register schrijft en de poller het laat lezen. Draft-PR vroeg; "klaar"
   met: welke registervorm, cijfers (render+prime per generatie op ageq-dev2), en de exacte commando's
   om renderer (ageq-dev2) en poller (VM) te starten.

## Afbakening en bar
Geen wijziging aan loops/stills/knoppen of aan het renderwerk zelf (dat is de latere optimalisatiepass,
MIP-25). Leesbaarheid: geen één-letternamen, geen slimme one-liners, commentaar alleen voor het
niet-vanzelfsprekende waarom; de rolkeuze moet in `docs/telegram.md` staan.
