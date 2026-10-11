# MIP-31 — Vloeiender windfilm binnen het renderbudget

Status: draft · auteur: PM (sol) · 2026-10-11

## Aanleiding
De PO vindt de U80-proef met 75 seconden kaarttijd per frame bij 7,5 fps duidelijk beter dan de standaard met 100 seconden bij 5,6 fps. Het kaarttempo blijft bijna gelijk: 9,375 tegenover 9,33 kaartminuten per seconde. De kleinere stappen maken de windstreepjes vloeiender.

De PO overweegt ook regen of isobaren uit de windkaart te halen, en vroeg het renderbudget van alle modi te vergelijken. Welke lagen blijven staat nog open.

## Gemeten uitgangspunt
VM, twee kernen, CPUQuota=200%, MemoryMax=900M, geen swap, dezelfde vaste snapshot: generated 2026-10-11T12:47:47Z, now 12:45Z. De bestaande bot bleef draaien; iedere afzonderlijke proef begon buiten zijn renderproces. Nix-renderer qcnj1kdipkxba2kkfsrbl64r70w0jp2r, head 5aab9d1. Alle vermelde proeven eindigden synchroon met exit 0.

| Modus, 5,6 fps | Wandtijd | CPU | Cgroup-piek | Uitvoer |
|---|---:|---:|---:|---|
| Regen | 10,824 s | 19,333 s | 239,0 MiB | 109 kaartframes + 6 hold, 85 JPEGs |
| Gevoelstemperatuur | 17,005 s | 31,067 s | 239,6 MiB | 217 kaartframes + 6 hold, 85 JPEGs |
| Wind | 15,226 s | 26,142 s | 309,1 MiB | 217 kaartframes + 6 hold |
| Alles samen | 48,285 s | 77,888 s | 563,6 MiB | Drie films + 170 JPEGs |

Afzonderlijke tijden zijn geen optelbare voorspelling voor de parallelle generatie: scheduling, encodewerk en belasting verschillen. De gezamenlijke meting haalt de grens van één minuut op de VM. Op de dev-host kostte wind alleen 8,910 s bij 5,6 fps en 12,005 s bij 7,5 fps; VM-cijfers voor 7,5 fps volgen.

## Vergelijking vóór de keuze
U80 maakt vier geïsoleerde proeven met 75 s / 7,5 fps op dezelfde snapshot: volledig; zonder regen; zonder isobaren en drukletters; zonder beide. Per proef komen een MP4, zelf bekeken beelden en een faseprofiel met een dev-hostmeting. De PM meet dezelfde pakketten afzonderlijk op de VM en bekijkt de films. Productiegedrag blijft gedurende de vergelijking gelijk.

Alle vier proeven zijn nu ook op de VM gemeten, met dezelfde snapshot en grenzen als hierboven. Elke film heeft 289 kaartframes en acht holdframes bij 15/2 fps. Alle vier eindigden succesvol.

| Wind, 7,5 fps | Wandtijd | CPU | Cgroup-piek |
|---|---:|---:|---:|
| Met regen en isobaren | 19,929 s | 32,913 s | 303,4 MiB |
| Zonder regen, met isobaren | 10,716 s | 18,588 s | 276,9 MiB |
| Met regen, zonder isobaren/drukletters | 15,245 s | 28,862 s | 299,5 MiB |
| Zonder beide | 8,607 s | 14,631 s | 247,3 MiB |

PM heeft de acht dag-/nachtbeelden en de volledige films bekeken; de browser speelde alle vier films tot het einde zonder fouten. Review: http://ageq-dev2:4397/review/round5/. De beelden gebruiken de eerdere worker-snapshot (now 06:35Z); alle VM-budgetten hierboven gebruiken de eigen vaste snapshot (now 12:45Z). Binnen iedere vergelijking is de data gelijk. PM-voorkeur: zonder regen, met isobaren. De streepjes zijn beter leesbaar en de drukinformatie blijft; extra drukloze versobering scheelt in deze proef nog 2,1 seconden.

Het profiel van de bestaande windfilm wijst op meer werk voor regen (voorfilter, motion, menging) dan voor isobaren (contouren, labels). Dat is een richting voor de proeven; de fasewandtijden overlappen en bewijzen op zichzelf geen besparing in totale wandtijd.

## Temperatuur efficiënter samenstellen
De PO vraagt ook of de lijnen efficiënter kunnen worden gesampled. Voor temperatuur betreft dit isothermen. Voorbereide bronvelden en labelgeometrie hebben al caches; het kleurvlak wordt op een derde van breedte/hoogte gemaakt en vervolgens vergroot. Per uitvoertijd worden contouren en het ringraster opnieuw bepaald voor het gemengde veld. Temperatuur heeft bovendien 265 verschillende composities, regen 175.

U80 splitst in een geïsoleerde proef het profiel van contouren/ringen en kleurvlak/lijnen. Daarna volgt één gerichte optimalisatie van het bestaande sampling-/vergrotingswerk, met dezelfde resolutie, waarden, lijnen en kleuren. Kandidaat: uniforme RGBA-hoeken sneller verwerken bij bilineair vergroten. Beeldgelijkheid van alle filmframes en 85 stills en een gecontroleerde meting vóór/na bepalen of de wijziging wordt opgenomen.

## Besluit
De PO geeft 7,5 fps als gewenste richting aan. De keuze van lagen en de definitieve uitrol volgen na de vergelijking; er is nog geen laag verwijderd. MIP-30 E1 (MemoryMax1600M) is al aangenomen en kan met die uitrol mee. Het set-/deadlinebeleid van MIP-30 E2 staat daarvan los.
