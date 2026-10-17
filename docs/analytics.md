# Gebruiksmeting (MIP-13 en MIP-35)

motregen telt bezoeken en featuregebruik zonder analyticsproduct, cookies of
identifiers. Er staat nooit een IP-adres, header of user-agent op schijf. Het
besluit staat in `.dev/proposals/0013-anonieme-gebruiksmeting.md`; dit document
beschrijft wat er precies wordt opgeslagen, hoe lang, en waar het rapport staat.

## Wat de client stuurt

- **Sessie**: het eerste `/data/manifest.json` van een pagina-leven krijgt `?s=1`.
  Caddy antwoordt daarop met `Cache-Control: no-store`, zodat Cloudflare (dat
  `/data/*` cachet) elk sessieverzoek doorzet naar de origin. Zonder die header
  zou de edge-cache sessies onder één cachevenster samenvoegen.
- **Baken**: hooguit één `POST /hit` per pagina-leven, via `navigator.sendBeacon`
  bij het verbergen of sluiten van de tab. De body is JSON met uitsluitend deze
  velden (`web/src/core/usage.ts`, `USAGE_FIELDS`):

| veld | waarden | betekenis |
| --- | --- | --- |
| `v` | `3` | contractversie; het rapport accepteert v2 én v3 |
| `pinFeel` | `true` of afwezig | modus gevoel vastgezet |
| `pinWind` | `true` of afwezig | modus wind vastgezet |
| `pinAir` | `true` of afwezig | modus lucht vastgezet |
| `hover` | `true` of afwezig | isolijnfocus via hover op de kolom Gevoel |
| `search` | `true` of afwezig | zoekresultaat gekozen |
| `geo` | `true` of afwezig | geolocatie gelukt (nooit de plaats) |
| `fav` | `true` of afwezig | favoriet opgeslagen |
| `pin` | `true` of afwezig | pin verplaatst |
| `play` | `true` of afwezig | afspelen gestart |
| `scrub` | `true` of afwezig | tijd gescrubd |
| `clockScrub` | `true` of afwezig | tijd verzet via de klok: pil gesleept, toetsen op de pil of tik in de bronstrook (zet ook `scrub`) |
| `history` | `true` of afwezig | historie in de tabel geopend |
| `fresh` | `true` of afwezig | versheidspaneel geopend |
| `about` | `true` of afwezig | About geopend |
| `share` | `true` of afwezig | deel-link gedeeld of naar het klembord gekopieerd |
| `tg` | `true` of afwezig | Telegram-webview: `window.Telegram.WebApp.initData` is niet leeg; de inhoud zelf gaat nooit mee |
| `range` | `"3"`, `"8"`, `"24"`, `"all"`, `null` | laatst gekozen bereik; `null` = knop niet gebruikt |
| `theme` | `"light"`, `"system"`, `"dark"` | thema |
| `unit` | `"bft"`, `"kn"`, `"kmh"`, `"ms"` | windeenheid (U36; ontbreekt in bakens van vóór 2026-09-25) |
| `coarse` | `true`, `false` | aanwijsapparaat is grof (touch) |
| `width` | `"<430"`, `"<960"`, `">=960"` | breedteklasse in CSS-pixels |
| `dur` | `"<1"`, `"1-5"`, `"5-30"`, `">30"` | sessieduur in minuten, gebakken |

Er zitten geen tijdstempels, coördinaten, plaatsnamen, IDs of browsergegevens in.
Een nieuw veld vraagt een aanpassing hier, in `USAGE_FIELDS`, in
`nix/usage/contract.jq` en zo nodig in de About-tekst; een veld dat iets over de
persoon zegt, vraagt een nieuwe MIP.

## Wat de server opslaat

Caddy beantwoordt `POST /hit` met `204` als de `Content-Length` ten hoogste
1024 bytes is; anders `413`, en elke andere methode krijgt `405`. Die afwijzingen
worden niet gelogd. Alle overige verzoeken, inclusief manifestverzoeken zonder
`?s=1`, worden ook niet gelogd. Het gewone Caddy-access-log staat uit.

