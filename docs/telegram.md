# Telegram

De bot `@motregen_bot` opent “motregen.nl -- Regenradar en Weersverwachting”
als Mini App en deelt nationale kaarten. `/regen`, `/lucht` en `/gevoel` plaatsen
een foto; `/loop regen`, `/loop lucht`, `/loop gevoel` en `/wind` plaatsen een
video die automatisch afspeelt en herhaalt. `/loop` kiest standaard Regen.
Wind bestaat uitsluitend als loop, nooit als still.

De modusrij bevat Regen, Lucht, Gevoel en Wind. De tijdrij bevat nu, +3u, +6u,
+12u en Loop; bij Wind staat alleen Loop. De knoppen verversen hetzelfde bericht,
ook bij wisselen tussen foto en video. Opnieuw dezelfde selectie aantikken geeft
de toast “Al in beeld” zonder nieuwe render of edit. Inline: typ `@motregen_bot `
in een chat, filter met `regen` of kies alleen video's met `loop regen`.

## BotFather (PO)

1. Kies `@motregen_bot` bij `/setinline` en geef bijvoorbeeld `Regen, lucht
   of gevoel; loop of wind` als placeholder. Locatietoegang voor inline blijft uit.
2. Open **Bot Settings → Configure Mini App** en zet de Main Mini App aan met
   URL `https://motregen.nl/?tg=1`. Hierdoor werkt ook de `startapp`-deeplink
   vanuit inlineberichten en groepen.
3. De service stelt de menuknop met `setChatMenuButton` in op **motregen.nl**
   met dezelfde URL en registreert de zes chatcommando's. `/start` geeft uitleg
   en een `web_app`-knop in een privéchat.

Telegram verbiedt `web_app`-knoppen in inlineberichten en groepen. Daar opent
**Open in motregen.nl** een `https://t.me/motregen_bot?startapp=...`-link naar de
Main Mini App, met dezelfde modus en absolute tijd. Privéchatknoppen gebruiken
rechtstreeks de app-URL met U44-presets. De SDK laadt alleen bij `?tg=1`, roept
`expand()` en `ready()` aan, volgt het Telegram-thema en leest de selectie uit
`tgWebAppStartParam`/`startapp`. Expliciete `modus`/`t`-parameters hebben voorrang.

## Privacy

Chat-, bericht- en inline-id's bestaan alleen in het geheugen; de selectie per
bericht wordt maximaal twee uur onthouden om herhaalde edits over te slaan.
Er is geen database, chatregister of opslag van updates. Journallogs
bevatten alleen gebeurtenisnamen, modi, stappen, manifestversies, rendertijden,
foutcodes en eventueel het berichtnummer van een verzonden foto; geen chat-id,
gebruiker, querytekst, token of upstream fouttekst. De cache bevat uitsluitend
nationale JPEG-kaarten, MP4-loops, renderreceipts en Telegram-file_id's zonder
locatie of persoonsgegevens. De renderroute stuurt geen sessieteller of
gebruiksbaken. Alleen een expliciete lokale `MOTREGEN_DEBUG_CHAT_ID` logt daarnaast
acties uit de aangewezen testchat; die opt-in staat niet in de productie-unit.

De Mini App stuurt geen Telegram `initData`, gebruikers-id of naam naar onze
server. De SDK levert uitsluitend het thema en de startparameter voor de lokale
weergave; er is geen validatieverzoek of HTTP-validatie-endpoint. Presets en
themakleuren zijn weergave-invoer, geen identiteit. Locatie en favorieten blijven
in de browser zoals in [het privacycontract](analytics.md). De HMAC-module in
`bot/auth.ts` blijft unit-getest maar wordt nergens in de draaiende app of bot
aangeroepen.

## Rendering en cache

De renderer draait in dezelfde unit als de poller, met Chromium uit
`pkgs.playwright-driver.browsers` en ffmpeg uit nixpkgs. Per modus opent hij één
pagina van de echte app op `?modus=...&t=<ISO>&still=1`, zonder bediening,
locatiepin, service worker of manifestpolling. De renderhook zet de tijd per
frame en wacht expliciet op de actieve weerlagen. Ontbrekende data levert geen
gecachete lege kaart. De nationale uitsnede is 640×848 CSS-pixels met
`deviceScaleFactor: 1.5`: PNG-frames, JPEG-stills en MP4 zijn 960×1272.

