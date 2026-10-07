# Telegram

De bot `@motregen_bot` opent “motregen.nl -- Regenradar en Weersverwachting”
als Mini App en deelt nationale kaarten. `/regen`, `/lucht` en `/gevoel` plaatsen
een foto; `/loop regen`, `/loop lucht`, `/loop gevoel` en `/wind` plaatsen een
video die automatisch afspeelt en herhaalt. `/loop` kiest standaard Regen.
Wind bestaat uitsluitend als loop, nooit als still.

De modusrij bevat Regen, Lucht, Gevoel en Wind. De tijdrij bevat −1u, −10m, nu,
+10m, +1u en Loop; bij Wind staat alleen Loop. Deltaknoppen stappen vanaf de
getoonde tijd, nu kiest de nieuwste generatie. Aan de rand van −2…+12 uur
verdwijnen stappen buiten het bereik. De knoppen verversen hetzelfde bericht,
ook bij wisselen tussen foto en video. Opnieuw dezelfde selectie aantikken geeft
de toast “Al in beeld” zonder nieuwe render of edit. Niet meer bewerkbare of
verlopen berichten geven “Verlopen, stuur /regen opnieuw”. Onder het beeld staat
alleen een klikbare `motregen.nl`-link; er is geen aparte app-knop. Inline: typ `@motregen_bot `
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

Het korte bijschrift opent de app met dezelfde modus en absolute tijd via
U44-presets. `/start` en de menuknop openen de Mini App; groepen gebruiken bij
`/start` een `https://t.me/motregen_bot?startapp`-link omdat Telegram daar geen
`web_app`-knop accepteert. De SDK laadt alleen bij `?tg=1`, roept
`expand()` en `ready()` aan, volgt het Telegram-thema en leest de selectie uit
`tgWebAppStartParam`/`startapp`. Expliciete `modus`/`t`-parameters hebben voorrang.

## Privacy

Chat-, bericht- en inline-id's bestaan alleen in het geheugen; de selectie per
bericht wordt maximaal twee uur onthouden om herhaalde edits over te slaan.
Er is geen database, chatregister of opslag van updates. De cachechat is expliciete
configuratie via environment, geen verzamelde gebruiker. Alleen de eigen nieuwe
cacheposts worden verwijderd nadat hun ids zijn opgeslagen. Journallogs
bevatten alleen gebeurtenisnamen, modi, stappen, manifestversies, rendertijden,
foutcodes en eventueel het berichtnummer van een verzonden foto; geen chat-id,
gebruiker, querytekst, token of upstream fouttekst. De cache bevat uitsluitend
nationale PNG-frames, JPEG-kaarten, MP4-loops, renderreceipts en Telegram-file_id's zonder
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
| Regen | −2…+2 u, elke 5 minuten; extra tienminutenframes tot +12 u | 49 frames op 10 fps; extra toekomstframes buiten de video | 85 frames, −2…+12 u elke 10 minuten |
| Lucht | uurframes nu…+12 u; aanvullende tienminutenframes −2…+12 u | 13 frames op 4 fps | 85 frames, −2…+12 u elke 10 minuten |
| Gevoel | uurframes nu…+12 u; aanvullende tienminutenframes −2…+12 u | 13 frames op 4 fps | 85 frames, −2…+12 u elke 10 minuten |
| Wind | nu…+12 u, elke 15 minuten | 49 frames op 4 fps | geen |

Windparticles krijgen een vaste simulatieklok, met tussenstappen op 30 Hz en
een seconde opwarming voor het eerste frame. Wandkloktijd en screenshots
drijven de simulatie niet aan. FFmpeg maakt een geluidloze H.264-MP4 met
`yuv420p`, `faststart` en een seconde eindhold. CRF 25 is de eerste keuze;
een bitratefallback begrenst te grote video's tot maximaal 3 MB. JPEGs komen
met ffmpeg `-q:v 3` rechtstreeks uit de betreffende PNG-frames: er zijn geen
afzonderlijke still-renders. De PNG-reeks blijft in `<loop-key>.frames` twee uur
op schijf. Alleen aangevraagde JPEGs worden gemaakt; gelijke aanvragen delen
die conversie. PNGs en receipts zijn privé en worden niet door Caddy geserveerd.

Op het beeld staat bovenaan dezelfde klokmarkup en typografie als op
motregen.nl, in Amsterdamtijd, met de dag ernaast en het moduswoord klein eronder.
Een dun streepje in de Regen-klok wisselt van
grijs bij historie naar de accentkleur bij verwachting. Linksonder staat
“KNMI · OpenFreeMap · © OpenStreetMap”. Het bijschrift is alleen een HTML-link
`motregen.nl` met tijdpreset; tijd, modus en attributie staan in het beeld.

