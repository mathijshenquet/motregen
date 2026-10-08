# U63 — temperatuurvoorbereiding na eerste volledige kaartpaint

Eigenaar U63; vervalt 2026-10-09. Geïsoleerde proef op cd0d63e inclusief U62deel2/U67 en losse z4. Alleen ?dev plus VITE_TEMPERATURE_START=after-map.

Het CPU-profiel wijst blurField/prepareField op de hoofddraad aan in het venster waarin MapLibre de eerste echte tegels verwerkt. De normale optionele temperatuurvoorbereiding start via idle met1s timeout na eerste regendraw. Deze proef stelt uitsluitend dat voorwerk uit tot de volledige kaart een frame heeft getekend; de zichtbare temperatuurmodus kan zijn eigen werk direct blijven starten. Bij een defecte kaartbron is dit optionele voorwerk niet nodig om regen te spelen.

Gepaard A/B om en om, po-android/eigenU60/quota40/GRID6, koud én warm×3, startload≤16 per run. Warm = nieuwe volledige browser met gevulde HTTP+SW-diskcache. ttfr/ttfp en eerste-kaartbeeld bovenaan; LoAF ná ttfp bewaker. Absolute baselines≤8 blijven apart. Niet op hoofdbranch voordat beide cachescenario's gemeten zijn.
