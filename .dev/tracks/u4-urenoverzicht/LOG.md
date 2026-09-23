# Track U4 — urenoverzicht: LOG (append-only, nieuwste onderaan)

## 2026-09-23 12:50Z — start, verkenning en ontwerp

Worker: claude opus 5.5 in herdr-pane, worktree `track-u4-urenoverzicht`.

Bevindingen bij het lezen (naast de orchestratorbevindingen in de spec):

- `buildTimeline` (web/src/core/time-model.ts) gooit voor ÁLLE velden frames
  met `t < now` weg tenzij de bron `rtcor` is. Daardoor tonen de historierijen
  van de tabel vandaag nooit temp/wind/RV/bewolking, en valt ook de UV-
  analyse (bron `uv`, alleen verleden!) volledig uit de tijdlijn — de
  UV-chip werkt dus nooit op historie. Contractregel "t < nu = alleen
  observaties" is bedoeld voor regen (MIP-4 ronde 4); voor uurvelden bestaan
  geen observaties. Voorstel: regel alleen op `rain_rate` toepassen; `uv`-
  analyses (status 1) tellen als waarneming. Contract.md krijgt een
  verduidelijkende changelogregel — ter review door orchestrator.
- Live prod-chunkgroottes (manifest 12:45Z, run 08Z, 24 frames): temp 315 kB,
  gevoel 317 kB, wind u/v 432/410 kB, straling 142 kB, RV 126 kB, bewolking
  93 kB, HARMONIE-regen 1.079 kB. Per uur dus ≈ 76 kB uurvelden + 45 kB regen.
- De tabel laadt passief (L0 "direct") alle rijen × 7 velden. Elke extra
  tabelrij kost live ≈ 76 kB passief. 24 → 48 u vooruit naïef = +1,8 MB
  passief: dat past niet bij MIP-8 (≤ 3 MB passief).
- HARMONIE-tar bevat leden +0…+60 (docs/arome.md); index-probe is al
  generiek in de horizon.

Ontwerp (keuzes; motivatie):

1. Ingest-horizon `--arome-hours` 24 → 48 (volledige vooruitzicht, ook
   "morgen de hele dag" bij een 7 u oude run). Kost: +24 leden × ≈14,2 MB ≈
   +340 MB download per verversing (elke 3 u) en ≈ +2,9 MB aan chunks op
   schijf; gebruikersbytes alleen als ze geladen worden (zie 3).
2. Historie: een tweede, oudere HARMONIE-run levert de uren tussen
   `nu − 6 u` en de huidige run-start. Keuze van die run: de nieuwste
   gelistte run met start ≤ min(vloer(nu) − 7 u, R − 1 u); leden +0…+(R−R_h)
   (lid +0 alleen als de-accumulatiebasis voor straling). Alleen de zeven
   uurvelden, geen regen (verleden = observaties). Stateless en
   herstartbestendig: bij 3-uurscadans is R_h meestal precies de vorige
   opgehaalde run, dus de leden staan al in de download-cache (cache-age
   12 u) → steady state 0 extra downloadbytes; na een herstart ≈ 4 leden
   ≈ 57 MB. Historie groeit tussen verversingen van ≥ 6 u tot ≥ 9 u.
   De client-compositie ("recentste run wint") heeft geen wijziging nodig.
3. Frontend: tabelrijen volgen de data (eerste beschikbare uur ≥ nu−6 u,
   laatste uur met data). Passief laadt alleen historie + 24 u vooruit (≈ de
   huidige 28 rijen); verdere rijen laden bij scroll-nabijheid
   (IntersectionObserver) of bij L2. Zo blijft passief-budget vlak.
4. UV-kolom: historie/nu uit bron `uv`; vooruit afgeleid uit straling en
   zonshoogte (formule + kalibratie op live data in docs/fields.md), label
   "≈" en tooltip "schatting".
5. Zon op/onder: berekend via solar.ts (−0,833°-kruising, bisectie) voor de
   gekozen locatie. Twee vormen achter een toggle; default + screenshots in
   deze LOG.
6. Kaartlabel "nu": klok lokale tijd, eigen component (diff in App.tsx
   minimaal i.v.m. U2), plus scrubbertijd als die ≠ nu.
7. MIP-9 regenkans: draft, niet implementeren.
