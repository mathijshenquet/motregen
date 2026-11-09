# U101 ronde 3 — windzak definitief (PO 2026-11-09)

PO koos de **windzak**. Maak hem definitief en verwerk vier punten. Voor de punten met een open smaakvraag:
lever 2–3 varianten achter `?dev&...` (in docs/dev-opties.md, eigenaar U101, vervalt 2026-11-23) en kies een default.

1. **Tween.** Nu schokt de zak per frame/uur. Interpoleer richting (kortste hoek) en sterkte continu met de
   kaarttijd, bij scrubben én afspelen. Geen sprongen bij een uurgrens.
2. **Kromming die met de stroming meebuigt, momentum-achtig.** De staart volgt niet een rechte lijn maar buigt mee:
   (a) ruimtelijk: de staart volgt een kort stuk stroomlijn bovenstrooms uit het windveld; en/of
   (b) in de tijd: als de wind draait, loopt de staart iets achter (traagheid), zodat de zak zichtbaar meedraait.
   Lever als varianten `?dev&kromming=stroom|traag|beide`, kies zelf een default.
3. **Geen zwarte schijfjes met cijfers meer.** Het getal staat op de zak zelf en draait mee, in het kleurschema van de
   zak (bijv. wit op een oranje baan of oranje op wit), altijd rechtop leesbaar (niet ondersteboven: flip bij > 90°).
   Het getal volgt de eenheidsinstelling van de gebruiker (Bft/knopen/… zoals de tabel nu doet; zoek de bestaande
   instelling, maak geen nieuwe). Zorg dat het op de telefoon leesbaar blijft.
4. **Trilling bij harde wind** als visuele maat voor hoe hard het waait: vanaf ±6 Bft fladdert de staart, amplitude en
   frequentie groeien met de windkracht. Respecteer `prefers-reduced-motion`. Animatie mag niet continu frames
   renderen als niets beweegt en er geen harde wind in beeld is; meet de kosten met de bestaande PerfHud/perf:modes
   op telefoonprofiel en noem het getal. Varianten voor de drempel/sterkte mag, één default.

Daarna: de dev-opties `vaan=` en `wind=` verdwijnen (windzak + jouw gekozen achtergrond worden de windmodus),
en de bot (Telegram-filmpjes) gebruikt dezelfde zak; de trilling mag daar mee.

Werkwijze: alleen gerichte unit-tests en eventueel je eigen desktop-spec; geen volledige suites. Bekijk je eigen
screenshots vóór je "klaar" zegt. Lever: (a) een vergelijkingsblad telefoon+desktop+tabel, (b) een kort mp4-clipje
van scrubben/afspelen met harde wind (zoek een moment met ≥ 6 Bft in de data of forceer via een dev-vlag), paden
in je antwoord. Commit en push naar track/u101-windmodus (`git push origin HEAD:track/u101-windmodus`); de
orkestrator merget naar int. Houd je LOG bij.

5. **(PO, nagekomen) Geen regenlaag in de windmodus.** Haal de regenoverlay weg in kaartmodus Wind (nu "vast
   vermenigvuldigen", zie `rainPresentation` in `focus-mode.ts`). Alleen de kaart; de regen in het histogram/tabel blijft.
   Ook in de bot-render van de windmodus.

6. **(PO, nagekomen) Windzakken alleen in de windmodus.** Op int zijn ze in Gevoel nog (gedimd) zichtbaar op de
   kaart, met hun schijfjes. Op de kaart: alleen in kaartmodus Wind, in alle andere modi helemaal weg (ook niet
   gedimd). De windkolom in de tabel blijft in alle modi. Geldt ook voor de bot.
   Precisering PO: het gebeurt NA wisselen van Wind naar Gevoel — de zakken faden niet goed mee uit en blijven
   half zichtbaar staan. Bij het wisselen moeten ze in dezelfde overgang als de andere lagen naar 0 faden (niet naar
   een dim-niveau) en daarna niet meer tekenen; omgekeerd netjes infaden bij wisselen naar Wind. Reproduceer eerst
   (Wind → Gevoel, ook snel heen-en-weer) en voeg een gerichte test toe.

7. **(PO, na ronde 3) Getal op de zak is niet leesbaar.** Nieuw ontwerp: een witte cirkel (badge) op de zak die de
   zak wegsnijdt (de zak wordt onder/om de cirkel weggeknipt, geen overlap), met daarin het getal in de oranje
   zakkleur. Cirkel en getal staan rechtop (draaien niet mee), positie op de zak volgt de zak. Zorg dat het op de
   telefoon goed leesbaar is en neem het mee in de bot. Doe dit vóór/samen met de bot-ronde; lever een close-up
   (telefoon + desktop) die ik naast de oude kan leggen.