| modus | framereeks | loop | stills uit dezelfde reeks |
| --- | --- | --- | --- |
| Regen | −2…+2 u, elke 5 minuten; plus +3/+6/+12 u | 49 frames op 10 fps; extra toekomstframes buiten de video | nu/+3/+6/+12 u |
| Lucht | nu…+12 u, elk uur | 13 frames op 4 fps | nu/+3/+6/+12 u |
| Gevoel | nu…+12 u, elk uur | 13 frames op 4 fps | nu/+3/+6/+12 u |
| Wind | nu…+12 u, elke 15 minuten | 49 frames op 4 fps | geen |

Windparticles krijgen een vaste simulatieklok, met tussenstappen op 30 Hz en
een seconde opwarming voor het eerste frame. Wandkloktijd en screenshots
drijven de simulatie niet aan. FFmpeg maakt een geluidloze H.264-MP4 met
`yuv420p`, `faststart` en een seconde eindhold. CRF 25 is de eerste keuze;
een bitratefallback begrenst te grote video's tot maximaal 3 MB. JPEGs komen
met ffmpeg `-q:v 3` rechtstreeks uit de betreffende PNG-frames: er zijn geen
afzonderlijke still-renders. Tijdelijke PNGs verdwijnen na de renderpass.

Op het beeld staat bovenaan dezelfde klokmarkup en typografie als op
motregen.nl, in Amsterdamtijd, met het moduswoord klein eronder. De dag staat
erbij als het een andere dag is. Een dun streepje in de Regen-klok wisselt van
grijs bij historie naar de accentkleur bij verwachting. Linksonder staat
“KNMI · OpenFreeMap”. Het bijschrift bevat tijd en modus, uitleg van de kleuren,
bron- en kaartattributie en een link met tijdpreset; de uitleg staat per modus
in STILL_MODES/LOOP_MODES en het geheel blijft onder 1024 tekens.

De manifest-fetch is per reeks vastgezet op de gekozen generatie, terwijl
Chromiums HTTP-cache voor tiles en chunks actief blijft. De cachekey bevat
renderer-versie, modus, tijdstap, absolute tijd en manifest-`generated`.
Bestanden worden atomair gepubliceerd; een receipt verschijnt pas nadat de
hele reeks compleet is. Eén Chromium rendert serieel en gelijke verzoeken
delen een renderpass. Elke generatie levert 4 loops en 12 zelfstandige stills.
De bot publiceert de nieuwe matrix pas als alle modi klaar zijn; de oude
generatie blijft beschikbaar tijdens verversing. Cache-hits en inline
antwoorden wachten niet achter nieuwe Chromium-renders. De bot meet per modus
frames, render- en encodetijd en bytes, en de hele matrix in milliseconden.
De manifestcheck loopt elke 15 seconden na voltooiing van een matrix.

Caddy serveert uitsluitend `/telegram/stills/*.jpg` en `*.mp4` met twee uur
cacheduur en `noindex`; sidecars en receipts geven 404. Cachebestanden ouder
dan twee uur verdwijnen bij een manifestcheck, ook als het renderen van een
nieuwe matrix mislukt.

De eerste chatverzending of edit uploadt de JPEG of MP4 als multipart, via
`sendPhoto`, `sendAnimation` of `editMessageMedia`. Het grootste foto-file_id
of het animation-file_id uit de Telegram-respons komt atomair in
`<kaart>.jpg.file-id.json` of `<loop>.mp4.file-id.json` naast het mediabestand
en blijft ook in geheugen. Vervolgverzendingen en edits sturen alleen dat id.
De sidecar bevat renderkey en botnaam: een nieuwe manifestgeneratie, andere
selectie of andere bot kan geen oud id hergebruiken. Ids vervallen met de
twee-uurs-mediacache; sidecars worden ook opgeruimd.

Inline gebruikt `InlineQueryResultCachedPhoto` of
`InlineQueryResultCachedMpeg4Gif` zodra een file_id bekend is. Stills hebben op
een HTTPS-origin ook een publieke JPEG-URL als fallback. Een loop verschijnt
inline na de eerste chat-upload; er is geen verborgen uploadchat. Een lokale
preview biedt alleen media met een bekend file_id aan. Inline-edits kunnen
nooit een nieuw bestand uploaden en gebruiken een bestaand id of publieke URL.

## Productie

`services.motregen.bot.enable = true` staat aan op de productiehost. De
`motregen-bot.service` gebruikt long polling en herstart bij fouten. De
root-beheerde `/var/lib/motregen/secrets.env` bevat naast de KNMI/ADS-sleutels:

```text
TG_BOT_KEY=<bot-token>
```

Het token gaat nooit in Git of de Nix-store. Configuratie via environment:

