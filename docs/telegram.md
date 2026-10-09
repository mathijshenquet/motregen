# Telegram

De bot `@motregen_bot` opent “motregen.nl -- Regenradar en Weersverwachting”
als Mini App en deelt nationale kaarten. `/regen`, `/temperatuur` (alias `/hitte`) en `/wind`
plaatsen een video die automatisch afspeelt en herhaalt: de loop is het standaardantwoord van elk
commando (PO 2026-10-07, U58). Een stilstaand beeld komt via de tijdknoppen onder het bericht.
Het commando `/loop` is vervallen. `/gevoel`, de naam van `/temperatuur` tot U58, blijft werken maar
staat niet meer in het commandomenu of de starttekst. Wind bestaat uitsluitend als loop, nooit als still.

De modusrij bevat Regen, Temperatuur en Wind (de tab in de app heet Gevoel; in de bot volgt de knop het commando). De tijdrij bevat −1u, −10m, nu,
+10m, +1u en Loop; bij Wind staat alleen Loop. Vanuit de loop geven de deltaknoppen een still
ten opzichte van nu; vanuit een still stappen ze vanaf de
getoonde tijd, nu kiest de nieuwste generatie. Aan de rand van −2…+12 uur
verdwijnen stappen buiten het bereik. De set tijdknoppen staat per modus in `STILL_MODES` (`deltaMinutes` in
`bot/stills.ts`, veelvouden van tien minuten); regen en temperatuur hebben nu dezelfde set. De knoppen verversen hetzelfde bericht,
ook bij wisselen tussen foto en video. Opnieuw dezelfde selectie aantikken geeft
de toast “Al in beeld” zonder nieuwe render of edit. Niet meer bewerkbare of
verlopen berichten geven “Verlopen, stuur /regen opnieuw”. Onder het beeld staat
alleen een klikbare `motregen.nl`-link; er is geen aparte app-knop. Inline: typ `@motregen_bot `
in een chat, filter met `regen`, `temperatuur`, `hitte` of `wind`, of kies alleen video's met `loop regen`.

## BotFather (PO)

1. Kies `@motregen_bot` bij `/setinline` en geef bijvoorbeeld `Regen,
   temperatuur of wind` als placeholder. Locatietoegang voor inline blijft uit.
2. Open **Bot Settings → Configure Mini App** en zet de Main Mini App aan met
   URL `https://motregen.nl/?tg=1`. Hierdoor werkt ook de `startapp`-deeplink
   vanuit inlineberichten en groepen.
3. De service stelt de menuknop met `setChatMenuButton` in op **motregen.nl**
   met dezelfde URL en registreert de vijf chatcommando's. `/start` geeft uitleg
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
nationale PNG-/PPM-frames, JPEG-kaarten, MP4-loops, renderreceipts en Telegram-file_id's zonder
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

## Rollen en gedeeld register (MIP-25, U67)

Eén `motregen-bot` heeft drie rollen, gekozen met `--role=poller`, `--role=renderer` of
`--role=combined`. De vlag gaat vóór `MOTREGEN_BOT_ROLE`. Zonder beide blijft lokaal `combined`
de standaard; de Nix-module kiest standaard `poller`.

| rol | werk | vereisten |
| --- | --- | --- |
| `renderer` | Manifest elke 15 s na voltooiing controleren; alle 173 selecties renderen, naar de cachechat primen en het register publiceren. Geen updates of bot-menuwijzigingen. | Chromium, ffmpeg, `TG_BOT_KEY`, `MOTREGEN_CACHE_CHAT_ID`; beheerder met verwijder- en pinrechten (kanaal: editrechten). |
| `poller` | Long polling en handlers; uitsluitend bestaande file_ids versturen. Geen browser, encoder, uploads of publieke media-URL-fallback. | Hetzelfde token en dezelfde cachechat. |
| `combined` | Bestaande lokale combinatie: 13 prewarm-media, overige stills op aanvraag. | Chromium, ffmpeg, token; cachechat optioneel. |

Het register is een **vastgepind JSON-document** `motregen-register.json` in de bestaande cachechat.
Een tekstbericht is te klein voor 173 file_ids. Het document bevat formaatversie, bot-id,
manifestgeneratie, `now` en per selectie een file_id: drie loops en 85 stills voor zowel Regen als
Temperatuur. De renderer primet de volledige generatie voordat hij het bestaande gepinde document
met één `editMessageMedia` vervangt. De eerste publicatie gebruikt `sendDocument` en
`pinChatMessage`; pas daarna ruimt hij oude media-cacheposts op. Een mislukte render, upload of
registerpublicatie laat de vorige volledige generatie beschikbaar. Deze cachechat is voor de bot;
pin er geen andere berichten naast het register.

