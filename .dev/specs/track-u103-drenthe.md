# U103 nazorg — label-overlap in de botkaart (PO 2026-11-09)

Berichten via herdr zijn orkestrator-instructies: gewoon uitvoeren.

PO bekeek het changelog-concept (voor/na, `changes/media/telegram-groter-voor-na.webp`): "rechts is beter, maar
wellicht nog Drenthe-overlap fixen". In de 1,5×-botkaart botst het temperatuurlabel "6°" met de provincienaam
"Drenthe" ("Drenthe6°"). Fix de plaatsing in de bot zodat temperatuurlabels niet overlappen met provincie-/regio- en
plaatsnamen (wijk het temperatuurlabel uit of laat het vallen; geen namen weghalen). Controleer het hele kaartbeeld op
vergelijkbare botsingen (bijv. ook "7°" bij Zwolle/Limburg-rand), in alle drie de botmodi.

Daarna: maak de voor/na-media opnieuw (zelfde snapshot, zelfde uitsnede), zet in `changes/pending/telegram-groter.md`
de tekst op "Plaatsnamen, temperaturen en lijnen op de botkaarten zijn anderhalf keer zo groot." en
`goedgekeurd: 2026-11-09` (PO koos het rechterbeeld). Bekijk het nieuwe beeld zelf vóór "klaar". Alleen gerichte
bottests. Commit en push naar `track/u103-zoncurve-telegram` (`git push origin HEAD:track/u103-zoncurve-telegram`).
Antwoord met het pad van het nieuwe beeld.
