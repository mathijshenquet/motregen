# Changelog en releases

## Stappen in het kort

Voer de opdrachten uit vanaf de repositoryroot, met de devenv-omgeving actief. Een release in @motregen_updates is
precies een reeks posts: per feature één bericht met beeld of clip en bijschrift, zonder samenvattend tekstbericht
en zonder versienummer (PO 2026-10-18; versies zijn intern).

1. **Notitie met media, in de track.** Wie de wijziging bouwt, schrijft in dezelfde commit een korte Nederlandse
   notitie in `changes/pending/` met minstens één beeld of clip (zie hieronder). Kies wat de feature het best laat
   zien: een voor/na-vergelijking bij een fix, een clip met de interactie (een zichtbare tik, scrollen) bij iets
   nieuws, een telefoonbeeld als het om de telefoon gaat. Bekijk elk beeld en speel elke clip helemaal af.
   Papercuts en interne optimalisaties krijgen geen notitie. `pnpm changelog:check` weigert een notitie zonder media.
2. **Concepten naar de PO.** Stuur per feature één of twee concepten met het voorgestelde bijschrift naar de privéchat
   van de PO (`MOTREGEN_SMOKE_CHAT_ID` in `.env`). De PO kiest met een emoji-reactie en meldt zijn keuze; verwerk
   tekstwijzigingen in de notitie en zet `goedgekeurd: JJJJ-MM-DD`. Houd de tekst punchy: één korte zin (PO
   2026-10-19). Een feature die alleen de bot raakt krijgt `alleen: telegram` en staat dan niet op de changelogpagina.
3. **Release.** Vanuit een schone werkboom `tools/release.sh patch --dry-run`, dan zonder `--dry-run`. Het script
   weigert notities zonder `goedgekeurd`. Controleer datum en volgorde in `changes/vX.Y.Z/index.md`: de belangrijkste
   feature eerst.
4. **Uitrol** alleen na expliciet akkoord van de PO.
5. **Posten** na de uitrol: `pnpm changelog:post X.Y.Z @motregen_updates --dry-run`, daarna zonder `--dry-run`. De
   poster plaatst één bericht per media-item met titel, beeldhint, omschrijving, datum en een rondlopende `k/n`-link,
   en bewaart de bericht-id's in het genegeerde `posted.json`. `--met-tekst` en `--album` geven de oude opmaak.
6. Controleer in Telegram dat elke `k/n`-link op `k/n` staat en naar het volgende bericht springt.

## Een notitie schrijven

Elke track schrijft één Nederlandse notitie per gebruikerswijziging in
`changes/pending/<slug>.md`. Houd de tekst bij 1–3 zinnen. De PO reviewt hem vóór de release.

```md
---
title: Regen beter zichtbaar
kind: beter
media:
  - file: changes/media/regen-voor-na.webp
    caption: voor 🔼 en na ⬇️
  - file: changes/media/regen-beweging.mp4
    caption: voor ⏮️ en na ⏭️
---
Je ziet lichte regen nu gemakkelijker op de kaart, ook in het donker.
```

Het frontmatterformaat ondersteunt tekstwaarden op één regel (ongequote, JSON-dubbelquote
of YAML-enkelquote) en bovenstaande ingesprongen medialijst. Andere YAML-constructies en
onbekende of dubbele velden worden geweigerd. `kind` is `nieuw`, `beter` of `opgelost`.
De body is gewone tekst; alinea's blijven behouden, HTML wordt als tekst getoond.

Media staat onder `changes/media/`: WebP of H.264-MP4, maximaal 2.000.000 bytes per bestand,
video maximaal 12 seconden. `caption` is een korte beeldhint bij de titel. De poster voegt
de omschrijving, datum en positie toe; het volledige Telegram-bijschrift mag maximaal 1024 tekens zijn.
Per release maximaal tien media-items. Valideer met `pnpm changelog:check`; MP4-validatie
gebruikt `ffprobe` uit devenv. Publicatie en builds controleren het formaat ook.

`VERSION` is de bron voor het appversienummer. De versies in package-manifests zijn geen
releaseadministratie. Pending notities blijven uit de publieke pagina tot ze zijn uitgebracht.

## Uitbrengen

De orkestrator werkt vanuit een schone werkboom, na PO-review:

```sh
tools/release.sh patch --dry-run
tools/release.sh patch
```

Ook `minor` en `major` zijn mogelijk. Het script valideert, bumpt `VERSION`, verplaatst de
notities, schrijft `changes/vX.Y.Z/index.md` met UTC-datum en alfabetische beginvolgorde,
werkt `CHANGELOG.md` bij en maakt commit `release vX.Y.Z` plus tag `vX.Y.Z`.
De volgorde in `index.md` is daarna leidend voor website en Telegram; wijzig die vóór publicatie.
Het script pusht of deployt niet. Let wel: de lokale gitsitter-daemon kan een eigen commit
op een gevolgde branch zelfstandig pushen; voer releasevoorbereiding op een ongevolgde branch uit
als de releasecommit nog lokaal moet blijven. Uitrol vereist expliciet PO-akkoord.