De poller leest `getChat.pinned_message.document`, haalt een gewijzigd document op via `getFile`
en accepteert alleen een complete matrix van de eigen bot. Hij wisselt de hele generatie tegelijk,
controleert elke 15 s en bewaart de laatste volledige matrix ook lokaal voor herstarts en
netwerkstoringen. Oudere registers kunnen die matrix niet terugzetten. Bekende oudere generaties
blijven twee uur bruikbaar; bij een onbekende/verlopen selectie toont hij de nieuwste beschikbare
generatie met “Nieuwste beschikbare generatie getoond.” Een absolute tijd wordt daarbij afgerond
op de dichtstbijzijnde beschikbare tienminutenpositie binnen het bereik. Zonder enig register is
het antwoord “Beeld wordt klaargezet, probeer zo opnieuw.” Een ongeldig Telegram-id geeft een korte
foutmelding; alleen de renderer kan nieuwe media aanleveren.

Renderer en poller gebruiken hetzelfde token omdat [file_ids botspecifiek zijn](https://core.telegram.org/bots/api#sending-files).
Alleen de poller roept `getUpdates` aan; de renderer gebruikt verzend-, edit- en chatmethoden.
De [update-exclusiviteit](https://core.telegram.org/bots/api#getting-updates) geldt voor `getUpdates`
tegenover webhooks, niet voor deze verzendmethoden. Dit is de grondslag voor twee processen met
één token; twee pollers blijven verboden. Zie ook [getChat](https://core.telegram.org/bots/api#getchat),
[getFile](https://core.telegram.org/bots/api#getfile), [editMessageMedia](https://core.telegram.org/bots/api#editmessagemedia)
en [pinrechten](https://core.telegram.org/bots/api#pinchatmessage).

De volledige matrix vraagt meer uploads dan de gecombineerde modus. Telegram noemt
[20 berichten per minuut in groepen](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this).
De bestaande seriële uploader volgt `retry_after` en bewaart al verkregen ids voor een volgende
poging. Een echte prime-meting is nodig om de cadans met deze cachegroep vast te stellen;
de dry-run hieronder bewijst het transport en antwoordpad, niet dat render plus upload binnen 210 s past.

### Starten

Op ageq-dev2, vanuit de bijgewerkte main-checkout, met de bestaande `.env` en devomgeving:

```bash
cd /home/mathijs/motregen
set -a
source .env
set +a
export MOTREGEN_ORIGIN=https://motregen.nl
export MOTREGEN_RENDER_CACHE="$PWD/tmp/telegram-renderer"
export MOTREGEN_CHROMIUM_PATH=/nix/store/j8hc3kdypr2gaa2w3dq0a370lwfzbasf-chromium-151.0.7922.137/bin/chromium
pnpm -C bot dev --role=renderer
```

Het concrete Chromium-pad is dat van de U67-proef op ageq-dev2; bij een nieuwe Nix-versie gebruik je
het nieuwe pad of de module hieronder. Het token en de cachechat blijven in het environmentbestand.
Start de VM-poller pas nadat de orkestrator de bestaande poller op ageq-dev2 heeft gestopt.
Na deployment van de bijgewerkte Nix-configuratie en secrets op de VM:

```bash
sudo systemctl unmask --runtime motregen-bot.service
sudo systemctl start motregen-bot.service
```

De VM-configuratie stelt `services.motregen.bot.role = "poller"` in. De unit gebruikt
`motregen-bot --role=poller`, 25% CPU, 192 MB MemoryHigh en 256 MB MemoryMax. Zijn closure bevat
geen Chromium en zijn packagewrapper trekt ffmpeg niet mee. Voor een renderhost kan dezelfde
NixOS-module zelfstandig een system-unit leveren, zonder lokale ingest of Caddy:

```nix
{
  imports = [ inputs.motregen.nixosModules.motregen ];
  services.motregen.bot = {
    enable = true;
    role = "renderer";
    origin = "https://motregen.nl";
    secretsFile = "/var/lib/motregen-renderer/secrets.env";
  };
}
```

Na activering start ook daar `sudo systemctl start motregen-bot.service` de renderer. Alleen
`renderer` en `combined` krijgen Chromium en ffmpeg; de renderer heeft 400% CPU als bovengrens.
`MOTREGEN_REGISTER_PATH` kiest voor offline proeven een lokaal register als pollerbron;
in productie blijft deze variabele weg zodat de poller de cachechat leest.

### Proef zonder Telegram

`--dry-run-prime=<pad>` rendert de volledige matrix, primet via een lokale mock van de upload-API,
schrijft atomair het register, controleert de documentpublicatie en laat de echte pollerhandlers
met een gelezen file_id antwoorden. Hij leest geen updates en maakt geen Telegram-verzoeken.
De fake ids staan uitsluitend in het expliciete proefregister, niet in productie-file_id-sidecars.
Gebruik een eigen cachemap en de hostbrede perf-lock:

```bash
mkdir -p tmp/u67
curl -fsS http://127.0.0.1:4330/data/manifest.json -o tmp/u67/manifest.json
flock ~/motregen-perf.lock bash -c '
  TG_BOT_KEY=x MOTREGEN_BOT_ROLE=combined MOTREGEN_ORIGIN=http://127.0.0.1:4330 \
  MOTREGEN_CHROMIUM_PATH=/nix/store/j8hc3kdypr2gaa2w3dq0a370lwfzbasf-chromium-151.0.7922.137/bin/chromium \
  MOTREGEN_RENDER_CACHE=../tmp/u67/cold-cache \
  pnpm -C bot render --manifest=../tmp/u67/manifest.json --dry-run-prime=../tmp/u67/register.json
'
```

Koude U67-proef op ageq-dev2 (2026-10-08, generatie `13:32:34Z`, app op 4330): **173 media in
65535 ms**, plus **83 ms dry-run-prime** met mockuploads en uitgeschakelde tussenruimte. Alle drie
loops hebben 169 frames op 10 fps; Regen render/encode 55164/794 ms, Temperatuur 60512/999 ms,
Wind 55307/1001 ms. Register gelezen en file_id-antwoord gecontroleerd. Geen echte uploadtijd gemeten.
De warme herhaling met een niet-bestaand Chromium-pad leverde 173 cachehits in 253 ms, plus 77 ms
dry-run-prime, zonder browserstart.

## Rendering en cache

De rendererrol (of de gecombineerde lokale rol) gebruikt voor Regen standaard de native route
van MIP-26, hieronder beschreven. Temperatuur en Wind draaien met Chromium uit
`pkgs.playwright-driver.browsers` en ffmpeg uit nixpkgs. Per browsermodus opent hij één
pagina van de echte app op `?modus=...&t=<ISO>&still=1`, zonder bediening,
locatiepin, service worker of manifestpolling. De renderhook zet de tijd per
frame en wacht expliciet op de actieve weerlagen. Ontbrekende data levert geen
gecachete lege kaart. De nationale uitsnede is 640×848 CSS-pixels met
`deviceScaleFactor: 1.5`: PNG-frames, JPEG-stills en MP4 zijn 960×1272.

| modus | framereeks | loop | stills uit dezelfde reeks |
| --- | --- | --- | --- |
| Regen | −1…+2 u elke 5 minuten; daarnaast stills elke 10 minuten van −2 u tot +12 u | 37 frames op 10 fps | 19 loopframes −1…+2 u; 66 aparte frames (85 stills) |
| Temperatuur | −2…+12 u, elke 5 minuten (interpolatie tussen de uurvelden) | 169 frames op 10 fps | 85 frames, −2…+12 u elke 10 minuten |
| Wind | −2…+12 u, elke 5 minuten (interpolatie tussen de uur- en kwartiervelden) | 169 frames op 10 fps | geen |

De drie loops gebruiken dezelfde vijfminutenstap en 10 fps (U66). Regen loopt van −1 tot +2 uur (PO 2026-10-09;
U70 had −2…+3) en duurt 4,7 seconden inclusief de eindhold; temperatuur en wind beginnen twee uur geleden.
Temperatuur en Wind eindigen op +12 uur en duren 17,9 seconden inclusief de eindhold.
Stills en deltaknoppen behouden het bereik −2…+12 uur op het tienminutenraster. Binnen de loophorizon
delen stills dezelfde renderpass; zes eerdere en zestig latere regenstills krijgen elk één extra frame.
Regen rendert 103 frames en bewaart alleen de 85 stilltijdstippen als rauwe PPM. De browserfallback
bewaart 103 PNGs. Temperatuur en Wind behouden hun PNG-reeksen.

Windparticles krijgen een vaste simulatieklok, met tussenstappen op 30 Hz en
een seconde opwarming voor het eerste frame. Wandkloktijd en screenshots
drijven de simulatie niet aan. FFmpeg maakt een geluidloze H.264-MP4 met
`yuv420p`, `faststart` en een seconde eindhold. CRF 25 is de eerste keuze;
een bitratefallback begrenst te grote video's tot maximaal 3 MB. Native JPEGs komen met libvips (kwaliteit 95, 4:4:4) uit de betreffende PPM-frames;
browser-JPEGs komen met ffmpeg `-q:v 3` uit de PNG-frames. Frames voor regenstills buiten −1…+2 uur
staan achter de loopframes in dezelfde reeks en komen niet in de MP4. De framereeks blijft in `<loop-key>.frames` twee uur
op schijf. Alleen aangevraagde JPEGs worden gemaakt; gelijke aanvragen delen
die conversie. Frames en receipts zijn privé en worden niet door Caddy geserveerd.

Op het beeld staat bovenaan dezelfde klokmarkup en typografie als op
motregen.nl, in Amsterdamtijd, met de dag ernaast en het moduswoord klein eronder.
Een dun streepje in de Regen-klok wisselt van
grijs bij historie naar de accentkleur bij verwachting. Linksonder staat
“KNMI · © OpenStreetMap”. Het bijschrift is alleen een HTML-link
`motregen.nl` met tijdpreset; tijd, modus en attributie staan in het beeld.

De manifest-fetch is per reeks vastgezet op de gekozen generatie, terwijl
Chromiums HTTP-cache voor tiles en chunks actief blijft. De cachekey bevat
renderer-versie, modus, tijdstap, absolute tijd en manifest-`generated`.
Bestanden worden atomair gepubliceerd; een receipt verschijnt pas nadat de
hele reeks compleet is. De drie modusreeksen delen één Chromium;
gelijke verzoeken delen een renderpass. In de gecombineerde modus worden per generatie 3 loops en 10 JPEGs
vooraf klaargezet: nu/−10m/+10m/−1u/+1u per niet-Wind-modus. Alleen deze **13 media**
worden vooraf naar Telegram geüpload. De overige tienminutenposities blijven
beschikbaar als PPM (Regen) of PNG (Temperatuur) in dezelfde reeks; JPEG en eenmalige upload volgen bij aanvraag.
Daarna gebruikt ook die selectie file_id. De aparte rendererrol maakt en primet alle 173 selecties.
Het eerdere doel voor render+prime van de 13 prewarm-media is <90 seconden;
de gemeten tijden staan in het track-LOG.
Rekenlast vóór U66: een generatie kostte op de dev-host ongeveer 4 cores × 60 seconden
(13 media in software-GL; inclusief Telegram-prime).
Tussen twee generaties staat de Chromium-boom van de bot op 0 % CPU (gemeten via /proc over 20 s,
orkestrator 2026-10-07); de pagina sluit ook bij een fout (`finally` in `bot/render.ts`). Een hoog
gemiddelde komt dus van het rendervolume zelf: de cadans van de generaties is de knop, niet een lek.
Metingen op dezelfde host (rig, prof:capture) zijn tijdens een generatie onbetrouwbaar.
Een tijdelijke netwerkfout of HTTP 5xx bij een weerchunk krijgt tijdens rendering
één herpoging met dezelfde Range. Een blijvende fout publiceert geen nieuwe matrix.
De open-fase heeft maximaal twee pogingen met hetzelfde manifest, met vijf seconden
backoff. Navigatie, still-ready en map-loaded delen per poging een budget van
90 seconden. Logs bevatten de poging, stap en gemeten open-/pogingstijd; de
open-tijd inclusief eventuele backoff staat ook in de renderreceipt.
De bot publiceert de nieuwe matrix pas als alle modi gerenderd zijn en, bij een
geconfigureerde cachechat, hun Telegram-ids bekend zijn; de oude
generatie blijft beschikbaar tijdens verversing. Cache-hits en inline
antwoorden wachten niet achter nieuwe Chromium-renders. De bot meet per modus
frames, render- en encodetijd en bytes, en de hele matrix in milliseconden.
De manifestcheck loopt elke 15 seconden na voltooiing van een matrix.

De broncadans van radar en nowcast is vijf minuten (`cadenceMs` in `web/src/core/freshness.ts`).
De ingest controleert elke 60 seconden (`radar_cadence` in `crates/ingest/src/main.rs`), maar publiceert
alleen bij gewijzigde bronbestanden; verschillende bronnen kunnen kort na elkaar een manifest publiceren.
Het budget per generatie is daarom maximaal 210 seconden: 30% marge onder de nominale broncadans van
300 seconden. De 15-seconden-manifestcheck en Telegram-prime moeten ook binnen die marge passen.
De U66-rendererproef hieronder meet alleen de drie loops en tien prewarm-JPEGs, zonder Telegram; de werkelijke
prime-/uploadduur blijft zichtbaar in `media-generation-primed` en `stills-refresh` van de actieve bot.

Voor een vergelijkbare vóór/ná-meting in `bot/`: sla één manifest op en gebruik per meting een lege
cachemap. `--prewarm` rendert dezelfde 13 media parallel als de actieve bot; `--manifest` zet hun
generatie vast. De afsluitende `generation-render-receipt` geeft de totale renderduur, naast de
frameaantallen, render-/encodetijd en bytes per modus:

```bash
curl -fsS http://127.0.0.1:4330/data/manifest.json -o ../tmp/u66-manifest.json
TG_BOT_KEY=x MOTREGEN_ORIGIN=http://127.0.0.1:4330 \
  MOTREGEN_RENDER_CACHE=../tmp/u66-render \
  pnpm render --prewarm --manifest=../tmp/u66-manifest.json
```

Gemeten op de dev-host op 2026-10-08, met dezelfde generatie `08:37:54Z`, dezelfde app op 4330,
lege caches en drie parallelle modi. Render-ms omvat openen en alle PNGs; encode-ms betreft de MP4.
Vóór → ná U66:

| modus | loopframes | PNGs | fps | render-ms | encode-ms | MP4-bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Regen | 49 → 169 | 109 → 169 | 10 → 10 | 33348 → 54914 | 441 → 877 | 1214393 → 2199369 |
| Temperatuur | 73 → 169 | 85 → 169 | 10 → 10 | 34257 → 63381 | 510 → 811 | 1289173 → 2637842 |
| Wind | 49 → 169 | 49 → 169 | 4 → 10 | 20070 → 55096 | 426 → 1043 | 1625285 → 2923484 |

De totale rendergeneratie van 13 media kostte **34999 → 64413 ms**, inclusief de tien JPEG-conversies.
Met de 15-seconden-manifestcheck resteert **130587 ms** binnen het 210-secondenbudget voor Telegram-prime.
De Telegram-upload is in deze render-only meting niet uitgevoerd. Alle loops blijven onder 3 MB; de
langste horizon en 10 fps passen daarmee in het renderbudget. Hostbelasting beïnvloedt deze eenmalige
metingen; dit zijn geen geïsoleerde CPU-benchmarks. Exacte repro en receipts staan in het U66-track-LOG.

U70 is op 2026-10-09 tegen `https://motregen.nl` gemeten met één vastgepind manifest
(`generated=2026-10-09T12:08:02Z`, `now=12:05Z`). Twee koude volledige matrices zijn direct achter
elkaar onder de hostbrede perf-lock gerenderd. Render-ms omvat ook de PNGs voor latere stills:

| modus | loopframes | PNGs | fps | render-ms | encode-ms | MP4-bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Regen | 169 → 61 | 169 → 115 | 10 → 10 | 56334 → 31701 | 1236 → 552 | 2882649 → 1206270 |
| Temperatuur | 169 → 169 | 169 → 169 | 10 → 10 | 65581 → 57549 | 1884 → 2116 | 2189211 → 2229636 |
| Wind | 169 → 169 | 169 → 169 | 10 → 10 | 56363 → 44020 | 2522 → 2272 | 2157700 → 2205536 |

De 173-media-rendergeneratie kostte **71301 → 63590 ms**; dry-run-prime met mockuploads en zonder
tussenruimte kostte **84 → 78 ms**, samen **71385 → 63668 ms**. De complete matrix en het
file_id-antwoord via het register zijn gecontroleerd. Met de 15-seconden-manifestcheck blijft
**131410 ms** binnen het 210-secondenbudget beschikbaar voor echte Telegram-prime. Die uploadtijd
is niet gemeten. In deze U70-meting duurde Regen 7,1 s inclusief eindhold (−2…+3 u);
de overige loops 17,9 s en alle MP4s bleven <3 MB. De huidige regenloop is daarna verkort naar 37 frames.

Een eerdere koude vergelijking gaf 69658 → 97692 ms inclusief mockprime, terwijl de hostbelasting
van circa 12 naar 27 steeg en ook de ongewijzigde modi fors vertraagden. Daarom is de vergelijking
herhaald; ook de bovenstaande tijden zijn metingen op een gedeelde host, geen geïsoleerde benchmark.
Temperatuur en Wind hebben dezelfde frameplannen als vóór U70; hun tijd- en byteverschillen zijn
meetvariatie. Gebruik voor de volledige rendererrol `--dry-run-prime`, met een eigen lege cachemap:

```bash
mkdir -p tmp/u70
curl -fsS https://motregen.nl/data/manifest.json -o tmp/u70/manifest.json
flock ~/motregen-perf.lock bash -c '
  TG_BOT_KEY=x MOTREGEN_BOT_ROLE=combined MOTREGEN_ORIGIN=https://motregen.nl \
  MOTREGEN_CHROMIUM_PATH=/nix/store/j8hc3kdypr2gaa2w3dq0a370lwfzbasf-chromium-151.0.7922.137/bin/chromium \
  MOTREGEN_RENDER_CACHE=../tmp/u70/cold-cache \
  pnpm -C bot render --manifest=../tmp/u70/manifest.json --dry-run-prime=../tmp/u70/register.json
'
```

In de gecombineerde modus serveert Caddy uitsluitend `/telegram/stills/*.jpg` en `*.mp4` met twee uur
cacheduur en `noindex`; sidecars en receipts geven 404. Cachebestanden ouder
dan twee uur, inclusief PNG-directories, verdwijnen bij een manifestcheck, ook als het renderen van een
nieuwe matrix mislukt.

Met `MOTREGEN_CACHE_CHAT_ID` uploadt de bot vóór publicatie de ontbrekende JPEGs in albums van maximaal tien
via `sendMediaGroup` en MP4s via `sendAnimation` naar `MOTREGEN_CACHE_CHAT_ID`.
Dat zijn maximaal tien prewarm-JPEGs in de gecombineerde modus en 170 JPEGs in de rendererrol.
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
De sidecar bevat renderkey en botscope (botnaam in combined, bot-id in renderer): een nieuwe manifestgeneratie, andere
selectie of andere bot kan geen oud id hergebruiken. Ids vervallen met de
twee-uurs-mediacache; sidecars worden ook opgeruimd.
Een specifiek `wrong file identifier`, `wrong remote file identifier` of
`file not found` op een bestaand id wist dat id en doet één her-upload. De
verzending/edit wordt eenmaal herhaald met het nieuwe id; geheugen en sidecar
worden vervangen. Bij een cachechat gaat de her-upload daarheen, ook voor inline.
In luie modus gaat een chat-her-upload rechtstreeks naar de gebruiker; inline
kan bij een ontbrekend id de publieke URL gebruiken. Als het herstel ook faalt,
krijgt de gebruiker “Beeld kon niet laden, probeer opnieuw”, geen API-fouttekst.

De poller gebruikt altijd de ids uit het register. De onderstaande sidecars, herupload en publieke
URL-fallback horen bij de gecombineerde modus en het renderen/primen, niet bij de poller.

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

## Beeldmaat

Stills en loops zijn staand, 960×1272 (`FRAME` in `bot/config.ts`). Een liggende proef (1280×800 met de klok
in een paneel naast de kaart) is door de PO afgewezen (2026-10-08) en weer verwijderd. De klok in het beeld
is een maat groter dan in de app. Bij het uploaden van een loop geeft de bot `width`, `height` en
`duration` expliciet mee en zet ffmpeg vierkante pixels (`setsar=1`), naast yuv420p en faststart:
de PO zag de mp4 kleiner in de bubbel dan een foto van dezelfde maat. Of dat het verhelpt is nog niet op
een echt bericht bevestigd; Telegram-clients kunnen animaties ook uit zichzelf kleiner tonen dan foto's.
`web/scripts/still-shot.ts` rendert het still-beeld om zelf te bekijken;
`TG_BOT_KEY=x pnpm render --mode=weather` (in `bot/`) maakt een echte loop zonder Telegram aan te raken.

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

Alleen renderen (drie loops en twee nu-stills; `--matrix` geeft alle 170
stills; `--mode=weather|feels|wind` beperkt tot één modus):

```sh
MOTREGEN_ORIGIN=http://localhost:4365 MOTREGEN_RENDER_CACHE=tmp/telegram-smoke \
  web/scripts/e2e-slot.sh node --env-file=.env bot/dist/bot/smoke.js --render-only
```

Voor de Telegram-rooktest stuurt de PO eerst `/start` in een privéchat aan de
bot; de test leest dat chat-id uitsluitend in het geheugen. Een expliciet
`MOTREGEN_SMOKE_CHAT_ID` kan ook. De test rendert en uploadt eerst de volledige
13-media-matrix naar de geconfigureerde cachechat. Vervolgens verstuurt hij uitleg en
een regenfoto en ververst hetzelfde bericht naar
Temperatuur +10m met het vooraf verkregen file_id. Daarna gaat hij terug naar Regen en
opnieuw naar Temperatuur. Hij rapporteert berichtnummer, manifestversie en beide
cached edit-responstijden; de eerste edit moet al fileIdCached=true zijn.
Temperatuur +20m controleert vervolgens het luie pad: JPEG uit bestaande PNG, één
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

### Native regenrenderer (MIP-26, U71a)

`weather` kiest standaard native; `MOTREGEN_RAIN_RENDERER=playwright` kiest de bestaande
browserroute. De routes hebben afzonderlijke cacheversies. Temperatuur en Wind blijven
Playwright. Rollen en register zijn gelijk gebleven.

De gedeelde MRF-validatie, predictieve decoder, tijdlijn, regenpalet en motion-selectie komen uit
`web/src/core`. Node gebruikt native Zstandard-decompressie. Eén kleine Rust-worker per regenreeks
projecteert de rasters bilineair, met dezelfde motion-warp en canvasblending als de app. Het
palet, de projectiecoördinaten en motioncaps komen uit de gedeelde TypeScript-code; de scalar
TypeScript-compositor is de onafhankelijke testreferentie. De worker verwerkt twee beeldhelften
parallel en houdt de twee actieve rasters vast. `pnpm -C bot build` bouwt de worker met `rustc`;
het Nix-package bevat de executable. In de devomgeving wordt hij eenmalig per bronhash in de
lokale tijdelijke map gebouwd.

Een kaartplaat plus atlas van temperatuurcijfers wordt **één keer per stijl/archief/rooster/maat/thema**
met Chromium gemaakt. De twee thema's volgen de zon bij De Bilt op de kaarttijd, ook in de
browser-stillroute. Het archief moet een inhoudshash hebben. De atlas bevat 111 varianten
(−50…60 °C); de gedeelde labelselectie en temperatuursampling kiezen per frame de cijfers.
De klokachtergrond, attributie en 10094 letterbeelden worden eenmalig per CSS-bundel/maat gecachet.
Elke weekdag heeft een eigen atlas, zodat de gecentreerde klok dezelfde subpixelpositie als de app heeft.
Alleen de benodigde dagen worden in geheugen geladen. Zo blijven de echte appfonts behouden.
Op ageq-dev2 kostte het maken van een kaartatlas ongeveer
16–21 s per thema en de klokatlas ongeveer 9 s, zonder CPU-beperking. Nieuwe weerdata maakt
geen nieuwe atlas. Deze bestanden blijven bij cache-pruning behouden; een nieuwe sleutel maakt
nieuwe assets. Een warme regenreeks werkt ook met een niet-bestaand Chromium-pad.

De 37 RGB-loopframes gaan met backpressure rechtstreeks naar één ffmpeg-proces, zonder PNG-pass.
De native encoder gebruikt CRF 25, preset `ultrafast`, één encoderthread op twee kernen en een
begrensde bitrate; de MP4 is 960×1272, 10 fps en 4,7 s inclusief eindhold.
Alleen de 85 stillframes blijven als P6/PPM in de privé-cache; hun JPEG-conversie gebruikt libvips.
De korte native loop krijgt voorrang op de browserloops, zodat SwiftShader hem op twee kernen
niet verdringt. `native-loop-profile` meet het framewerk en de loop inclusief encoder;
`native-still-frame` meet elk stillframe; `still-encoded` meet elke JPEG-conversie. Een
sequence-receipt bewaart `preparationMs`, `loopMs` en `loopRenderMs`. De voorbereiding omvat
assetinlezing, workerstart en het vooraf laden/decoderen van alle benodigde chunks voor de hele reeks.
`loopMs` begint daarna, bij het eerste RGB-frame. `renderMs` omvat alle 103 regenframes en
voorbereiding; `encodeMs` is de resterende encoderwachttijd, omdat render en encode overlappen.

#### Beeldpariteit

De pinned generatie `2026-10-09T12:18:21Z` is vergeleken op historie, −2 uur buiten de loop, nu, verwachting en nacht.
De browserreferentie gebruikte een lokale build van dezelfde branch, zodat de nieuwe
kaarttijdthema's meedoen. Beide routes lezen de prod-chunks uit hetzelfde manifest.
De gemiddelde kaart-ΔE76 ligt tussen 0,024 en 0,165; maximaal 1,63. Over het hele beeld is
het gemiddelde 0,022–0,197 en maximaal 16,12. De grootste verschillen zitten bij de vervaagde
klokachtergrond. De test begrenst kaartgemiddelde/max op 0,35/8 en het volledige beeld op 0,5/20.
De kaartregio is y=130…1196; klok en attributie tellen volledig mee in het totaalcijfer.

Beelden staan naast elkaar met **browser links, native rechts**:
[historie](../.dev/tracks/u71a-native-regenloop/parity/historie-naast-elkaar.png),
[−2 uur](../.dev/tracks/u71a-native-regenloop/parity/voor-loop-naast-elkaar.png),
[nu](../.dev/tracks/u71a-native-regenloop/parity/nu-naast-elkaar.png),
[verwachting](../.dev/tracks/u71a-native-regenloop/parity/verwachting-naast-elkaar.png) en
[nacht](../.dev/tracks/u71a-native-regenloop/parity/nacht-naast-elkaar.png).
De waarden en drempels staan in [parity.json](../.dev/tracks/u71a-native-regenloop/parity/parity.json).
De PO beoordeelt deze beelden op de PR.

```bash
pnpm -C web exec vite build --outDir ../tmp/u71a-web-dist
MOTREGEN_DATA_ORIGIN=https://motregen.nl/data \
  pnpm -C web exec vite preview --outDir ../tmp/u71a-web-dist --host 127.0.0.1 --port 4361
# In een tweede shell:
MOTREGEN_ORIGIN=https://motregen.nl MOTREGEN_PARITY_ORIGIN=http://127.0.0.1:4361 \
MOTREGEN_RENDER_CACHE=../tmp/u71a-parity \
MOTREGEN_CHROMIUM_PATH=/nix/store/j8hc3kdypr2gaa2w3dq0a370lwfzbasf-chromium-151.0.7922.137/bin/chromium \
  web/scripts/e2e-slot.sh pnpm -C bot parity \
  ../.dev/tracks/u71a-native-regenloop/manifest-initial.json ../tmp/u71a-parity-beelden
```

#### Vóór/ná op ageq-dev2

Alle runs maken 173 media met hetzelfde pinned manifest, 37 regenloopframes en een lege mediacache. De native
kaart-/klokassets zijn warm. De meting gebruikt de hostbrede perf-lock en een eigen systemd
user-scope: `cpu.stat` omvat Node, Rust, Chromium en ffmpeg; `memory.peak` omvat ook de filecache.
De twee-kernscope gebruikt werkelijk `taskset` op CPU 0,1 en MemoryHigh/MemoryMax van
2200/2600 MiB. `AllowedCPUs` alleen werkt op deze user-cgroup niet, omdat `cpuset` ontbreekt.
De host zelf is gedeeld; dit zijn renderreceipts, geen uploadmetingen.

| CPU | Regenroute | 173 media | CPU-tijd | Cgroup-geheugenpiek |
| --- | --- | ---: | ---: | ---: |
| 2 kernen | Playwright | 169,003 s | 313,758 s | 2,303 GB |
| 2 kernen | Native | 164,349 s | 304,199 s | 2,310 GB |
| Onbeperkt | Playwright | 65,353 s | 673,886 s | 2,535 GB |
| Onbeperkt | Native | 60,564 s | 567,701 s | 3,274 GB |

Op twee kernen kost de native regenloop **1,249 s**, waarvan **1,104 s framewerk**.
Met **0,573 s voorbereiding** is de film na **1,822 s** gecodeerd. De complete
103-frame-regenreeks kost 9,273 s render/voorbereiding plus 0,151 s resterende encoderwachttijd,
tegenover 84,101/0,896 s in de browserroute. De native MP4 is 2,08 MB.
De native stillframes kosten onder gelijktijdige browserlast gemiddeld 97 ms (mediaan 67, max 486);
de JPEG-conversie gemiddeld 32 ms (mediaan 27, max 103), tegenover gemiddeld 79 ms voor de
browser-JPEGs. De stillkosten staan ook per tijdstip in het meetbestand.

De laatste volledige generatie heeft **15,651 s marge onder drie minuten**.
De eerste volledige generatie kostte 156,519 s; een herhaling bij lagere hostbelasting 171,269 s.
Een run bij hoge belasting (host-load 44) kostte 198,351 s op twee kernen en 97,236 s onbeperkt.
Die overschrijding blijft in de meetgegevens staan. Temperatuur en Wind bepalen het resterende
werk; onder concurrerende hostbelasting is de grens van drie minuten nog geen betrouwbare garantie.
De dataset, per-loopcijfers en stillsamenvattingen staan in
[measurements.json](../.dev/tracks/u71a-native-regenloop/measurements.json).
Exacte meetcommando's staan in [measure.sh](../.dev/tracks/u71a-native-regenloop/measure.sh):

```bash
flock ~/motregen-perf.lock systemd-run --user --scope --unit=u71a-eigen-meting \
  -p MemoryAccounting=yes -p MemoryHigh=2200M -p MemoryMax=2600M \
  bash .dev/tracks/u71a-native-regenloop/measure.sh eigen-meting native matrix eigen-cache 2
```

Kopieer voor een warme assetmeting alleen de `basemap-*` en `overlay-*` bestanden naar de
lege cachemap, geen media of receipts. Kies `playwright` voor de vóórmeting en `all` als
laatste argument voor de onbeperkte meting (laat dan de geheugenlimieten weg). De meegeleverde
manifest-URL's moeten nog beschikbaar zijn; neem een actueel manifest als ingest oude chunks
heeft opgeruimd. De meethelper gebruikt `pnpm render` met een dummy token en raakt Telegram niet.
