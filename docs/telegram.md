# Telegram

De bot `@motregen_bot` opent motregen.nl als Mini App en deelt nationale kaarten
van Nederland en Vlaanderen. `/regen`, `/lucht` en `/gevoel` plaatsen
een foto met knoppen voor de drie modi en nu, +3, +6 en +12 uur.
De knoppen verversen hetzelfde bericht. Opnieuw dezelfde selectie aantikken geeft
de toast “Al in beeld” zonder nieuwe render of edit. Inline: typ `@motregen_bot ` in een chat,
of filter met bijvoorbeeld `@motregen_bot regen`.

## BotFather (PO)

1. Kies `@motregen_bot` bij `/setinline` en geef bijvoorbeeld `Regen, lucht
   of gevoel` als placeholder. Locatietoegang voor inline blijft uit.
2. Open **Bot Settings → Configure Mini App** en zet de Main Mini App aan met
   URL `https://motregen.nl/?tg=1`. Hierdoor werkt ook de `startapp`-deeplink
   vanuit inlineberichten en groepen.
3. De service stelt de menuknop met `setChatMenuButton` in op **motregen.nl**
   met dezelfde URL en registreert de vier chatcommando's. `/start` geeft uitleg
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
nationale JPEG-kaarten en hun Telegram-file_id's zonder locatie of persoonsgegevens. Stills sturen geen
sessieteller of gebruiksbaken.

De Mini App stuurt geen Telegram `initData`, gebruikers-id of naam naar onze
server. De SDK levert uitsluitend het thema en de startparameter voor de lokale
weergave; er is geen validatieverzoek of HTTP-validatie-endpoint. Presets en
themakleuren zijn weergave-invoer, geen identiteit. Locatie en favorieten blijven
in de browser zoals in [het privacycontract](analytics.md). De HMAC-module in
`bot/auth.ts` blijft unit-getest maar wordt nergens in de draaiende app of bot
aangeroepen.

## Rendering en cache

De renderer draait in dezelfde unit als de poller, met Chromium uit
`pkgs.playwright-driver.browsers`. Elke screenshot laadt de echte app op
`?modus=...&t=<ISO>&still=1`, zonder bediening, locatiepin, afspelen, service
worker of manifestpolling. De uitsnede is nationaal, 640×848 CSS-pixels met
`deviceScaleFactor: 1.5`: de JPEG is 960×1272, kwaliteit 85. De kaart en actieve weerlagen
moeten expliciet gereed zijn; ontbrekende data levert geen gecachte lege kaart.
Op het beeld staat alleen Amsterdamtijd bovenaan met het moduswoord klein,
en linksonder “KNMI · OpenFreeMap”. Het bijschrift bevat tijd en modus,
de uitleg van de kleuren, bron- en kaartattributie en een link met tijdpreset;
de uitleg staat per modus in STILL_MODES en het geheel blijft onder 1024 tekens.

De manifest-fetch is per render vastgezet op de gekozen generatie, terwijl
Chromiums HTTP-cache voor tiles en chunks actief blijft. De cachekey
bevat renderer-versie, modus, tijdstap, absolute tijd en manifest-`generated`.
Bestanden worden atomair gepubliceerd. Eén Chromium rendert serieel; gelijke
verzoeken delen een render. Bij een nieuwe manifestversie worden de 12
combinaties vooraf gemaakt, de drie nu-kaarten eerst. Inline antwoorden gebruiken
beschikbare kaarten direct, zonder op Chromium te wachten; tijdens opwarming
kunnen resultaten nog ontbreken. Bestaande kaarten blijven bruikbaar tijdens
verversing. De bot meet iedere render en de hele matrix in milliseconden.
De manifestcheck loopt elke 15 seconden na voltooiing van een matrix.