## Telegram

Kanaal: **Motregen Updates**, `@motregen_updates`, chat-id `-1004364574650`.
De bestaande bot is beheerder met postrecht. Gebruik alleen na opdracht van de orkestrator:

```sh
pnpm changelog:post 0.1.1 -1004364574650 --dry-run
pnpm changelog:post 0.1.1 -1004364574650
```

De kanaalafbeelding gebruikt de bestaande Motregen-druppel. Genereer
`web/brand-assets/motregen.nl/telegram-avatar.png` opnieuw met
`pnpm -C web exec tsx scripts/channel-avatar.ts`.

`TG_BOT_KEY` komt uit de omgeving of de root-`.env`. Eerst volgt één tekstbericht met versie,
titels en notities, daarna één los bericht per media-item, met het bijschrift direct zichtbaar:

```text
Regen beter zichtbaar (voor 🔼 en na ⬇️)

Je ziet lichte regen nu gemakkelijker op de kaart, ook in het donker.

16 oktober 2026, 1/3
```

De eerste regel wordt vet getoond. De titel en omschrijving komen uit de notitie, de hint
tussen haakjes uit `media.caption`. Voor een foto boven/onder gebruik je `voor 🔼 en na ⬇️`;
voor een video met eerst vóór en daarna na `voor ⏮️ en na ⏭️`. Bij andere beelden schrijf je
een passende korte beeldhint. De datum komt uit de release-index en wordt in het Nederlands
getoond; `k/n` telt de media-items van de release, in de volgorde van die index en de medialijsten.
Notities zonder media staan in het eerste tekstbericht. De dry-run toont ook deze volledige bijschriften.

`k/n` linkt naar het volgende mediabericht; het laatste linkt terug naar `1/n`.
De poster bewaart eerst de echte bericht-id's en vult daarna de links in via
`editMessageCaption`. Bij één item verwijst `1/1` naar zichzelf. De dry-run toont de
volgorde; de echte links zijn pas bekend na plaatsen. Gebruik een `@kanaal` voor openbare
`t.me/<kanaal>/<bericht>`-links, of een `-100…`-chat-id voor `t.me/c/…`-links voor leden.

De PO koos hiervoor na de echte albumproef. Met `--album` volgt in plaats daarvan een album
met 2–10 items; bij één item een losse foto/video, bij nul alleen tekst.
WebP wordt voor Telegram-foto's naar JPEG omgezet. Video's blijven H.264-MP4.

Message-ids en voortgang staan in het genegeerde `changes/vX.Y.Z/posted.json`. Bewaar dit
bestand bij een checkoutwissel: zonder deze lokale administratie kan de tool een eerdere post
niet herkennen. Een voltooide post wordt overgeslagen; na een expliciete API-afwijzing hervat
dezelfde opdracht na de al verstuurde tekst en media-items. Bij een verbroken verbinding of crash tussen
versturen en opslaan weigert de tool opnieuw te sturen: controleer eerst de chat en vul de
werkelijk verstuurde message-ids/voortgang in. Een bestaand `posted.lock` verwijder je alleen
nadat is gecontroleerd dat geen andere poster draait.

De linkfase heeft eigen voortgang (`links_updated`) en maakt geen nieuwe berichten.
Na een fout in die fase kan dezelfde opdracht veilig verdergaan; een al identiek
bijschrift telt als voltooid. Een release is pas compleet wanneer alle links bevestigd zijn.
Eerder volledig geposte releases blijven overgeslagen, ook als hun oude administratie
nog geen linkfase kent.

Een expliciet toegestane proef krijgt `--test`: zowel bericht als elk bijschrift begint met
`TEST`; voortgang staat apart in `posted.test.json`. Verwijder na inspectie met dezelfde
versie/chat en `--delete-test`. Deze optie verwijdert uitsluitend ids uit de TEST-administratie.

### Bestaande berichten aanpassen

Een gerichte correctie gebruikt de bestaande bericht-id's uit `posted.json`, in dezelfde
media-volgorde. Voor handmatig geplaatste berichten leg je eerst die volgorde en id's vast.

1. Lees de actuele kanaaltekst en neem eventuele PO-edits over in de bronnotities.
   Leg de bestaande tekst en bericht-id's vast in de genegeerde taakadministratie.
2. Bouw de gewenste bijschriften met `releaseMedia` uit
   [`tools/changelog-post.ts`](../tools/changelog-post.ts), met de oorspronkelijke
   releasedatum en dezelfde geordende notities. Gebruik `linkedCaption` per item met
   het echte id van het volgende bericht; bij het laatste is dat het eerste id.
