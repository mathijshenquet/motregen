# U63 — eerste kaartbucket versus eerste regendecode

Eigenaar U63; vervalt2026-10-09. Alleen ?dev en VITE_START_PRIORITY=map of rain.
map: decodejobs wachten op eerste basemap-sourcedata met event.tile (MapLibre geeft hierbij geen sourceDataType=content); 10s fallback tegen een defecte kaartbron. Regenranges en workeropwarming blijven vroeg.
rain: MapLibreconstructie wacht op eerste regendecode aan de cursor; stijl/manifest/ranges al vroeg.
Twee afzonderlijke afwisselende A/B-paren, elk koud/warm×3 op huidige U62/U65-basis; load≤16 en per-opname-flock, quota40 ongewijzigd. Absolute baselines≤8 blijven apart. ttfr/ttfp en LoAF ná ttfp beslissen, geen productie-integratie zonder koude én warme winst en kostengates.
