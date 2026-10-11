# PM-proef — wolkenvormen op de Luchtkaart

PO-opdracht 2026-10-12: eerste vormenproef uit MIP-34. PM werkt met jj in de main-checkout. Geen satellietingest of wijziging aan de dataproductie. U76/U80 bevroren; `tools/skywatch/data/samples.csv` buiten commits.

De kaart gebruikt totale bedekking voor gaten/vormen en laag/midden/hoog plus de bestaande uurmiddel-CMF voor vormkarakter en licht. Fijnstructuur is illustratief en blijft vast aan kaartcoördinaten. De GPU interpoleert de uurframes. Dag/nacht en ontbrekende straling hebben een terugval; nul nachtstraling betekent geen loodgrijs dagweer.

Live HMR-preview op http://ageq-dev2:4390/. Eerst typecheck en zelf dag/nacht op 1280/390 bekijken; PO kiest daarna live. Geen e2e tijdens de opmaakiteratie. Volledige relevante merge-gate pas bij afronding.

Twee tijdelijke knoppen, uitsluitend via `?dev`, eigenaar PM/MIP-34, verval bij PO-keuze of uiterlijk 2026-10-19:

1. Wolkenbeeld: vormen / oude sluier, ter vergelijking op dezelfde data. Reset alle instellingen zet vormen terug.
2. Voorbeeldlucht: live / gaten / sluier / dicht. De laatste drie zijn gefingeerde conceptgevallen; labels, grafiek en tijd blijven live en worden niet als overeenstemmende metingen gepresenteerd. Voorbeeldlucht blijft niet tussen bezoeken bewaard; reset zet live terug.

LOG en receipts: genegeerde `web/tmp/orkestrator/cloud-map-live-20261012/`. Dag-/nachtbeelden, voorbeelden en kort afspelen zelf bekijken vóór "klaar". Voorbeeldmodus wordt na deze proef verwijderd of samen met de definitieve presentatie vastgesteld; geen dode opties.