De manifest-fetch is per reeks vastgezet op de gekozen generatie, terwijl
Chromiums HTTP-cache voor tiles en chunks actief blijft. De cachekey bevat
renderer-versie, modus, tijdstap, absolute tijd en manifest-`generated`.
Bestanden worden atomair gepubliceerd; een receipt verschijnt pas nadat de
hele reeks compleet is. Eén Chromium rendert maximaal vier modusreeksen tegelijk;
gelijke verzoeken delen een renderpass. Per generatie worden 4 loops en 15 JPEGs
vooraf klaargezet: nu/−10m/+10m/−1u/+1u per niet-Wind-modus. Alleen deze **19 media**
worden vooraf naar Telegram geüpload. De overige tienminutenposities blijven
beschikbaar als PNG in dezelfde reeks; JPEG en eenmalige upload volgen bij aanvraag.
Daarna gebruikt ook die selectie file_id. Doel voor render+prime is <90 seconden;
de gemeten tijden staan in het track-LOG.
Een tijdelijke netwerkfout of HTTP 5xx bij een weerchunk krijgt tijdens rendering
één herpoging met dezelfde Range. Een blijvende fout publiceert geen nieuwe matrix.
De bot publiceert de nieuwe matrix pas als alle modi gerenderd zijn en, bij een
geconfigureerde cachechat, hun Telegram-ids bekend zijn; de oude
generatie blijft beschikbaar tijdens verversing. Cache-hits en inline
antwoorden wachten niet achter nieuwe Chromium-renders. De bot meet per modus
frames, render- en encodetijd en bytes, en de hele matrix in milliseconden.
De manifestcheck loopt elke 15 seconden na voltooiing van een matrix.

Caddy serveert uitsluitend `/telegram/stills/*.jpg` en `*.mp4` met twee uur
cacheduur en `noindex`; sidecars en receipts geven 404. Cachebestanden ouder
dan twee uur, inclusief PNG-directories, verdwijnen bij een manifestcheck, ook als het renderen van een
nieuwe matrix mislukt.

Met `MOTREGEN_CACHE_CHAT_ID` uploadt de bot vóór publicatie de maximaal 15 ontbrekende prewarm-JPEGs in albums van maximaal tien
via `sendMediaGroup` en MP4s via `sendAnimation` naar `MOTREGEN_CACHE_CHAT_ID`.
Uploads zijn stil, serieel met tussenruimte, en volgen Telegram `retry_after`.
Gelijke aanvragen delen de upload. De huidige generatie blijft in het aparte
privékanaal of de privégroep. Pas als de nieuwe generatie volledig geprimed is,
verwijdert de bot met `deleteMessages` de eigen posts van oudere generaties.
Bij een mislukte prime blijft de vorige matrix staan. Een atomair lokaal
`.cache-posts-*.json`-register bewaart bot, cachechat, generatie en bericht-ids
voor opruimen na een herstart; Caddy serveert dit register niet. Automatisch
verwijderen in Telegram is een vangnet, geen vervanging voor dit opruimen.
Ook een aanvraag tijdens opwarming krijgt eerst een cache-upload,
zodat een gebruikersbericht en zijn eerste tik alleen file_id sturen.
Zonder deze optionele variabele uploadt de bot lui bij de eerste verzending of
edit naar de betreffende gebruikerschat en bewaart daarna het file_id. Er is
geen automatisch gekozen cachechat en geen fallback naar een PO- of rooktestchat.
Het grootste foto-file_id
of het animation-file_id uit de Telegram-respons komt atomair in
`<kaart>.jpg.file-id.json` of `<loop>.mp4.file-id.json` naast het mediabestand
en blijft ook in geheugen. Vervolgverzendingen en edits sturen alleen dat id.
De sidecar bevat renderkey en botnaam: een nieuwe manifestgeneratie, andere
selectie of andere bot kan geen oud id hergebruiken. Ids vervallen met de
twee-uurs-mediacache; sidecars worden ook opgeruimd.
Een specifiek `wrong file identifier`, `wrong remote file identifier` of
`file not found` op een bestaand id wist dat id en doet één her-upload. De
verzending/edit wordt eenmaal herhaald met het nieuwe id; geheugen en sidecar
worden vervangen. Bij een cachechat gaat de her-upload daarheen, ook voor inline.
In luie modus gaat een chat-her-upload rechtstreeks naar de gebruiker; inline
kan bij een ontbrekend id de publieke URL gebruiken. Als het herstel ook faalt,
krijgt de gebruiker “Beeld kon niet laden, probeer opnieuw”, geen API-fouttekst.

Inline gebruikt `InlineQueryResultCachedPhoto` of
`InlineQueryResultCachedMpeg4Gif` zodra het file_id bekend is, ook lokaal;
met een cachechat geldt dat voor de hele gepubliceerde matrix.
De cachechat wordt expliciet geconfigureerd. Stills hebben op een HTTPS-origin
ook een publieke JPEG-URL als fallback. Inline-edits kunnen nooit een nieuw
bestand uploaden en gebruiken een bestaand id of publieke URL.