Een logregel bevat uitsluitend deze velden:

```json
{"level":"info","ts":"2026-09-25T14:28+02:00","logger":"http.log.access.usage","msg":"handled request","uri":"/hit","hit":"{\"v\":2,\"search\":true,\"range\":null,\"theme\":\"dark\",\"unit\":\"bft\",\"coarse\":false,\"width\":\">=960\",\"dur\":\"1-5\"}"}
{"level":"info","ts":"2026-09-25T14:31+02:00","logger":"http.log.access.usage","msg":"handled request","uri":"/data/manifest.json"}
```

- `ts` is lokale tijd op de minuut afgekapt;
- `uri` is alleen het pad, zonder querystring;
- `hit` is de ontvangen body als tekst; alleen `/hit`-regels hebben dit veld.

Het volledige Caddy-`request`-object (met `remote_ip`, `client_ip`, headers,
`CF-Connecting-IP` en user-agent) wordt in de logconfig als geheel verwijderd,
evenals status, duur en groottes. De NixOS-test
(`nix/tests/motregen.nix`) stuurt een baken met een nep-IP en -user-agent en
controleert dat de regel alleen de velden hierboven bevat.

Ook de algemene Caddy-foutlogger verwijdert het volledige request-object.
Ook bij afhandelingsfouten mogen geen IP-adres of headers in het systemd-journal
belanden; de foutoorzaak blijft zichtbaar.

## Bewaartermijnen en locatie

| wat | waar (prod) | hoe lang |
| --- | --- | --- |
| ruwe regels | `/var/lib/motregen-usage/usage/YYYY-MM-DD.jsonl` | 30 dagen, daarna verwijderd door de rapporttimer |
| dagaggregaat | `/var/lib/motregen-usage/stats/YYYY-MM-DD.json` | blijvend (alleen tellingen) |
| rapport | `/var/lib/motregen-usage/stats/stats.html` | elke nacht opnieuw gemaakt |
| Telegram-dagtellingen | `/var/lib/motregen-usage/telegram/YYYY-MM-DD.json` | blijvend (alleen tellingen) |
| kanaalstand | `/var/lib/motregen-usage/report/YYYY-MM-DD-channel.json` | blijvend (alleen dag en ledental) |

De map staat naast `/var/lib/motregen` en niet erin: de ingestservice gebruikt
`DynamicUser` met `StateDirectory=motregen`, en systemd zet dan het eigendom van
die hele boom recursief op de dynamische gebruiker.

Caddy schrijft de regels naar de unixsocket `/run/motregen-usage.sock`. Een
socket-geactiveerde collector (`motregen-usage@.service`, gebruiker
`motregen-usage`) schrijft elke regel in het bestand van de lokale kalenderdag.
Omdat systemd de socket vasthoudt, gaan er geen regels verloren bij een herstart
van Caddy of de collector.

## Rapport

`motregen-usage-report.timer` draait dagelijks om 04:00 (ingehaald na een
reboot). Voor elke afgeronde dag met ruwe regels zonder actueel aggregaat maakt
het `stats/YYYY-MM-DD.json`; daarna verwijdert het ruwe dagen ouder dan 30 dagen
en bouwt het `stats.html`: een overzicht over de laatste 30 dagen en een tabel
per dag.

- **sessies** is het aantal manifestverzoeken met `?s=1`;
- **bakens** is het aantal geldige `v: 2`- en `v: 3`-bodies; **afgewezen** telt `/hit`-regels
  die geen geldige JSON waren of een andere versie hadden;
- elk percentage is een aandeel van de **bakens**, omdat alleen een baken iets
  over featuregebruik zegt. `sendBeacon` gaat vooral op mobiel niet altijd weg;
  bakens/sessies is dus de dekkingsgraad.

Het aggregaat heeft deze vorm (`nix/usage/day.jq`):

