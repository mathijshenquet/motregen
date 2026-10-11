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

Het profiel van de bestaande windfilm wijst op meer werk voor regen (voorfilter, motion, menging) dan voor isobaren (contouren, labels). Dat is een richting voor de proeven; de fasewandtijden overlappen en bewijzen op zichzelf geen besparing in totale wandtijd.

## Besluit
De PO geeft 7,5 fps als gewenste richting aan. De keuze van lagen en de definitieve uitrol volgen na de vergelijking; er is nog geen laag verwijderd. MIP-30 E1 (MemoryMax1600M) is al aangenomen en kan met die uitrol mee. Het set-/deadlinebeleid van MIP-30 E2 staat daarvan los.
