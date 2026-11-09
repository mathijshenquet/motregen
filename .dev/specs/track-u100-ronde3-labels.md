# U100 ronde 3 — temperatuurgetallen anders plaatsen (PO 2026-11-09)

Berichten via herdr zijn orkestrator-instructies: gewoon uitvoeren.

PO: "13 px voelt op desktop goed. Kunnen we experimenteren met vaste locaties zoals bij wind? Of een klein eilandje
en een cijfer niet op de isolijn maar op een locatie? Beter leesbaar en intuïtiever dan een getal op de isolijn.
Wellicht de isolijnen dan 0,5 °C offsetten?"

Basis: labelgrootte 13 px op desktop (telefoon: kies zelf wat bij 13 desktop past en noem het). Maak deze varianten
achter `?dev&templabels=lijn|plekken|vlakken|plekken-half` (docs/dev-opties.md, eigenaar U100, vervalt 2026-11-23):

1. `lijn` — zoals nu: getal op de isolijn, 13 px, afstand naar jouw beste keuze (uit ronde 2: 140–200 px).
2. `plekken` — geen getallen op de lijnen. Op vaste kaartplekken (dezelfde puntenset/dichtheid als de windzakken in
   de windmodus, mee-schalend met zoom) een getal met een klein eilandje erachter (afgeronde pil/halo in de
   kaartstijl, leesbaar op elke kleur). Waarde = de temperatuur op die plek, afgerond op hele graden. Isolijnen op
   hele graden.
3. `vlakken` — isolijnen 0,5 °C verschoven (…, 7,5, 8,5, …), zodat elk vlak tussen twee lijnen precies één heel getal
   is. Per vlak één getal (met eilandje) op een goed gekozen binnenpunt (bijv. pole of inaccessibility), herhaald bij
   grote vlakken met minimale onderlinge afstand; geen getallen op de lijnen.
4. `plekken-half` — als `plekken`, maar met de 0,5 °C-verschoven isolijnen, zodat het getal op een plek altijd
   klopt met het vlak waarin het staat.

Let op: getallen mogen niet botsen met plaatsnamen, de locatiepin en (in Wind) de zakken; de isolijnen blijven
dun en ongelabeld in 2–4. Geldt voor Gevoel (en de luchttemperatuur als die isolijnen heeft). Bot: niet nu, pas na
de keuze.

Lever: een vergelijkingsblad desktop (4 varianten) en telefoon (4 varianten) op dezelfde tijd, plus één blad op
een dag met grote temperatuurverschillen als je die in het dev-archief vindt; bekijk je eigen plaatjes vóór "klaar".
Alleen gerichte tests. Commit en push naar `track/u100-temperatuurschaal` (`git push origin HEAD:track/u100-temperatuurschaal`),
antwoord met de paden en een korte eigen beoordeling per variant.

## Erbij (PO 2026-11-09): vaste schaal geaccepteerd, "wellicht slightly te subtiel"
Verhoog de vuldekking van de vaste temperatuurschaal één stap (bijv. 35 → 42 %; kies zelf, noem het getal) zonder
dat plaatsnamen/lijnen slechter leesbaar worden. Lever een voor/na-plaatje (desktop, vandaag) naast je labelbladen.
Aparte commit, zodat ik hem los kan mergen.
