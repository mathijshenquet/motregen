# MIP-33 — Tijdcursor volgt dag en nacht, klok als vlag

Status: accepted (PO-opdracht 2026-10-11) · auteur: PM (sol)

## Het probleem
De hemel in de tijdgrafiek volgt de geselecteerde tijd. De cursorlijn en haar labels gebruiken nog de kleuren van het app-thema. Daardoor past de cursor niet altijd bij de dag- of nachthemel eronder. Het tijdlabel staat met een tussenruimte naast de lijn.

## Eerder werk
U34 introduceerde de vaste tijdcursor en waarden bij de lijn; U62 laat de hemel en tijdliniaal dag en nacht volgen. U77 voegde de cursorklok toe, links van de lijn met een uitwijkmogelijkheid aan het begin van de tijdlijn.

## Besluit
De PO vraagt op 2026-10-11 om adaptieve kleuren voor de cursor en alle cursorlabels, en om de cursorklok aan de lijn vast te maken als een vlaggetje. Gebruik dezelfde dag-/nachtgrens als de hemel en de tijdliniaal, op de geselecteerde cursortijd. De cursor wordt donker op daghemel en licht op nachthemel; de labels krijgen passende inkt, ondergrond en meetpuntjes. Zonder hemel, bij Expressief uit, volgen deze elementen het app-thema.

Het klokvlaggetje sluit direct aan op de bovenkant van de cursorlijn. Het staat links, waar de meetwaarden aan de rechterkant vrij blijven. Aan de linkerwand van de tijdlijn wijkt het naar rechts uit. De klok en lijn delen één positionering. De bestaande tijdstappen, bediening en kaartklok blijven behouden.

De PO vraagt om een lokale kopie van de app op de dev-host om dit te bekijken. Lever een eigen HMR-preview met live data. De visuele iteratie gaat vooraf aan de merge en uitrol.

## Changelog
- 2026-10-11: PO-opdracht aangenomen; adaptieve cursor en klokvlag in uitvoering.
