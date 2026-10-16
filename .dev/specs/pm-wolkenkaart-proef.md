# PM-proef — wolkenvormen op de Luchtkaart

PO-opdracht 2026-10-12: eerste vormenproef uit MIP-34. PM werkt met jj in de main-checkout. Geen satellietingest of wijziging aan de dataproductie. U76/U80 bevroren; `tools/skywatch/data/samples.csv` buiten commits.

De kaart gebruikt totale bedekking voor gaten/vormen en laag/midden/hoog plus de bestaande uurmiddel-CMF voor vormkarakter en licht. Fijnstructuur is illustratief; de GPU interpoleert de uurframes. Dag/nacht en ontbrekende straling hebben een terugval; nul nachtstraling betekent geen loodgrijs dagweer.

PO-feedback 2026-10-12: textuur stond stil en vertoonde ringen bij een overgang tussen wolkentypen. Tweede proef: typen krijgen eigen vaste patrooncoördinaten en mengen hun optische dichtheid. Een stromingsveld volgt de bestaande 10m-modelwind als bewegingsproxy; dit is nog geen gemeten wind op wolkenhoogte. Per fragment loopt de GPU het veld met midpoint-integratie terug. Twee overlappende levensduren van twee modeluren vernieuwen detail bij nul gewicht, zodat terugschuiven hetzelfde beeld geeft. Reizen verder dan één uur houden het windveld van één uur vóór de cursor aan; die grens volgt de cursor continu.

Ronde 3: de extra dichtheidsfactor uit de grondwind is verwijderd na PO-feedback over sterke hoekige verdichting. Regionale modelbedekking blijft de bron; de 10m-wind is alleen een voorlopige bewegingsproxy. Twaalf midpoint-stappen per levensduur. GPU-checks bewaken beweging, optische type-menging, uur-/levensduurgrenzen, reproduceerbaar terugschuiven en dat compressie geen extra optische dichtheid veroorzaakt.

Live HMR-preview op http://ageq-dev2:4390/. Eerst typecheck en zelf dag/nacht op 1280/390 bekijken; PO kiest daarna live. Geen e2e tijdens de opmaakiteratie. Volledige relevante merge-gate pas bij afronding.

Twee tijdelijke knoppen, uitsluitend via `?dev`, eigenaar PM/MIP-34, verval bij PO-keuze of uiterlijk 2026-10-19:

1. Wolkenbeeld: vormen / oude sluier, ter vergelijking op dezelfde data. Reset alle instellingen zet vormen terug.
2. Voorbeeldlucht: live / gaten / sluier / dicht / overgang. De laatste vier zijn gefingeerde conceptgevallen; labels, grafiek en tijd blijven live en worden niet als overeenstemmende metingen gepresenteerd. Voorbeeldlucht blijft niet tussen bezoeken bewaard; reset zet live terug.

LOG en receipts: genegeerde `web/tmp/orkestrator/cloud-map-live-20261012/`. Dag-/nachtbeelden, voorbeelden en kort afspelen zelf bekijken vóór "klaar". Voorbeeldmodus wordt na deze proef verwijderd of samen met de definitieve presentatie vastgesteld; geen dode opties.

Ronde 2: `web/tmp/orkestrator/cloud-flow-20261012/`, met `gpu.mjs` als echte WebGL-proef, JSON-metrieken, voor/na 17:56, dag/nacht1280/390 en afspeelbeelden. Dit zijn gerichte prototypechecks; merge-gate en apparaatmeting volgen na de PO-beeldkeuze.

Ronde 3: regen tijdelijk uit in Lucht op PO-verzoek. Fijn detail behouden, aangevuld met celstructuren en bredere gebieden naar satellietreferenties uit MIP-34. Kleurenpalet gelijk. Receipts in genegeerde `web/tmp/orkestrator/cloud-cologne-20261012/`; zelf 13 oktober 03:00 plus dag, desktop/mobiel en afspelen bekijken.

Nederlandse referentieronde en perf-diagnose: `web/tmp/orkestrator/cloud-nl-20261012/`. Twee beeldrondes met bevroren manifest; vaste bronnen/aanpak in MIP-34. Software-microbenchmark met readback en drie gepaarde runs. Voorberekende structuren/stroming zijn nog niet geïmplementeerd; dit is geen mobiele performancegate.

Performancevervolg 2026-10-16: de beweging wordt nu vooraf op halve breedte/hoogte van de wolkenvulling berekend. RGBA32F bewaart twee verplaatsingen; handmatig bilineair samplen vereist geen float-linear-extensie. Textuur en twaalf midpoint-stappen blijven gelijk. Zonder float-renderdoel en langs de viewport-/modelrand geldt de oorspronkelijke directe berekening. Camerabeweging, tijd, stijl en bronversie verversen beide passes; resources worden bij verwijderen vrijgegeven. Eerst kwartresolutie verworpen op beeldfout bij sterke compressie. GPU-oracle, zes directe/cache-beeldvergelijkingen en gepaarde benchmark: `direnv exec . bash -c 'flock /home/mathijs/motregen-perf.lock node web/tmp/orkestrator/cloud-perf-20261016/gpu.mjs'`. Dit is een software-GPUmeting inclusief twee passes/readback, geen mobiele eindgate. Appdiagnostiek geeft nu afzonderlijk `flowMs` en `fillMs`.

Vervolg 16 oktober: main U82/U83 gemerged. De eerdere 10m-proxy is vervangen door de regen-motionannex; geen windfallback. Levensduur nu 30 minuten met twee overlappende banken (15 minuten verschil), om cumulatieve rek te begrenzen. Details en beperkingen in MIP-34. Vaste U82-data op http://ageq-dev2:4398/lucht/utrecht, live data op4390. Gerichte checks/beelden in web/tmp/orkestrator/cloud-motion-20261016/.
