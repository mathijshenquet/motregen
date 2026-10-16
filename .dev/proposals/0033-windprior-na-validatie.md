# MIP-33: windprior alleen na aangetoonde winst

Status: draft
Auteur: U84-onderzoek, 2026-10-16

## 1. Het probleem

MIP-5 voegde een gekalibreerde modelwind als bewegingsprior toe. Het
[U84-onderzoek](../../docs/motion-windkalibratie.md) toont dat een globale
rotatie/schaal lokaal goede wind kan verslechteren en via smoothing ook sterke
correlatieblokken verplaatst. Op de probleemsnapshot daalt de nowcastmediaan van
1,80 naar 0,71 cellen/5 min zonder wind, op dezelfde 1.234 blokken. Een andere
robuuste fit of ruimere klem verhelpt het probleem niet algemeen.

Wind kan wel meer dekking geven en soms ontbrekende correlaties verbeteren.
Op 10 oktober is de fout voor 265 vergelijkbare regenblokken zonder correlatie
1,58 met de huidige prior, tegen 1,80 met een runmediaan. Op 16 oktober is de
runmediaan juist veel beter: 2,24 tegen 5,15. De HARMONIE-uitkomst is gevoelig
voor het zoekvenster van de onafhankelijke referentie en bewijst geen bronkeuze.

## 2. Eerder werk

MIP-5 beschrijft servervectoren en browserwarp. Het amendement van 31 augustus
introduceerde de windprior. U82 onderzoekt de uitvoerbare wijziging voor
RTCOR/nowcast/seamless en afzonderlijk HARMONIE. U84 verandert geen productiecode.
De bestaande `estimate` erft vier stappen van buren; een runmediaan is een andere
fallback die ook verder gelegen gaten kan bereiken.

## 3. Aanbeveling

1. Laat RTCOR/nowcast/seamless de regenbeweging volgen zoals U82 beoogt. Bescherm
   sterke correlaties ook ná smoothing. De huidige globale windprior komt niet
   als algemene fallback terug op basis van alleen een andere fit.
2. Beoordeel een runmediaan uitsluitend voor ontbrekende dekking, zonder geldige
   lokale vectoren te vervangen. Dit is goedkoop en gebruikt bestaande gegevens;
   de mogelijke schade is verlies van lokale bewegingsverschillen.
3. Vereis vóór eventuele herinvoering van wind een vergelijking op aparte
   evaluatieparen én ruimtelijk onafhankelijke regengebieden: fout en p90 op
   dezelfde regenblokken, plus dekking en prestaties juist in blokken zonder
   correlatie. Vergelijk met zowel buurerving als runmediaan. Toon de winst in
   meerdere rustige, buiige en bandvormige gevallen; accepteer geen algemene
   winstclaim die alleen voortkomt uit het weglaten van ongedekte blokken.
4. Bij een behouden fit: onderscheid vrije en geklemde parameters, tel unieke
   blokken, meet hoekspreiding/residu en herbereken schaal na hoekbegrenzing.
   De in U84 geteste drempels zijn onderzoeksvarianten en worden hiermee niet
   aangenomen als productieregel.
5. Beslis afzonderlijk over HARMONIE. Eerst meerdere modelruns en uurparen met
   een betrouwbare verplaatsingsreferentie. Stel p3-wind op 700/850 hPa uit tot
   een expliciet experiment: extra databron, download en rasterrotatie leveren
   op dit moment geen bewezen winst op.

## 4. Open vragen voor de PO

1. Is het onderscheid tussen bronsoorten en een bewijsvereiste vóór herinvoering
   van de windprior akkoord als amendement op MIP-5?
2. Moet de runmediaan als gerichte fallback voor resterende gaten verder worden
   uitgewerkt, of volstaat de dekking van U82 voorlopig?
3. Is het beperkte mogelijke voordeel in zeer dunne regen voldoende reden om
   later geld en tijd aan hogere stuurvlakken te besteden?

## Changelog

- 2026-10-16: concept op basis van acht weekvensters en vier snapshotbronnen.