Deltacallbacks bevatten absolute tijd en generatie, zodat een manifestwissel
tijdens het klikken de stap niet verschuift. De bot onthoudt generaties twee uur;
nu pakt steeds de nieuwste matrix. Niet meer bekende generaties en Telegrams
`message can't be edited`/`message to edit not found` geven de verlopen-toast.
Een verlopen callback-query kan Telegram niet meer beantwoorden; die wordt
stil afgehandeld, zonder `update-failed 400`. Andere API-fouten blijven zichtbaar.

## Productie

`services.motregen.bot.enable = true` staat aan op de productiehost. De
`motregen-bot.service` gebruikt long polling en herstart bij fouten. De
root-beheerde `/var/lib/motregen/secrets.env` bevat naast de KNMI/ADS-sleutels:

```text
TG_BOT_KEY=<bot-token>
```

Optioneel kan `MOTREGEN_CACHE_CHAT_ID=<cache-chat-id of @kanaal>` worden toegevoegd
voor vooraf uploaden. Dit is uitsluitend een expliciet ingericht privékanaal
of -groep; de bot is beheerder met schrijf- en verwijderrechten. Het opstarten
controleert chattype en beheerder/verwijderrechten en weigert een privéchat.
Zonder deze variabele werkt de
service met luie uploads. `MOTREGEN_SMOKE_CHAT_ID` en `MOTREGEN_DEBUG_CHAT_ID` horen
niet in de productieconfiguratie en bepalen nooit het cache-uploaddoel.

Het token gaat nooit in Git of de Nix-store. Configuratie via environment:

| variabele | standaard | betekenis |
| --- | --- | --- |
| `TG_BOT_KEY` | verplicht | token uit BotFather |
| `MOTREGEN_CACHE_CHAT_ID` | niet ingesteld | optioneel privékanaal of -groep voor vooraf uploaden; anders luie uploads |
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

Alleen renderen (vier loops en drie nu-stills; `--matrix` geeft alle 255
stills; `--mode=weather|air|feels|wind` beperkt tot één modus):

```sh
MOTREGEN_ORIGIN=http://localhost:4365 MOTREGEN_RENDER_CACHE=tmp/telegram-smoke \
  web/scripts/e2e-slot.sh node --env-file=.env bot/dist/bot/smoke.js --render-only
```

Voor de Telegram-rooktest stuurt de PO eerst `/start` in een privéchat aan de
bot; de test leest dat chat-id uitsluitend in het geheugen. Een expliciet
`MOTREGEN_SMOKE_CHAT_ID` kan ook. De test rendert en uploadt eerst de volledige
19-media-matrix naar de geconfigureerde cachechat. Vervolgens verstuurt hij uitleg en
een regenfoto en ververst hetzelfde bericht naar
Lucht +10m met het vooraf verkregen file_id. Daarna gaat hij terug naar Regen en
opnieuw naar Lucht. Hij rapporteert berichtnummer, manifestversie en beide
cached edit-responstijden; de eerste edit moet al fileIdCached=true zijn.
Lucht +20m controleert vervolgens het luie pad: JPEG uit bestaande PNG, één
cache-upload en hergebruik van hetzelfde id bij de volgende edit.
Daarna verstuurt de test iedere modus als animation, wisselt hetzelfde bericht
naar een still en terug naar de loop met file_id. Per modus rapporteert hij
frames, render- en encodetijd, MP4-bytes, cached verzendtijd en edit-tijd.
De eerste uploads staan apart als media-cache-primed in het log.
De livebot logt daarnaast `callbackMs` vanaf callbackontvangst tot afronding
van de Telegram-edit. De PO bewaart zijn eigen testchat-id als
`MOTREGEN_SMOKE_CHAT_ID` in de genegeerde lokale `.env`; dat is expliciete
testconfiguratie, geen chatregister van de bot. De Mini App-knoppen wijzen bij een
HTTP-preview naar de publieke HTTPS-app. Meld vóór de test “rooktest klaar om
te starten” aan de orkestrator en in het track-LOG; laat de orkestrator zijn
poller stoppen en log zelf de start en stop van de rooktest. Gebruik één
poller per token:

De rooktestchat mag nooit het cache-uploaddoel zijn, ook niet lokaal: send+delete
is zichtbaar. Vooraf uploaden mag uitsluitend naar een apart privékanaal of -groep via
`MOTREGEN_CACHE_CHAT_ID`, met de bot als beheerder. Een privégroep of supergroep
werkt ook, met dezelfde uploads en verwijderrechten. Zonder cache-id draait de
poke-bot in luie modus; de matrixrooktest vereist het aparte cache-id.

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
