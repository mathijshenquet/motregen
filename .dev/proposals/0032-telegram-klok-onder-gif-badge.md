# MIP-32 — Telegram-klok onder de GIF-badge

Status: accepted (PO 2026-10-11) · auteur: PM (sol)

## Het probleem
Telegram zet een GIF-badge linksboven op de films. Deze bedekt de klok die de Rust-renderer sinds U76 aan de boven- en linkerrand tekent. In de aangeleverde screenshot is de badge ongeveer 40 pixels hoog en begint hij 8 pixels onder de kaartbovenkant: zijn onderkant ligt op circa 48 pixels.

## Eerder werk
MIP-29 verplaatst de kaartfilms naar Rust; U76 maakte de klokhoek met tijd, datum en titel, inclusief de gekozen schuifovergang. U80 integreerde dit voor regen, wind en gevoelstemperatuur. Een plaatsingsmockup vergelijkt de bovenrand, 16 pixels vanaf de top en 16 pixels onder de badge: http://ageq-dev2:4397/review/telegram-clock-mockup/.

## Aanbeveling
Verplaats het hele klokvak naar 64 pixels vanaf de kaartbovenkant in de screenshotweergave. Dan blijft 16 pixels ruimte onder de badge. De kaart is daar 576 pixels breed; bij de werkelijke video van 960 pixels breed komt dit afgerond overeen met **107 uitvoerpixels**. Houd het vak tegen de linkerrand en rond beide rechterhoeken af. Tijd, datum, titel en animatie bewegen samen; labeluitsluiting volgt het vak.

Dit is een vaste rasterpositie gebaseerd op de aangeleverde screenshot. De omvang van de Telegram-badge kan per client en schermschaal verschillen.

## Besluit
De PO keurde de mockup en voorkeur op 2026-10-11 goed: "ja prima doe maar". Voer de hierboven beschreven positie en hoeken uit voor de gedeelde Rust-overlay van alle drie kaartmodi, inclusief stills. Behoud de tijdstappen, schuifovergang, kleuren, kaartuitsnede en voettekst. Gate en visuele controle gaan vooraf aan de hotfix-uitrol.

Aanvulling van de PO op 2026-10-11: breek de titel voor gevoelstemperatuur af als **Gevoels-** en **temperatuur** op twee regels. Het vak past zich aan de breedste regel en de extra regelhoogte aan; de klokpositie en beide rechterhoeken blijven gelijk.

## Changelog
- 2026-10-11: screenshot gemeten, mockup zelf bekeken op desktop/mobiel en dag/nacht; PO kiest de voorgestelde positie.
- 2026-10-11: geïmplementeerd in PR 111 en uitgerold vanaf main `7c9a84a6`. De volledige onafhankelijke gate is groen; drie nieuwe productiefilms zelf bekeken en volledig afgespeeld. Rust-cacheversie 31 vernieuwt films en stills ook bij dezelfde brondata. Productiebeelden: http://ageq-dev2:4397/review/telegram-clock-hotfix/prod/.
- 2026-10-11: de tweeregelige titel geïmplementeerd in PR 112 en uitgerold vanaf main `71ae5f31`, met Rust-cacheversie 32. De onafhankelijke gate is groen; dag- en nachtstills en de complete film zelf bekeken. Ook een nieuwe productiefilm gecontroleerd en volledig afgespeeld. Beelden: http://ageq-dev2:4397/review/feels-title-hotfix/; productie: http://ageq-dev2:4397/review/feels-title-hotfix/prod/.