```json
{"day":"2026-09-24","sessions":5,"beacons":4,"rejected":3,
 "features":{"search":{"n":2,"pct":50}, "…": "…"},
 "dimensions":{"range":{"3":{"n":0,"pct":0},"none":{"n":2,"pct":50}, "…": "…"}, "theme":{}, "unit":{}, "coarse":{}, "width":{}, "dur":{}}}
```

Handmatig opnieuw draaien: `ssh root@57.129.47.17 'systemctl start motregen-usage-report'`.

## Het rapport bekijken

`stats.html` staat bewust **niet op internet** (PO 2026-09-25: ook niet achter een
wachtwoord). De dagaggregaten en het rapport blijven op de productiehost. Een
nachtelijke kopie naar de dev-host is niet ingericht; het Telegram-dagrapport
vervangt die geplande kopie (MIP-35). Ad hoc bekijken:

```sh
ssh root@57.129.47.17 cat /var/lib/motregen-usage/stats/stats.html > /tmp/stats.html
```

## Telegram-tellingen

Alleen de botrol `poller` of `combined` telt ontvangen interacties. De renderer
telt niets. De lokale kalenderdag is altijd **Europe/Amsterdam**, ook bij een
zomer-/wintertijdwissel. Er komen geen gebruikers-id, chat-id, gebruikersnaam,
plaatsnaam, zoektekst of interactietijdstempel in het bestand of het journal.

`bot/usage-counts.ts` telt `commands` per hoofdcommando (`start`, `weer`,
`regen`, `temperatuur`, `wind`); `hitte` en `gevoel` tellen als
`temperatuur`, `regen_rich` als `regen`. Onbekende opdrachten en opdrachten
aan een andere bot tellen niet. Verder: `inline`, `timeButtons` (kaartcallbacks,
ook modusknoppen), `placeButtons` (plaatskeuze) en `chats.private`/
`chats.group` (interacties uit groep of supergroep). Inline zonder chatcontext
krijgt geen verzonnen chatsoort. We ontvangen geen gekozen-inline-resultaten en
zetten die updates niet aan.

Voor `users` krijgt elke dag één willekeurig zout van 32 bytes uit
`crypto.randomBytes`. Alleen de SHA-256-hashes van zout en gebruikers-id staan
in een set in geheugen. Het bestand bevat uitsluitend de grootte. Bij de
dagwissel verdwijnen zout en set. Na een herstart tellen gebeurtenissen door
vanaf het teruggelezen dagbestand; de hashes kunnen niet worden teruggelezen.
Dan wordt `usersLowerBound: true` opgeslagen en is `users` het maximum van de
oude telling en de nieuwe dagsset, **geen som** die dezelfde persoon opnieuw zou
tellen. Het dagrapport toont zo'n ondergrens met `≥`.

De bot schrijft bij starten, elke tien minuten, bij dagwissel en bij afsluiten
(waaronder SIGTERM) via tijdelijk bestand plus rename. Na een harde crash kan
maximaal het laatste interval verloren zijn. De ingest en Caddy krijgen geen
schrijfrechten: `telegram/` is `2750 motregen-bot:motregen-usage`, de bestanden
zijn `0640`; de rapportdienst kan alleen lezen. De bestaande `usage/`-rechten
blijven gelijk. `MOTREGEN_USAGE_DIR` kiest de map (Nix zet hem op de usage-root;
voor lokaal botwerk standaard `tmp/telegram-usage`).

Voorbeeld (alleen aggregaten, geen gebruikersgegevens):

```json
{"day":"2026-10-17","commands":{"weer":9,"regen":3,"wind":2},"inline":3,"timeButtons":11,"placeButtons":2,"chats":{"private":25,"group":5},"users":6,"usersLowerBound":true}
```

## Dagrapport naar de PO

`motregen-daily-report.timer` start om **08:00 Europe/Amsterdam** en haalt een
gemiste run na reboot in (`Persistent=true`). De dienst start na
`motregen-usage-report.service` (het bestaande 04:00-rapport), met dezelfde
gebruiker `motregen-usage`. Alleen `report/` is voor deze dienst schrijfbaar;
ruwe webregels, webaggregaten en Telegram-tellingen zijn alleen leesbaar.

