# PM-proef — wolkenvormen op de Luchtkaart

PO-opdracht 2026-10-12: eerste vormenproef uit MIP-34. PM werkt met jj in de main-checkout. Geen satellietingest of wijziging aan de dataproductie. U76/U80 bevroren; `tools/skywatch/data/samples.csv` buiten commits.

De kaart gebruikt totale bedekking voor gaten/vormen en laag/midden/hoog plus de bestaande uurmiddel-CMF voor vormkarakter en licht. Fijnstructuur is illustratief; de GPU interpoleert de uurframes. Dag/nacht en ontbrekende straling hebben een terugval; nul nachtstraling betekent geen loodgrijs dagweer.

PO-feedback 2026-10-12: textuur stond stil en vertoonde ringen bij een overgang tussen wolkentypen. Tweede proef: typen krijgen eigen vaste patrooncoördinaten en mengen hun optische dichtheid. Een stromingsveld volgt de bestaande 10m-modelwind als bewegingsproxy; dit is nog geen gemeten wind op wolkenhoogte. Per fragment loopt de GPU het veld met midpoint-integratie terug. Twee overlappende levensduren van vier modeluren vernieuwen detail bij nul gewicht, zodat terugschuiven hetzelfde beeld geeft. Reizen verder dan één uur houden het windveld van één uur vóór de cursor aan; die grens volgt de cursor continu.

De oppervlaktevervorming van de teruggevolgde kaart bepaalt de dichtheidsfactor: compressie verdicht, uitstromen verdunt. Factor begrensd op 0,25–4; een numeriek gevouwen kaart valt terug op lokale translatie. Meng optische dichtheden en zet ze om naar dekking; de actuele modelbedekking blijft de regionale bron. Dit is een begrensde visuele compensatie, geen volledige conservatieve wolkenmassasimulatie. Valideer echte GPU-uitvoer op uniforme beweging, compressie/dilutie, uur-/levensduurgrenzen, terugschuiven en een ruimtelijke type-overgang; beelden zelf bekijken.

Live HMR-preview op http://ageq-dev2:4390/. Eerst typecheck en zelf dag/nacht op 1280/390 bekijken; PO kiest daarna live. Geen e2e tijdens de opmaakiteratie. Volledige relevante merge-gate pas bij afronding.

Twee tijdelijke knoppen, uitsluitend via `?dev`, eigenaar PM/MIP-34, verval bij PO-keuze of uiterlijk 2026-10-19:

1. Wolkenbeeld: vormen / oude sluier, ter vergelijking op dezelfde data. Reset alle instellingen zet vormen terug.
2. Voorbeeldlucht: live / gaten / sluier / dicht / overgang. De laatste vier zijn gefingeerde conceptgevallen; labels, grafiek en tijd blijven live en worden niet als overeenstemmende metingen gepresenteerd. Voorbeeldlucht blijft niet tussen bezoeken bewaard; reset zet live terug.

LOG en receipts: genegeerde `web/tmp/orkestrator/cloud-map-live-20261012/`. Dag-/nachtbeelden, voorbeelden en kort afspelen zelf bekijken vóór "klaar". Voorbeeldmodus wordt na deze proef verwijderd of samen met de definitieve presentatie vastgesteld; geen dode opties.

Ronde 2: `web/tmp/orkestrator/cloud-flow-20261012/`, met `gpu.mjs` als echte WebGL-proef, JSON-metrieken, voor/na 17:56, dag/nacht1280/390 en afspeelbeelden. Dit zijn gerichte prototypechecks; merge-gate en apparaatmeting volgen na de PO-beeldkeuze.
