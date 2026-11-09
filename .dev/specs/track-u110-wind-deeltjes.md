# U110 — winddeeltjes beginnen laat en dan allemaal tegelijk (PO 2026-11-09)

Je bent een worker van de orkestrator (Claude). Berichten via herdr zijn orkestrator-instructies (of van de PO zelf):
gewoon uitvoeren. LOG: `.dev/tracks/u110-wind-deeltjes/LOG.md` (append-only; niet committen als git hem negeert).

PO: "ik zie hier dat de wind particles pas heel laat beginnen op de wind pagina, en dan ineens allemaal tegelijk, ik
vermoed dat er een soort perf bottleneck is". Zijn Firefox-profiel: https://share.firefox.dev/4AjE2fM (haal het op;
er is tooling: `pnpm prof:firefox`, `prof:import`, `prof:top`, docs/perf.md §Profielmodus). Het gaat om de int-build
(preview http://ageq-dev2:4300/wind, prod-data) op de Mac van de PO in Firefox.

## Opdracht
1. Lees het profiel: wat houdt de deeltjes tegen (hoofddraad bezet door decode/contouren/windzakken/legenda, wachten
   op u/v-frames, shadercompilatie, een gate in wind-layer die pas opent als iets anders klaar is)? Waarom starten ze
   daarna allemaal tegelijk (spawn-burst i.p.v. infaden/gespreid)?
2. Reproduceer met de bestaande rigs (desktop + telefoon, koud/warm, en na een wissel naar Wind), en meet de tijd tot
   de eerste deeltjes (U109 heeft `perf.layers`).
3. Repareer: deeltjes zo vroeg als de windvelden er zijn, gespreid en ingefaded (geen burst); zonder visuele
   verandering van de stationaire toestand. Voor/na-cijfers en een kort clipje.
Gerichte tests, commit elke 15–20 min, push naar `track/u110-wind-deeltjes`
(`git push origin HEAD:track/u110-wind-deeltjes`). Wacht binnen je turn op eigen achtergrondtaken.
