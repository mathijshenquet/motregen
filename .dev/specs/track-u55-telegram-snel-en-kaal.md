# Track U55 — Telegram: snelle edits (file_id-cache), lichter beeld, kale overlay (gpt-6.1-sol)

Read first: `AGENTS.md`, `.dev/proposals/0017-webapp-en-telegram.md`, `docs/telegram.md`,
`bot/handlers.ts`, `bot/stills.ts`, `bot/render.ts`, `bot/api.ts`, `bot/main.ts`,
`web/src/components/` (de still-weergave: zoek de `?still`/render-route van U45), U45-LOG.
LOG: `.dev/tracks/u55-telegram-snel-en-kaal/LOG.md` (committed, append-only, timestamped).
Branch `track/u55-telegram-snel-en-kaal` vanaf main. Eigen worktree. Vandaag: 2026-10-07.
Poke-test-bevindingen van de PO (bot lokaal op deze host, 11:05): knoppen voelen traag hoewel
de still uit cache komt; herhaald tikken geeft `update-failed 400` ("message is not modified").

## Opdracht

1. **Telegram-`file_id`-cache**: na de eerste `sendPhoto`/`editMessageMedia`-upload van een still
   het `file_id` uit het antwoord bewaren (in-memory + naast de JPEG in de cache-map, met de
   cache-sleutel incl. manifest-`generated`), en bij volgende verzendingen/edits `media: <file_id>`
   sturen in plaats van `attach://`. Inline-resultaten kunnen dan `InlineQueryResultCachedPhoto`
   gebruiken (geen publieke URL nodig — maakt inline ook lokaal testbaar). Meet: edit-latency
   vóór/ná (tijd tussen callback-ontvangst en Telegram-antwoord), in de LOG.
2. **Lichter beeld**: render op een maat die Telegram niet verder verkleint (lange zijde ≤ 1280 px,
   DPR 1 of 1,5 — kies op scherpte van de labels; meet bytes per JPEG vóór/ná, kwaliteit ~85).
3. **Kale overlay** (PO): op het beeld alleen de tijd bovenaan ("za 14:10" + modus-woord klein),
   linksonder klein "KNMI · OpenFreeMap" (+ CAMS als die laag erop staat); geen pin, geen
   bediening, geen legenda-tekst. De uitleg (welke modus, wat de kleuren betekenen, link) gaat
   in het bijschrift (`caption`, ≤ 1024 tekens) — één regel per modus in `STILL_MODES`.
4. **Stille no-op**: herhaalde tik op dezelfde knop → geen `editMessageMedia` (onthoud de
   huidige selectie per bericht in-memory, of vang Telegram's "message is not modified" op als
   no-op) en beantwoord de callback met een korte toast ("Al in beeld").
5. Tests: unit voor de file_id-cache (sleutel, verval bij nieuw manifest) en de no-op; rooktest
   tegen de lokale preview met `MOTREGEN_DEBUG_CHAT_ID` (zie bot/handlers.ts) naar de chat uit
   `MOTREGEN_SMOKE_CHAT_ID` in `.env`; `pnpm typecheck`, `pnpm --dir bot test`, `pnpm build`,
   `nix build .#checks.x86_64-linux.nixos-vm --no-link`. Synchrone exit statussen in de LOG.
   Draft-PR vroeg. Let op: er draait een bot-instantie van de orkestrator op deze host; stop
   die niet — gebruik voor je eigen rooktest een tweede bot-token NIET; vraag de orkestrator om
   de instantie te stoppen vóór jouw rooktest (één poller per token).

## Afbakening

Geen video (U54 later), geen nieuwe modi. Leesbaarheidsbar: geen één-letternamen, geen slimme
one-liners, commentaar alleen voor een niet-triviaal waarom.
