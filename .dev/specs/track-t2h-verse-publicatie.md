# Track T2h — verse publicatie: radar mag nooit op seamless wachten (gpt-5.6-sol)

Read first: `AGENTS.md`, `.dev/tracks/t2-ingest/LOG.md` + `docs/seamless.md`,
en de live diagnose (orchestrator-LOG 2026-08-31 avond): op de VPS (2 vCPU)
kost de seamless-ensemblemediaan ~707 s per run; de poll-cyclus is serieel
en publiceert het manifest pas aan het eind → verse rtcor/nowcast-chunks
(gedecodeerd 19:45/19:51) zaten ~14 min ongepubliceerd terwijl het product
5-min-versheid belooft. Your LOG: `.dev/tracks/t2h-verse-publicatie/LOG.md`
— committed. Branch: `track/t2h-verse-publicatie`. Keys in `.env`.

## Taken

1. **Incrementele publicatie**: publiceer het manifest atomair ná élke
   bron-refresh (rtcor/nowcast/uv direct; seamless/AROME zodra klaar) in
   plaats van per volledige cyclus. De bestaande atomiciteit en pruning
   blijven; een halve bron mag nooit zichtbaar zijn, een verse bron altijd.
2. **Seamless van het kritieke pad**: de zware decode mag lopende
   radar-refreshes niet blokkeren (eigen thread of gefaseerde stap — kies
   en motiveer; let op geheugengedrag op 4 GB).
3. **Versnel de mediaan**: profileer de 707 s (NetCDF-gzip-decode van 20
   members × 72 leads) en versnel meetbaar — kandidaten: rayon over
   leads/members binnen de 2 cores, buffer-hergebruik, geen onnodige
   volledige-array-materialisatie. Meet met een 2-core-beperking
   (taskset/cgroup) als VPS-proxy; rapporteer vóór/na eerlijk.
4. **Receipt**: daemon-run waarin een seamless-decode kunstmatig traag
   is/loopt terwijl een nieuwe rtcor binnenkomt → manifest bevat de verse
   rtcor binnen ~60 s (test of gescripte assertie). Workspace-gates zoals
   altijd.

## Out of scope

Frontend, MQTT (aparte afweging), contract.
