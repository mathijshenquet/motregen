# U91b — Urentabel die overgaat in de lange termijn (PO 2026-10-17)

Zelfde worker, branch, LOG en regels als U91. Dat betekent ook: zelf kijken vóór elk "klaar", en je turn niet beëindigen
zolang er shells lopen.

PO, letterlijk: "Ik dacht misschien kan je die tabel naadloos laten overgaan in de langetermijn voorspelling.
Bijvoorbeeld door progressief meer uren te aggregeren (min-max bij temp en average bij regen ofzo?) tot je alleen
dag+nacht overhoudt? Probeer dat eens als alternatieve weergave met de huidige als dev optie? Dat betekent dus ook
dat de huidige tabel korter wordt."

## Wat je bouwt

1. **De urentabel krijgt een glijdende schaal.** De rijen worden naar achteren toe grover, uitgelijnd op de lokale
   klok. Startladder (maak hem aanpasbaar via één constante; tune hem op het oog):
   - de historie-uren, Nu, en daarna per uur tot ±+12 u;
   - daarna per 3 u (00, 03, 06 …) tot het eind van morgen;
   - overmorgen en de dag erna per dagdeel: nacht 00–06, ochtend 06–12, middag 12–18, avond 18–24;
   - daarna per **dag** (06–18) en **nacht** (18–06), tot dag 10.

   Het werkt pas goed als de overgangen rustig ogen. Een kleine kop per dag ("Maandag 19") boven de grovere rijen helpt
   waarschijnlijk. De zon-onder/op-banden blijven waar ze bij uurrijen staan; bij grove rijen kies jij wat klopt.
2. **Aggregatie per rij**: temperatuur als min–max (bij één uur gewoon één waarde), neerslag als som in mm, wind als
   de hoogste gemiddelde wind met de richting op dat moment, stoot als max. Het icoon komt uit som en gemiddelde
   bewolking; dag of nacht volgt uit het venster. Doe dit consistent met de bestaande cellen; iets wat je niet kunt
   aggregeren of dat de bron niet heeft (UV, maan, gevoel na 48 u), laat je in die rijen weg of toon je rustig leeg.
   Bekijk elke tab: Uur, Weer, Lucht, Gevoel, Wind.
3. **Bron per rij**: HARMONIE als het venster volledig door HARMONIE-uren gedekt is, anders de nieuwe ECMWF-
   stapvelden `step_*` met `ecmwf.steps` (U90b, de worker in de U90-branch maakt ze nu). De regenkans (`day_precip_prob`)
   alleen op dag-rijen. Tot U90b er is kun je de ladder bouwen met de HARMONIE-uren en de huidige `day_*`.
   Daarna vervangt de echte data op 4380 de oude; ik meld het.
4. **De tabel volgt de tijdlijn alleen zolang er tijdlijn is.** Zoek uit hoe de tabel nu met de scrubber/cursor
   gekoppeld is (zie `followTableToEpoch`). Rijen voorbij het einde van de tijdlijn mogen de cursor niet laten
   springen of crashen.
5. **Dev-optie**: de nieuwe weergave is standaard. De huidige uurtabel plus de lijst "Komende dagen" komen achter een
   `?dev`-knop "Dagen: lijst onder tabel". Leg eigenaar (orkestrator) en vervaldatum (2026-11-01) vast in
   `docs/dev-opties.md`, volgens MIP-12.
6. Unit-tests op de ladder (zomer- en wintertijdwissel, een middernachtsgrens, een venster deels HARMONIE en deels
   ECMWF) en op de aggregatie. Werk je e2e-spec bij.

Meld daarna in één bericht: de previewlink, de ladder die je koos (met de waarom-zinnen) en wat open is voor de PO.