| variabele | standaard | betekenis |
| --- | --- | --- |
| `TG_BOT_KEY` | verplicht | token uit BotFather |
| `MOTREGEN_ORIGIN` | `https://motregen.nl` | app en publieke still-URLs |
| `MOTREGEN_RENDER_CACHE` | `tmp/telegram-stills` | lokale cachemap |
| `MOTREGEN_CHROMIUM_PATH` | Playwright-selectie | expliciete nixpkgs-Chromium-binary |

De unit zet de cache op `/var/cache/motregen-bot/stills`, de browsers op het
Nix-storepad, de executable op de headless Chromium uit dezelfde nixpkgs-revisie,
en de origin op het geconfigureerde domein. FFmpeg staat in het PATH van de
wrapper en service. Hierdoor hangen browserpaden niet af van de pnpm-versie
van Playwright. Caddy serveert de nationale stills en loops voor Telegram;
de bot heeft geen HTTP-server. Er is geen webhook. Laat
nooit twee pollers voor hetzelfde token draaien; een Telegram-409 laat de unit
stoppen/herstarten.

Na deploy:

```sh
ssh root@57.129.47.17 'systemctl is-active motregen-bot; journalctl -u motregen-bot -n 30 --no-pager'
```

## Ontwikkeling en rooktest

Vanuit de repositoryroot, in de devenv-omgeving:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm --dir bot test
pnpm build
MOTREGEN_DATA_ORIGIN=https://motregen.nl/data pnpm --dir web preview --host 0.0.0.0 --port 4365 --strictPort
```

Alleen renderen (vier loops en drie nu-stills; `--matrix` geeft alle twaalf
stills; `--mode=weather|air|feels|wind` beperkt tot één modus):

```sh
MOTREGEN_ORIGIN=http://localhost:4365 MOTREGEN_RENDER_CACHE=tmp/telegram-smoke \
  web/scripts/e2e-slot.sh node --env-file=.env bot/dist/bot/smoke.js --render-only
```

Voor de Telegram-rooktest stuurt de PO eerst `/start` in een privéchat aan de
bot; de test leest dat chat-id uitsluitend in het geheugen. Een expliciet
`MOTREGEN_SMOKE_CHAT_ID` kan ook. De test stuurt uitleg en een regenfoto en
ververst diezelfde foto naar Lucht +3u. Daarna gaat hij terug naar Regen en
opnieuw naar Lucht met file_id. Hij rapporteert berichtnummer, manifestversie,
rendertijden en de edit-responstijd voor upload versus file_id (dezelfde JPEG).
Daarna verstuurt de test iedere modus als animation, wisselt hetzelfde bericht
naar een still en terug naar de loop met file_id. Per modus rapporteert hij
frames, render- en encodetijd, MP4-bytes, eerste uploadtijd en cached edit-tijd.
De livebot logt daarnaast `callbackMs` vanaf callbackontvangst tot afronding
van de Telegram-edit. De PO bewaart zijn eigen testchat-id als
`MOTREGEN_SMOKE_CHAT_ID` in de genegeerde lokale `.env`; dat is expliciete
testconfiguratie, geen chatregister van de bot. De Mini App-knoppen wijzen bij een
HTTP-preview naar de publieke HTTPS-app. Meld vóór de test “rooktest klaar om
te starten” aan de orkestrator en in het track-LOG; laat de orkestrator zijn
poller stoppen en log zelf de start en stop van de rooktest. Gebruik één
poller per token:

```sh
MOTREGEN_ORIGIN=http://localhost:4365 MOTREGEN_RENDER_CACHE=tmp/telegram-smoke \
  web/scripts/e2e-slot.sh node --env-file=.env bot/dist/bot/smoke.js
```

De bot kan ook tegen een lokale HTTP-preview draaien: app-knoppen gebruiken
dan een HTTPS-Mini-App-deeplink en inline werkt voor reeds geüploade kaarten.
Voor een gerichte poke-test wordt MOTREGEN_DEBUG_CHAT_ID in het geheugen gezet
op MOTREGEN_SMOKE_CHAT_ID; deze opt-in logt acties uit uitsluitend die testchat.
Gerichte browsercontrole:

```sh
MOTREGEN_E2E_PORT=4366 MOTREGEN_E2E_DATA_PORT=8366 \
  pnpm --dir web e2e e2e/telegram.spec.ts e2e/freshness.spec.ts --project desktop
nix build .#checks.x86_64-linux.nixos-vm --no-link
```

Telegram-documentatie: [Bot API](https://core.telegram.org/bots/api),
[Mini Apps en initData](https://core.telegram.org/bots/webapps).
