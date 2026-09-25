# Gebruiksmeting (MIP-13)

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
| `v` | `1` | contractversie; het rapport telt alleen `v: 1` |
| `pinFeel` | `true` of afwezig | modus gevoel vastgezet |
| `pinWind` | `true` of afwezig | modus wind vastgezet |
| `hover` | `true` of afwezig | isolijnfocus via hover op de kolom Gevoel |
| `search` | `true` of afwezig | zoekresultaat gekozen |
| `geo` | `true` of afwezig | geolocatie gelukt (nooit de plaats) |
| `fav` | `true` of afwezig | favoriet opgeslagen |
| `pin` | `true` of afwezig | pin verplaatst |
| `play` | `true` of afwezig | afspelen gestart |
| `scrub` | `true` of afwezig | tijd gescrubd |
| `history` | `true` of afwezig | historie in de tabel geopend |
| `fresh` | `true` of afwezig | versheidspaneel geopend |
| `about` | `true` of afwezig | About geopend |
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
{"level":"info","ts":"2026-09-25T14:28+02:00","logger":"http.log.access.usage","msg":"handled request","uri":"/hit","hit":"{\"v\":1,\"search\":true,\"range\":null,\"theme\":\"dark\",\"unit\":\"bft\",\"coarse\":false,\"width\":\">=960\",\"dur\":\"1-5\"}"}
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

## Bewaartermijnen en locatie

| wat | waar (prod) | hoe lang |
| --- | --- | --- |
| ruwe regels | `/var/lib/motregen-usage/usage/YYYY-MM-DD.jsonl` | 30 dagen, daarna verwijderd door de rapporttimer |
| dagaggregaat | `/var/lib/motregen-usage/stats/YYYY-MM-DD.json` | blijvend (alleen tellingen) |
| rapport | `/var/lib/motregen-usage/stats/stats.html` | elke nacht opnieuw gemaakt |
| kopie aggregaten | ageq-mthq, `~/motregen-stats/` | blijvend (zie hieronder) |

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
- **bakens** is het aantal geldige `v: 1`-bodies; **afgewezen** telt `/hit`-regels
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

## `/stats/` openen

`https://motregen.nl/stats/` staat achter basic auth. Zonder wachtwoordbestand
blijft de pagina dicht: de standaardhash hoort bij een weggegooid willekeurig
wachtwoord. Plaats de inloggegevens eenmalig buiten Git en de Nix store met deze
expliciete Bash-opdracht. De hash wordt lokaal gemaakt; alleen de hash gaat naar
de host, en het wachtwoord verschijnt niet in terminal of shellgeschiedenis:

```sh
bash -c 'read -rsp "Wachtwoord voor /stats/: " pw; echo; hash=$(printf "%s\n" "$pw" | nix run nixpkgs#caddy -- hash-password | tr -d "\n" | base64 | tr -d "\n"); printf "MOTREGEN_STATS_USER=stats\nMOTREGEN_STATS_HASH=%s\n" "$hash" | ssh root@57.129.47.17 "install -m 0600 /dev/stdin /var/lib/motregen-usage/stats-auth.env && systemctl restart caddy"'
```

Het bestand is een systemd-EnvironmentFile voor Caddy; de hash staat base64-
gecodeerd omdat een bcrypt-hash `$`-tekens bevat. Na elke wijziging is een
herstart van Caddy nodig (een reload leest het bestand niet opnieuw).

## Kopie naar ageq-mthq

Er is geen SSH-route van de productiehost naar ageq-mthq; wel omgekeerd: de
sleutel `mthq@ageq-mthq` staat in `nix/authorized-keys.nix`. ageq-mthq haalt de
aggregaten daarom zelf op. Voeg in `~/nix-config` (NixOS-configuratie van
ageq-mthq) deze service en timer toe:

```nix
systemd.services.motregen-stats-pull = {
  description = "Kopieer motregen-dagaggregaten van de productiehost";
  path = [ pkgs.rsync pkgs.openssh ];
  script = ''
    mkdir -p "$HOME/motregen-stats"
    rsync -a --exclude '.*' root@57.129.47.17:/var/lib/motregen-usage/stats/ "$HOME/motregen-stats/"
  '';
  serviceConfig = {
    Type = "oneshot";
    User = "mthq";
  };
};
systemd.timers.motregen-stats-pull = {
  wantedBy = [ "timers.target" ];
  timerConfig = {
    OnCalendar = "*-*-* 05:00:00";
    Persistent = true;
  };
};
```

`rsync` staat daarvoor op de productiehost. Zonder `--delete` blijven oude
aggregaten op ageq-mthq staan, ook als ze op prod ooit verdwijnen. Wie de
root-sleutel niet voor een nachtelijke taak wil gebruiken, voegt een aparte
sleutel toe met `command="rrsync -ro /var/lib/motregen-usage/stats/",restrict`
in `authorized_keys`.

## Cloudflare als grove tweede meter

De site staat achter de Cloudflare-proxy. De zone-analytics in het dashboard
(**Analytics & Logs → Traffic**) tonen verzoeken, bandbreedte, landen en
"unique visitors" op basis van IP aan de edge. Dat kost niets extra en er gaat
niets extra naar Cloudflare. Het Web Analytics-script van Cloudflare gebruiken
we niet (MIP-13). De getallen verschillen van het eigen rapport: Cloudflare telt
alle verzoeken, ook bots en gecachte chunks; ons rapport telt sessies en bakens.