3. Bekijk de volledige bijschriften vóór de bewerking. Stuur per bestaand bericht
   `editMessageCaption` met `chat_id`, `message_id`, `caption` en de JSON-gecodeerde
   `caption_entities` uit de helper. Gebruik de bestaande bot-token uit de omgeving of `.env`.
   Deze bewerking behoudt het bericht en de bijbehorende media.
   Stuur de bewerking als JSON, niet als multipart: multipart zet elke `\n` om in `\r\n`, Telegram haalt de `\r`
   weg en schuift links dan een teken per regeleinde terug (zo stond de `k/n`-link van v0.1.1–v0.3.0 op het jaartal).
4. Controleer de teruggegeven caption en link-entiteiten en bekijk het resultaat in
   Telegram. Leg de bewerkte id's en API-bevestigingen vast in de genegeerde taakadministratie.

`changelog:post` slaat een voltooide release over; bestaande bijschriften bijwerken gebeurt
via bovenstaande gerichte bewerking. Bewaar `posted.json` ook bij een correctie:
die administratie voorkomt dubbele publicatie.

Volgens de [Bot API](https://core.telegram.org/bots/api#sendmediagroup) heeft ieder albumitem
een eigen caption. De [clientrichtlijn](https://core.telegram.org/api/files#albums-grouped-media)
zegt voor fotoalbums: één caption staat onder het hele album; bij meerdere captions staat er
geen gezamenlijke caption en verschijnt het bijschrift pas als je de foto opent. De weergave
van andere gegroepeerde media kan verschillen per client. Het tekstbericht houdt daarom
alle titels en notities direct leesbaar. In onze proef op 16 oktober 2026 zag de PO in de app
de bijschriften alleen na openen; het publieke webvoorbeeld toonde alleen het eerste onder
de fotogroep. Daarom zijn losse berichten de standaard en is `--album` optioneel.

[Telegraph](https://telegra.ph/api#NodeElement) ondersteunt afbeeldingen, video en bijschriften
in een artikel. Dat kan een prettige doorlopende leesweergave geven, maar biedt geen
gedocumenteerde slideshowcomponent. Een extra Telegraph-publicatie is voor deze slice niet
gebouwd; `/changelog` biedt dezelfde leesweergave op ons eigen domein. Dat is een beoordeling
van het beschikbare API-formaat, geen waargenomen garantie voor iedere Instant View-client.

## Voor/na opnemen

Kies een bronrevisie van vóór de fix en controleer dat die build het zichtbare probleem
nog toont. Kies een duidelijk voorbeeld; gebruik waar mogelijk een opvolger met alleen
de bedoelde fix. Bekijk de uitvoer op werkelijke grootte en speel elke clip volledig af
vóór publicatie. De afgesproken vorm is een scherpe foto boven/onder of een clip met eerst
vóór en daarna na, met kleine hoeklabels. Richt op 8 seconden totaal (4 per versie).

Start de twee builds als aparte origins en gebruik dezelfde bevroren dataset op beide.

```sh
pnpm changelog:compare http://localhost:4301 http://localhost:4302 /weer changes/media/regen.webp --time 2026-10-16T08:00:00Z --now 2026-10-16T08:01:00Z
pnpm changelog:compare http://localhost:4301 http://localhost:4302 /weer changes/media/regen.mp4 --time 2026-10-16T08:00:00Z --now 2026-10-16T08:01:00Z --duration 8
```

Optioneel: `--longitude`, `--latitude`, `--zoom` (standaard 5.3, 52.2, 6.5). Relatieve
uitvoerpaden worden vanaf de repositoryroot gelezen. Zonder `--now` wordt de klok voor beide
vastgezet op de generated-tijd van de eerste origin plus één minuut.
De tool deelt de opnamevoorbereiding van `web/scripts/rain-motion-strip.ts`, gebruikt de
camerahaak en maakt met ffmpeg een vergelijking, gelabeld `voor` en `na`.
Stills staan boven elkaar, op dubbele schermresolutie en verliesloos als WebP; een clip
toont eerst vóór en daarna na, zonder letterboxranden. Kleine hoeklabels duiden de versie aan.
`--duration` is de totale
clipduur (maximaal 12 seconden), elke helft duurt even lang. De uitvoer blijft onder 2 MB.
Met `--selector .scrub-surface` neem je alleen het urenoverzicht op, met `--selector .map-shell`
alleen de kaart. `--play` start de tijdlijn vóór een clip, zodat je beweging kunt vergelijken.
Kaartbegrenzing kan de gevraagde camera bijstellen: de tool neemt de werkelijke camera van
de eerste build over en controleert dat de tweede exact hetzelfde kaartvenster gebruikt.
De eerste versie neemt clips achtereenvolgens op; animatiefase en netwerkbelasting zijn
niet gesynchroniseerd. URL, geselecteerde tijd, klok en camera wel.