Caddy serveert `/telegram/stills/*.jpg` met twee uur cacheduur en `noindex`;
zo kan Telegram inlinefoto's en inline-edits ophalen zonder uploadchat.
Cachebestanden ouder dan twee uur verdwijnen bij een manifestcheck, ook als
het renderen van een nieuwe matrix mislukt.
De eerste chatverzending of edit uploadt de JPEG als multipart. Het grootste
file_id uit de Telegram-respons wordt atomair in `<kaart>.jpg.file-id.json`
naast de JPEG gezet en in geheugen bewaard. Vervolgverzendingen en edits sturen
alleen dat file_id. De sidecar bevat renderkey en botnaam: een nieuwe
manifestgeneratie, andere selectie of andere bot kan geen oud id hergebruiken.
Ids vervallen met de twee-uurs-JPEG-cache; sidecars worden ook opgeruimd.

Inline gebruikt `InlineQueryResultCachedPhoto` als een file_id bekend is.
Zonder id blijft op een HTTPS-origin de publieke JPEG-URL beschikbaar.
Een lokale preview heeft geen publieke URL nodig zodra `/regen`, `/lucht`
of `/gevoel` de betreffende kaart heeft geüpload; onbekende kaarten worden
dan nog niet als inline-resultaat aangeboden. Inline-edits kunnen nooit een
nieuwe JPEG uploaden en gebruiken daarom een bestaand id of de publieke URL.

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
en de origin op het geconfigureerde domein. Hierdoor hangen browserpaden niet af
van de pnpm-versie van Playwright. Caddy serveert uitsluitend de nationale
stills voor Telegram; de bot heeft geen HTTP-server. Er is geen webhook. Laat
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
pnpm test
pnpm build
MOTREGEN_DATA_ORIGIN=https://motregen.nl/data pnpm --dir web preview --host 0.0.0.0 --port 4360 --strictPort
```

Alleen renderen (drie modi; voeg `--matrix` toe voor alle 12 combinaties):

```sh
MOTREGEN_ORIGIN=http://localhost:4360 MOTREGEN_RENDER_CACHE=tmp/telegram-smoke \
  web/scripts/e2e-slot.sh node --env-file=.env bot/dist/bot/smoke.js --render-only
```

Voor de Telegram-rooktest stuurt de PO eerst `/start` in een privéchat aan de
bot; de test leest dat chat-id uitsluitend in het geheugen. Een expliciet
`MOTREGEN_SMOKE_CHAT_ID` kan ook. De test stuurt uitleg en een regenfoto en
ververst diezelfde foto naar Lucht +3u. Daarna gaat hij terug naar Regen en
opnieuw naar Lucht met file_id. Hij rapporteert berichtnummer, manifestversie,
rendertijden en de edit-responstijd voor upload versus file_id (dezelfde JPEG).
De livebot logt daarnaast `callbackMs` vanaf callbackontvangst tot afronding
van de Telegram-edit. De PO bewaart zijn eigen testchat-id als
`MOTREGEN_SMOKE_CHAT_ID` in de genegeerde lokale `.env`; dat is expliciete
testconfiguratie, geen chatregister van de bot. De Mini App-knoppen wijzen bij een
HTTP-preview naar de publieke HTTPS-app. Stop een actieve poller vóór de test:

```sh
MOTREGEN_ORIGIN=http://localhost:4360 MOTREGEN_RENDER_CACHE=tmp/telegram-smoke \
  web/scripts/e2e-slot.sh node --env-file=.env bot/dist/bot/smoke.js
```

De bot kan ook tegen een lokale HTTP-preview draaien: app-knoppen gebruiken
dan een HTTPS-Mini-App-deeplink en inline werkt voor reeds geüploade kaarten.
Voor een gerichte poke-test wordt MOTREGEN_DEBUG_CHAT_ID in het geheugen gezet
op MOTREGEN_SMOKE_CHAT_ID; deze opt-in logt acties uit uitsluitend die testchat.
Gerichte browsercontrole:

```sh
MOTREGEN_E2E_PORT=4361 MOTREGEN_E2E_DATA_PORT=8361 \
  pnpm --dir web e2e e2e/telegram.spec.ts e2e/presets.spec.ts --project desktop
nix build .#checks.x86_64-linux.nixos-vm --no-link
```

Telegram-documentatie: [Bot API](https://core.telegram.org/bots/api),
[Mini Apps en initData](https://core.telegram.org/bots/webapps).
