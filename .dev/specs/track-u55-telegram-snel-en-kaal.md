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

De PO-aanvulling hieronder voegt video toe; geen andere nieuwe modi. Leesbaarheidsbar: geen één-letternamen, geen slimme
one-liners, commentaar alleen voor een niet-triviaal waarom.

## Aanvulling PO 2026-10-07 (was U54): video-loop, stills uit de framereeks

6. **Eén render-pass per modus = framereeks.** De renderer maakt per verversing per modus een
   reeks frames (Playwright, still-modus met tijdpreset; Regen: afgelopen 2 u radar + 2 u
   nowcast op 5 min ≈ 48 frames; Lucht/Gevoel: uurframes nu…+12 u; Wind komt hier terug als
   loop, want in video bewegen de particles — render de windlaag met een vaste simulatieklok
   per frame zodat de loop vloeiend is). Stills voor de knoppen (nu, +3u, +6u, +12u) zijn
   frames uit die reeks (JPEG uit het PNG-frame); geen aparte still-renders meer. De regenpass
   neemt +3/+6/+12 u als extra frames op voor de stills, buiten het -2…+2 u-loopbereik.
   PO-precisering: Wind uitsluitend als loop; nooit Wind-stills. De andere drie modi houden
   zowel de loop als de vier zelfstandige JPEG-stills.
7. **mp4 via ffmpeg** (nixpkgs; in de Nix-service meenemen): H.264 geluidloos, lange zijde
   ≤ 1280, ~10 fps voor radar, ~4 fps voor uurreeksen, laatste frame 1 s vasthouden, doel
   ≤ 3 MB. Versturen met `sendAnimation` (autoplay + lus); `file_id` cachen zoals bij de
   stills; inline via `InlineQueryResultCachedMpeg4Gif`. Knop "Loop" naast de tijden, en
   `/loop` (+ modus-argument).
8. Overlay in de video: alleen de lopende tijd bovenaan (per frame), bronnen klein
   linksonder; de "nu"-grens als dun verticaal streepje in het tijdlabel of een kleur-
   omslag van het label (radar vs nowcast) — kies wat leesbaar blijft op een telefoon.
9. Meet en log per modus: frames, rendertijd, encodetijd, mp4-bytes, upload-tijd eerste
   verzending, edit-latency met file_id. Matrix per verversing wordt: Regen/Lucht/Gevoel elk
   video + 4 stills uit dezelfde frames; Wind alleen video (4 loops + 12 stills).

## Latere PO-poke (2026-10-07)

10. Niet bewerkbaar bericht: exacte 400-description vaststellen; specifieke
    `message can't be edited`/`message to edit not found` afhandelen met toast
    “Verlopen, stuur /regen opnieuw”, geen update-failed 400. Ook verlopen
    callback-ack stil afhandelen. Vooraf cachechat-upload en file_id-opslag vóór
    matrixpublicatie; eerste gebruikersklik mag niet meer uploaden.
11. Bijschrift alleen een hyperlink motregen.nl; geen regenintensiteitsbeschrijving
    of attributietekst. Tijd + dag zoals referentieklok, modus en bronnen op het
    beeld. Open-in-motregen.nl-knop verwijderen.
12. Eerdere vier vaste tijden vervangen door relatieve −1u/−10m/nu/+10m/+1u;
    nu reset naar de nieuwste generatie. Hiervoor tienminutenstills over −2…+12u
    in dezelfde moduspass opnemen: 85 per niet-Wind-modus, dus 255 JPEG + 4 loops.
    De loop-fps en loop-tijdbereiken blijven die van punten 6–9. Nieuwe versie
    melden zodra de lokale bot deze contracten serveert.
13. Productie gebruikt uitsluitend een expliciete, optionele
    `MOTREGEN_CACHE_CHAT_ID` voor vooraf uploaden; zonder cachechat lui uploaden
    bij eerste verzending/edit. De PO-/rooktestchat mag nooit cache-uploaddoel
    zijn, ook niet lokaal; alleen een apart privékanaal of -groep met de bot als beheerder. Vastleggen
    in Telegram- en Nix-service-documentatie; herstel na getUpdates-netwerkfout
    controleren en loggen.
14. Na succesvol primen van een nieuwe generatie de kanaalposts van de vorige
    generatie verwijderen; kanaal bevat hoogstens één matrix. Specifieke
    wrong-file-identifier/file-not-found-respons: één her-upload, cache-id
    vervangen en verzending/edit herhalen. Beide unit-testen. Eerste
    channel_post/my_chat_member voor kanaal of message-update uit een
    group/supergroup: uitsluitend chat.id melden. Nu groep geconfigureerd;
    prewarm na ontvangen id en .env-update herstarten, prime-tijden en posts
    per generatie loggen, live-logpad en PR-receipts melden.
15. Vooraf primen beperken tot nu/−10m/+10m/−1u/+1u per niet-Wind-modus
    plus vier loops: 19 media. Overige JPEGs bij aanvraag uit opgeslagen PNG,
    eenmaal uploaden en daarna file_id. Doel render+prime <90 seconden; meten.
    Volledige PNG-reeksen en loop-tijdbereiken blijven beschikbaar. U56/main
    vóór de volgende gate mergen; gedeelde klok en usage-v2 behouden.
16. Open-fase robuust onder load: één retry met vijf seconden backoff en ruimere
    navigatie-time-out; dezelfde manifestgeneratie vasthouden. Poging/stap en
    werkelijke open-tijd loggen. Herhaalde Weather-open-time-outs eerst afzonderlijk
    reproduceren met request-/gereedheidsdiagnostiek, vóór nieuwe prewarm-metingen.
17. PO na rooktest: Lucht uit Telegram verwijderen (knoppen, commando’s, inline,
    render-/prewarm-matrix). Overblijvend: Regen en Gevoel elk vijf prewarm-stills
    plus loop, Wind alleen loop: 13 media, 170 mogelijke stills, drie loops.