De secretsfile van de bot bevat `TG_BOT_KEY`, `MOTREGEN_REPORT_CHAT_ID` (de
privéchat van de PO) en optioneel `CLOUDFLARE_ANALYTICS_TOKEN` (alleen
Zone Analytics: Read). De ontvanger en tokens worden niet gelogd. De Nix-optie
`services.motregen.dailyReport.cloudflareZone` bevat de zone-id; `enable`
schakelt de dienst in en `dryRun` laat alleen het bericht zien.

Het korte Nederlandse HTML-bericht bevat gisteren en de zeven **voorafgaande**
kalenderdagen. Sessies, bakens en Telegram-gebeurtenissen krijgen een gemiddelde
per beschikbare meetdag; bij minder dan zeven dagen staat de dekking erbij.
Touchverdeling en featurepercentages gebruiken de som van bakens uit die dagen
als noemer. De top drie features sluit `tg` uit: dat aandeel staat apart. Vóór v3
was Telegram-webview niet meetbaar en telt het veld als nul. Ontbrekende bestanden
worden nooit als nuldag ingevuld: bij een ontbrekend aggregaat van gisteren
staat er “meting stil sinds …”, met de laatste beschikbare dag of “onbekend”.
Een bestaand bestand met nul interacties is wel een geldige meetdag. Zolang de
vergelijkingsperiode vóór 2026-10-17 begint, staat er “filters sinds 2026-10-17”.

De kanaalstand van @motregen_updates wordt bij de rapportage opgehaald met
`getChatMemberCount` en als dag + ledental in `report/` bewaard. Het bericht
noemt daarom “kanaal nu”; het verschil gebruikt de vorige ochtendmeting (ontbreekt
die, dan is het verschil onbekend). De bestandsdatum volgt de gerapporteerde dag.
Een droogloop schrijft geen kanaalstand weg. Fouten tonen een vaste melding,
zonder API-antwoord of verzoekinhoud in het journal.

Lokaal, volledig zonder netwerk of echte Telegram-berichten:

```sh
node nix/fixtures/daily-report/generate.mjs tmp/u88-report
bash nix/usage/daily-report.sh --root tmp/u88-report --day 2026-10-17 --dry-run --offline
```

`--root` werkt ook op een kopie van `/var/lib/motregen-usage`. Zonder
`--offline` kan een droogloop actuele kanaal-/Cloudflare-totalen ophalen als
de tokens in de omgeving staan; `--dry-run` verstuurt nooit een bericht. Offline
kan de optionele genormaliseerde Cloudflare-fixture uit
`report/YYYY-MM-DD-cloudflare.json` worden gelezen; echte API-antwoorden worden
niet bewaard. De VM-test draait dezelfde dienst in droogloop tegen fixtures en
controleert getallen, timer en privacy-/schrijfrechten.

## Cloudflare als grove tweede meter

De site staat achter de Cloudflare-proxy. De zone-analytics in het dashboard
(**Analytics & Logs → Traffic**) tonen verzoeken, bandbreedte, landen en
"unique visitors" op basis van IP aan de edge. Dat kost niets extra en er gaat
niets extra naar Cloudflare. Het Web Analytics-script van Cloudflare gebruiken
we niet (MIP-13). De getallen verschillen van het eigen rapport: Cloudflare telt
alle verzoeken, ook bots en gecachte chunks; ons rapport telt sessies en bakens.

Het dagrapport vraagt optioneel `httpRequests1dGroups` op via de
[GraphQL Analytics API](https://developers.cloudflare.com/analytics/graphql-api/features/data-sets/):
unieke IP's, pageviews en het aandeel Franse verzoeken. Dit zijn **UTC-dagen**,
in tegenstelling tot de lokale web-/Telegram-dag. FR is vooral de dev-host;
de totalen zijn grof en **inclusief bots**. Zonder analytics-token vervalt de
regel; bij een API-fout blijft het eigen rapport doorgaan. Er komt geen
individueel IP-adres terug in deze query en we bewaren het API-antwoord niet.
