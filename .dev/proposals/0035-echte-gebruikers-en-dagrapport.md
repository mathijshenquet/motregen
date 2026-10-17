# MIP-35 — Echte gebruikers tellen, Telegram meten en een dagrapport

Status: accepted (PO 2026-10-17) · auteur: Claude (orkestrator), 2026-10-17

## 1. Het probleem

We weten niet hoeveel echte mensen motregen gebruiken. De meting van MIP-13 draait sinds 26 september op prod,
maar de sessieteller telt vooral onszelf. Telegram meten we helemaal niet. Niemand kijkt naar het rapport, want
het staat alleen op de server. Cloudflare toont ook bezoekersaantallen, maar daar zitten veel bots in, plus veel
verkeer uit Frankrijk.

## 2. Eerder werk en metingen

Analyse van de ruwe regels van 26 september tot 17 oktober (ruwe kopie buiten de repo; de cijfers staan hieronder):

1. **De sessies komen vooral van onszelf.** Tot 6 oktober waren het 6–19 sessies per dag, bijna allemaal met
   baken. Daarna werden het er 676, 527 en 415 op 7–9 oktober, en 310 op 16 oktober. Het aantal bakens bleef
   20–110. De oorzaak: de dev-previews proxyen `/data` naar `https://motregen.nl/data` (`web/vite.config.ts`,
   `dataProxy`), ook de `?s=1` waarmee een sessie begint. Het baken gaat naar Vite en komt dus nooit op prod.
   Elke paginalading door een worker, een rig of een schermbeeld telt zo als prod-sessie zonder baken. De pieken
   vallen in werkuren, tot 23 sessies per minuut. Die van 16 oktober 13:52–14:42 zijn mijn eigen voor/na-opnamen
   voor de changelog.
2. **Het "Franse" verkeer zijn wij.** Prod staat in Frankfurt (OVH, 57.129.47.17). De dev-host ageq-dev2 heeft
   publiek IP 5.39.65.53, OVH in Lille. Alle previews en rigs gaan via Cloudflare naar prod en tellen daar als
   Frans verkeer.
3. **Bakens zijn het betere signaal, maar bevatten ons ook.** Van de 374 v2-bakens zijn er 171 van een touch-
   apparaat; meestal 20–30 per dag, op 15 oktober 2. Dat zijn waarschijnlijk de echte gebruikers. 174 komen van
   desktop met een sessie korter dan een minuut (69 op 9 oktober, 39 op 16 oktober): dat lijkt op headless rigs.
4. **Featuregebruik:** door de tijd schuiven komt in 71 % van de touch-bakens voor; daarna lucht vastzetten en de
   pin. Zoeken, favorieten en delen: 0. Afspelen 2, geolocatie 3. Het veld `range` is altijd leeg, want de
   bereikknop bestaat niet meer.
5. **Ruis in het log.** Elke dag komen er 150–900 regels binnen met alleen een tijdstempel, zonder pad. Er zit
   niets persoonlijks in en het rapport negeert ze, maar ze horen er volgens `docs/analytics.md` niet te zijn.
   Een gewone pagina of het manifest zonder `?s=1`, rechtstreeks op de origin, maakt zo'n regel niet aan. De
   bron is nog onbekend.
6. **Telegram:** de bot schrijft technische events naar het journal (`still-edit`, `chat-still`, en dergelijke),
   maar geen tellingen per commando, inline-zoekopdracht of gebruiker. Mini App-opens via `/start` komen als gewone
   websessie binnen, niet herkenbaar als Telegram.
7. **Cloudflare:** het zoneplan is Free. Dat heeft geen botscore per verzoek, alleen totalen, landen en "uniques" per
   IP. Het API-token in `.env` mag geen analytics lezen (`zone.analytics.read` ontbreekt).
8. **Rapport:** `stats.html` wordt elke nacht gemaakt, maar alleen op prod. De kopie naar de dev-host (E5) is
   nooit ingericht. Ruwe regels verdwijnen na 30 dagen; de dagaggregaten blijven, maar scheiden ons niet van
   bezoekers.

## 3. Aanbeveling

### A. Ons en bots bij de bron weglaten

We slaan niets nieuws op; we tellen alleen minder mee.

1. **Dev telt niet mee:** de Vite-proxy haalt `s=1` uit de querystring voordat hij naar prod doorstuurt. Elke
   preview en rig op de dev-host verdwijnt daarmee uit de sessies.
2. **Geautomatiseerde browsers tellen niet mee:** de client stuurt geen `?s=1` en geen baken als
   `navigator.webdriver` waar is. Playwright en headless Chrome zetten dat, ook als een rig rechtstreeks op
   motregen.nl draait, zoals de changelog-opnamen.
3. **Crawlers tellen niet mee:** Caddy slaat de usage-regel over als de User-Agent op een botpatroon past
   (`bot|crawl|spider|slurp|preview|HeadlessChrome|Lighthouse`, en dergelijke). Caddy beslist dat tijdens het
   verzoek; de User-Agent komt nooit op schijf. De NixOS-test krijgt een geval met een bot-UA erbij.
4. De regels zonder pad (2.5) uitzoeken en dichtzetten.

### B. Telegram meten met hetzelfde privacycontract

1. De bot telt per dag, in geheugen, en schrijft alleen tellingen weg naar
   `/var/lib/motregen-usage/telegram/YYYY-MM-DD.json`:
   - commando's per naam (`weer`, `regen`, `wind`, …, `start`);
   - inline-zoekopdrachten en inline-resultaten die gekozen zijn;
   - tijdknoppen (callbacks), en plaatsknoppen;
   - soort chat: privé of groep.
