# Changelog en releases

Elke track schrijft één Nederlandse notitie per gebruikerswijziging in
`changes/pending/<slug>.md`. Houd de tekst bij 1–3 zinnen. De PO reviewt hem vóór de release.

```md
---
title: Regen beter zichtbaar
kind: beter
media:
  - file: changes/media/regen-voor-na.webp
    caption: Links de oude kaart, rechts de nieuwe kaart met duidelijkere regen.
  - file: changes/media/regen-beweging.mp4
    caption: De buien bewegen rustiger als je de tijdlijn afspeelt.
---
Je ziet lichte regen nu gemakkelijker op de kaart, ook in het donker.
```

Het frontmatterformaat ondersteunt tekstwaarden op één regel (ongequote, JSON-dubbelquote
of YAML-enkelquote) en bovenstaande ingesprongen medialijst. Andere YAML-constructies en
onbekende of dubbele velden worden geweigerd. `kind` is `nieuw`, `beter` of `opgelost`.
De body is gewone tekst; alinea's blijven behouden, HTML wordt als tekst getoond.

Media staat onder `changes/media/`: WebP of H.264-MP4, maximaal 2.000.000 bytes per bestand,
video maximaal 12 seconden. Elk item krijgt een eigen bijschrift (maximaal 1024 tekens).
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

`TG_BOT_KEY` komt uit de omgeving of de root-`.env`. Eerst volgt één tekstbericht met versie,
titels en notities, daarna één los bericht per media-item, met het bijschrift direct zichtbaar.
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

Een expliciet toegestane proef krijgt `--test`: zowel bericht als elk bijschrift begint met
`TEST`; voortgang staat apart in `posted.test.json`. Verwijder na inspectie met dezelfde
versie/chat en `--delete-test`. Deze optie verwijdert uitsluitend ids uit de TEST-administratie.

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

Start de twee builds als aparte origins en gebruik dezelfde bevroren dataset op beide.

```sh
pnpm changelog:compare http://localhost:4301 http://localhost:4302 /weer changes/media/regen.webp --time 2026-10-16T08:00:00Z --now 2026-10-16T08:01:00Z
pnpm changelog:compare http://localhost:4301 http://localhost:4302 /weer changes/media/regen.mp4 --time 2026-10-16T08:00:00Z --now 2026-10-16T08:01:00Z --duration 4
```

Optioneel: `--longitude`, `--latitude`, `--zoom` (standaard 5.3, 52.2, 6.5). Relatieve
uitvoerpaden worden vanaf de repositoryroot gelezen. Zonder `--now` wordt de klok voor beide
vastgezet op de generated-tijd van de eerste origin plus één minuut.
De tool deelt de opnamevoorbereiding van `web/scripts/rain-motion-strip.ts`, gebruikt de
camerahaak en maakt met ffmpeg een vergelijking, gelabeld `voor` en `na`.
Stills staan naast elkaar; een clip toont eerst vóór en daarna na. `--duration` is de totale
clipduur (maximaal 12 seconden), elke helft duurt even lang. De uitvoer blijft onder 2 MB.
Met `--selector .scrub-surface` neem je alleen het urenoverzicht op, met `--selector .map-shell`
alleen de kaart. `--play` start de tijdlijn vóór een clip, zodat je beweging kunt vergelijken.
Kaartbegrenzing kan de gevraagde camera bijstellen: de tool neemt de werkelijke camera van
de eerste build over en controleert dat de tweede exact hetzelfde kaartvenster gebruikt.
De eerste versie neemt clips achtereenvolgens op; animatiefase en netwerkbelasting zijn
niet gesynchroniseerd. URL, geselecteerde tijd, klok en camera wel.
