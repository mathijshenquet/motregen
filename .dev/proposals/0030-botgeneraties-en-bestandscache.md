# MIP-30 — Botgeneraties samenvoegen en ruimte voor bestandscache

Status: accepted (PO 2026-10-11 14:24 CEST, uitsluitend E1) · auteur: PM (sol)

## 1. Het probleem
De bot maakt alle drie Rust-films en 170 stills wanneer hij een nieuwe manifestversie leest. Ingest publiceert na elke gewijzigde bron meteen een volledig, atomair manifest. Op 11 oktober publiceerde hij om 14:07:08 CEST radar van 14:05 en om 14:07:17 de nowcast van 14:05. Beide versies leidden tot een volledige botgeneratie. Een normale generatie duurt ongeveer 40 seconden op de VM.

Radar en nowcast hebben ieder een vijfminutenritme en delen een brontijd; andere bronnen horen niet bij elke ronde. De huidige ingest controleert seamless en UV elke vijftien minuten en HARMONIE elke drie uur. Seamless wordt bovendien in een achtergrondtaak verwerkt: drie waargenomen taken duurden 132–135 seconden. In de productie-logs tussen 13:45 en 14:38 CEST kwam nowcast meestal 8–15 seconden na radar, maar bij de ronde van 13:45 was het verschil ongeveer 70 seconden. Een vaste set van alle bronnen afwachten zou verse radar onnodig ophouden.

De gecombineerde bot-unit heeft MemoryMax=1200M. Op 11 oktober om 14:14 lokaal waren er 404 hits op de geheugengrens, nul OOM-kills en nul herstarts. De 3,8 GB-VM had 2,8 GB beschikbaar geheugen. Het grootste tijdelijke deel is bestandscache plus renderwerk; de grens dwingt reclaim af terwijl andere diensten nog ruimte hebben.

## 2. Eerder werk
MIP-29 verplaatst de beeldgeneratie naar Rust. U80 meldde de dubbele generaties en stelde een wachttijd voor; dat voorstel is nog niet gebouwd. De PM-overdracht noemt beide punten als E1 en E2. U80 integreert nu de gekozen klok en het nieuwe filmtempo; die reeds gevraagde uitrol kan onafhankelijk doorgaan.

## 3. Aanbeveling
1. Verhoog uitsluitend MemoryMax van de gecombineerde bot-unit van 1200M naar 1600M. Houd de begrenzing, MemorySwapMax en overige hardening gelijk. Controleer na uitrol grenshits, OOM-kills, herstarts en generatietijd.
2. PO-richting voor E2: wacht per nieuwe radarbrontijd op de bijbehorende nowcast en render zodra dat paar compleet is. Stel een harde deadline vanaf de eerste waarneming van die radar, die volgende manifestpublicaties niet verlengen. Gebruik bij het verstrijken de nieuwste beschikbare gegevens, ook als nowcast ontbreekt. PM-voorstel: maximaal 90 seconden, zodat ook het waargenomen verschil van 70 seconden past; meestal start de generatie al na 8–15 seconden. De app blijft elke bron direct volgen. Wacht niet op verse HARMONIE, seamless of UV; gebruik hun laatst beschikbare gegevens.
3. Voor uitvoering nog vastleggen: wat een late nowcast of een zelfstandige modelupdate na de deadline doet. PM-richting: late nowcast meenemen in de volgende radarcyclus om dubbele volledige generaties te voorkomen; relevante modelupdates afzonderlijk laten triggeren. De huidige manifestidentiteit bevat bron, veld, run en chunkpad, zodat updates gericht te herkennen zijn. De oorspronkelijke suggestie van dertig seconden zonder manifestwijziging is met deze setbenadering vervangen en niet geïmplementeerd.

## 4. Open keuzes voor de PO
1. E1: MemoryMax naar 1600M voor de gecombineerde bot-unit, of 1200M behouden?
2. E2: radar + nowcast per brontijd samenvoegen met een vaste deadline; voorgesteld maximum 90 seconden en gedrag voor late producten zoals hierboven. Richting van de PO verwerkt; deadline en late-productgedrag nog open.

## 5. Besluit
1. E1 aangenomen: MemoryMax van de gecombineerde bot-unit wordt 1600M. Neem dit mee in de komende uitrol en controleer de unit en geheugen-/herstartcijfers op prod.
2. E2 blijft onder bespreking. De PO stelt voor de verwachte set met een deadline af te wachten. Oorzaak van de dubbele publicatie bevestigd met productie-logs; voorstel hierboven daarop aangepast. Er is nog geen generatiebeleid geïmplementeerd.

## Changelog
- 2026-10-11 14:15 CEST: voorstel uit de PM-overdracht, aangevuld met een actuele productiecontrole. Geen implementatie of productieaanpassing voor deze keuzes uitgevoerd.
- 2026-10-11 14:24 CEST: PO neemt E1 aan; E2 nog onder bespreking.
- 2026-10-11 14:39 CEST: radar/nowcast-paar en afzonderlijke cadansen uit code en productie-logs bevestigd; PO-richting set met deadline verwerkt, inclusief waargenomen late nowcast en langzaam seamless.