2. **Unieke gebruikers:** per dag een willekeurig zout dat alleen in geheugen bestaat. De bot onthoudt
   `hash(zout, gebruikers-id)` in een set en schrijft om middernacht alleen de grootte weg. Daarna verdwijnen zout
   en set. Geen id komt op schijf of in het journal. Dit is tellen zonder op te slaan; het past in de geest van
   MIP-13, maar vraagt een expliciet ja (open vraag 1).
3. **Kanaal:** dagelijks `getChatMemberCount` van @motregen_updates.
4. **Mini App:** het baken krijgt een veld `tg: true` als de pagina in de Telegram-webview draait
   (`window.Telegram.WebApp`), zodat Mini App-gebruik apart zichtbaar is. Dat is een nieuw veld in
   `USAGE_FIELDS` (v3) en `docs/analytics.md`.

### C. Elke ochtend een dagrapport in Telegram

Na de rapporttimer (04:00) stuurt de bot om 08:00 één bericht naar de PO, met gisteren en de trend over 7 dagen:

```
motregen · do 16 okt

Web
  sessies 41 (7d gem. 28) ↑
  bakens 34 · touch 25 · desktop 9
  tijd verschoven 71 % · lucht vastgezet 12 % · pin 8 %
Telegram
  gebruikers 6 · commando's 14 (/weer 9, /regen 3, /wind 2)
  inline 3 · tijdknoppen 11
  kanaal 23 leden (+2)
```

De ontvanger komt in de secrets (`MOTREGEN_REPORT_CHAT_ID`). Werkt de pijplijn niet (geen nieuw aggregaat), dan
meldt het bericht dat in plaats van te zwijgen. Daarmee is E5 (de kopie naar de dev-host) niet meer nodig voor het
dagelijkse beeld. Het volledige `stats.html` blijft op prod.

### D. Cloudflare alleen als grove tweede meter

Op het Free-plan kunnen we bots daar niet uitfilteren. Hooguit één regel in het dagrapport ("Cloudflare: N
verzoeken, M unieke IP's, zonder FR"), ter vergelijking. Dat vraagt een token met **Zone Analytics: Read**.
Aanbeveling: eerst A–C, en Cloudflare pas toevoegen als de eigen cijfers stabiel zijn.

### Volgorde

A1 en A2 zijn klein en halen de grootste vervuiling weg; die doe ik zelf. A3, A4, B en C worden één track. De
uitrol volgt pas na jouw akkoord, net als altijd.

## 4. Open vragen

1. **Unieke Telegram-gebruikers** tellen met een dagzout dat alleen in geheugen bestaat (B2)? Of alleen
   gebeurtenissen tellen, zonder uniek?
2. **Ontvanger van het dagrapport:** jouw privéchat met de bot (je stuurt de bot één keer `/start`, dan lees ik
   het chat-id uit) of een privékanaal? En 08:00 lokale tijd goed?
3. **Mini App-veld** `tg` in het baken (B4): ja/nee?
4. **Cloudflare-regel** (D): nu, later, of niet? Voor "nu" moet jij een token met Zone Analytics: Read maken.
5. **Terugrekenen:** de bestaande aggregaten (7–16 oktober) laten zoals ze zijn, of de ruwe regels die er nog zijn
   (tot 30 dagen) opnieuw tellen met de touch/desktop-splitsing als "beste schatting"?

## 5. Besluit

PO, 2026-10-17: "laten we dev traffic eruit filteren als mogelijk, dat kan ook een nieuwe update zijn (zonder
changelog-item), maak maar wat zinnigs. Doe maar privéchat." Vraag 5: naar eigen inzicht. Vraag 4: de PO gaf het
bestaande Cloudflare-token alle rechten.

1. **A** komt er als losse uitrol zonder changelog-item. In plaats van `navigator.webdriver` in de client (dat zou
   de e2e-bakens breken) filtert Caddy headless browsers op de User-Agent, net als crawlers. A4 bleek de automatische
   http→https-server van Caddy: die neemt het usage-log over zonder de `log_skip`-regels. Een eigen http-site zonder
   logger lost het op.
2. **Dagrapport** naar de privéchat van de PO met de bot, om 08:00 lokale tijd.
3. Vraag 1 en 3, ingevuld door de orkestrator ("maak maar wat zinnigs"): unieke Telegram-gebruikers tellen met een
   dagzout dat alleen in geheugen bestaat (na een herstart is het een ondergrens); het baken krijgt `tg: true` in
   de Telegram-webview.
4. Vraag 4: Cloudflare komt als één grove regel in het rapport, met een apart token dat alleen analytics leest.
5. Vraag 5: de oude aggregaten blijven zoals ze zijn; het rapport noemt de datum waarop de filters live gingen.

## Changelog

- 2026-10-17: draft.
- 2026-10-17: accepted; A in uitvoering, B en C als track U88.
- 2026-10-17: aanvulling (PO: "ik wil mezelf vooral niet negeren maar wel interessant om te kunnen onderscheiden",
  "liever op een menutje"): opt-in meetlabel in `?dev` → Meting. Baken v4 met `label`, sessie-aanvraag met `&l=`;
  gelabeld gebruik telt mee en het dagrapport toont "waarvan <label>".
