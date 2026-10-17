# U88 — Telegram meten en een dagelijks gebruiksrapport (MIP-35 B en C)

Eigenaar: worker `u88-gebruiksrapport`. Orkestrator: Claude. Branch `track/u88-gebruiksrapport` vanaf
`origin/track/mip35-meting`. Track-LOG `.dev/tracks/u88-gebruiksrapport/LOG.md` (append-only, tijd uit `date`).
**Slice**: geen e2e of volledige suites; typecheck, de unit-tests die je toevoegt of raakt, en de NixOS-test
`nix build -L .#checks.x86_64-linux.nixos-vm` (synchroon, exitstatus noteren). De orkestrator gate op de integratie.
Commit en push elke 15–20 minuten. **Geen prod-acties en geen echte Telegram-berichten**: stuur alleen naar
`MOTREGEN_SMOKE_CHAT_ID` uit `.env`.

Lees eerst `.dev/proposals/0035-echte-gebruikers-en-dagrapport.md` (aangenomen) en `docs/analytics.md` (MIP-13,
het privacycontract). Alles hieronder valt onder datzelfde contract: **geen** gebruikers-id, chat-id,
gebruikersnaam, plaatsnaam, zoektekst of tijdstempel fijner dan de dag op schijf of in het journal.

## B. Telegram-tellingen in de bot (`bot/`)

1. Een kleine module (bijv. `bot/usage-counts.ts`) telt per lokale kalenderdag (Europe/Amsterdam), in geheugen:
   - `commands`: per commandonaam (`start`, `weer`, `regen`, de modecommando's en hun aliassen onder hun hoofdnaam);
   - `inline`: inline-zoekopdrachten; `inlineChosen` als je die update al ontvangt (anders weglaten, niet aanzetten);
   - `timeButtons` (tijdknoppen/callbacks op een kaart) en `placeButtons` (plaatskeuze);
   - `chats`: aantal interacties uit `private` en uit `group`/`supergroup`;
   - `users`: unieke gebruikers. Per dag één willekeurig zout (`crypto.randomBytes`) dat alleen in geheugen staat; de
     set bevat `sha256(zout, from.id)`. Alleen de grootte wordt weggeschreven. Bij dagwissel gaan zout en set weg.
2. Wegschrijven naar `telegram/YYYY-MM-DD.json` onder de usage-root (zie `nix/modules/motregen.nix`, `usageRoot`):
   elke 10 minuten en bij afsluiten (SIGTERM), atomair (tmp + rename). Na een herstart leest de bot de tellingen van
   vandaag terug en telt verder; `users` is dan een ondergrens (zet `usersLowerBound: true` in het bestand).
   Regel de schrijfrechten in Nix zonder het `motregen-usage`-contract te verzwakken (bijv. een submap `telegram/`
   van de bot-gebruiker, leesbaar voor de rapportdienst).
3. Alleen de rol die updates ontvangt (`poller`/`combined`) telt. Unit-tests: tellen, dagwissel, terugladen,
   en een test die bewijst dat geen id of tekst in de JSON belandt.

## Baken: `tg`-veld (web)

`tg: true` als de pagina in de Telegram-webview draait (`window.Telegram?.WebApp?.initData` niet leeg, of hoe de
Mini App dat nu al detecteert — zoek het bestaande pad). Pas `USAGE_FEATURES`/`USAGE_FIELDS`, `USAGE_SCHEMA_VERSION`
(3), `nix/usage/contract.jq`, `day.jq` (tel v2 én v3 als geldig) en `docs/analytics.md` aan. Bestaande usage-tests bijwerken.

## C. Dagrapport naar de PO

1. Een systemd-dienst + timer op prod, `OnCalendar` 08:00 Europe/Amsterdam, `Persistent=true`, ná de bestaande
   `motregen-usage-report` (04:00). Bash + jq + curl, in de stijl van `usageReport` in de module.
2. Ontvanger en token uit de secrets: `TG_BOT_KEY` (bestaat) en `MOTREGEN_REPORT_CHAT_ID` (nieuw; de orkestrator zet
   hem op prod). Cloudflare: `CLOUDFLARE_ANALYTICS_TOKEN` (nieuw, alleen-lezen) + zone-id als Nix-optie
   (`eceaddc3898b93f295b87ba56ac24078`); ontbreekt het token, dan laat het rapport die regel weg.
3. Inhoud (Nederlands, kort, `parse_mode` HTML), voor gisteren en het gemiddelde van de 7 dagen ervoor:
   - **Web**: sessies, bakens, touch/desktop-verdeling, top 3 features als percentage van de bakens,
     aandeel `tg`.
   - **Telegram**: gebruikers (met `≥` als ondergrens), commando's (top 3 met aantallen), inline, knoppen, en het
     ledental van @motregen_updates (`getChatMemberCount`, chat `-1004364574650`) met verschil t.o.v. gisteren
     (bewaar het getal in het telegram-dagbestand of een klein `channel.json`).
   - **Cloudflare** (één regel): unieke IP's en pageviews van gisteren via GraphQL `httpRequests1dGroups`, met het
     aandeel FR erbij ("FR is vooral de dev-host"). Grof, met de vermelding "incl. bots".
   - Ontbreekt het web- of Telegram-aggregaat van gisteren, dan zegt het bericht dat expliciet ("meting stil sinds …").
   - Eén regel "filters sinds 2026-10-17" zolang het 7-daagse gemiddelde dagen van vóór die datum bevat.
4. Een droogloop-vlag die het bericht op stdout zet in plaats van te sturen, en een manier om het lokaal te draaien
   op een kopie van `/var/lib/motregen-usage` (de orkestrator heeft er een in zijn scratch; maak zelf een fixture).
5. NixOS-test: de rapportdienst draait in de VM tegen fixtures met een nep-Telegram-endpoint of in droogloop, en het
   bericht bevat de verwachte getallen. Breid de bestaande privacy-asserts uit naar `telegram/`.
6. `docs/analytics.md`: secties voor de Telegram-tellingen en het dagrapport.

Geen changelog-notitie (PO: dit is geen gebruikerswijziging).

Leesbaarheid: geen één-letternamen, geen slimme one-liners, commentaar alleen voor het niet-vanzelfsprekende waarom.
Een eerlijke "dit lukt niet zo, want…" is evenveel waard als groen. Meld **"U88 slice"** met head-sha, de exit-
statussen (typecheck, unit, nixos-vm) en een droogloop-bericht als voorbeeld in de LOG.
