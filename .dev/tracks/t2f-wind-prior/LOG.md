# Track T2f — modelwind als gekalibreerde motion-baseline

## 2026-08-31T09:33:58Z — Start en contextopbouw

- Doel: de bestaande correlatieschatter met een per AROME-run gekalibreerde modelwindbaseline uitbreiden, zonder het motion-annexcontract of de gepubliceerde 10m-windvelden te wijzigen.
- Gelezen: `AGENTS.md`, de trackspecificatie, `docs/mrf.md`, `docs/fields.md`, het T2d-tracklog en de bovenste projectlogcontext. De verplichte tracklog bestond nog niet en is daarom aangemaakt als gecommit artefact.
- Omgeving: branch `track/t2f-wind-prior` is schoon op `origin/main`; direnv is toegestaan en geladen. Sleutels blijven uitsluitend in de genegeerde `.env`.
- Huidige stap: MIP-5 inclusief amendement, `docs/arome.md`, de motion-crate, AROME-decoder en publisher volledig inventariseren; daarna het hoogste werkelijk aanwezige p1-windniveau met de geregistreerde KNMI-sleutel vaststellen.

## 2026-08-31T09:51:56Z — p1-inventaris en eerste implementatie

- Werkelijke T1-fixture `HA43_N20_202608281200_00100_GB` met ecCodes geïnventariseerd: exact 49/49 berichten; tabel 253 parameters 33/34 staan op 10, 50, 100, 200 en 300 m (leveltype 105/ecCodes `sfc`). Hoogste p1-paar 300 m is dus gekozen als uitsluitend interne motion-input; p3 blijft buiten scope.
- `knmi-grib` decodeert nu naast de ongewijzigde publieke 10m-wind ook het afzonderlijke 300m-U/V-paar. De ingest reduceert dit naar het 32km-motionblokgrid, zet m/s met de lokale Web-Mercatorschaal en omgekeerde raster-y om naar cellen/minuut en interpoleert lineair in de modeltijd (buiten het runvenster dichtstbijzijnde eindframe).
- De motion-crate levert nu correlatievectoren met betrouwbaarheid uit genormaliseerde correlatie, piekscherpte en blokenergie. Sterk is `confidence >= 0,75`; minimaal 12 sterke blokken fitten gewogen least squares `s·R(θ)` met `s ∈ [0,5; 2,5]` en `|θ| ≤ 60°`. Te weinig blokken hergebruikt de vorige bronrunfit, daarna default `s=1, θ=0`.
- Toepassing volgt het amendement: sterke blokken blijven correlatie, matige blokken mengen met correlatiegewicht, lege blokken krijgen de gekalibreerde wind; de bestaande ruimtelijke smoothing volgt daarna. Annexvorm en kwantisatie blijven ongewijzigd. Regenchunknamen dragen windrun, exacte kalibratiebits en encodeergeneratie 2 om immutable collisions bij een gewijzigde prior of fallback te voorkomen.
- Daemon bouwt AROME voortaan eerst, herbouwt andere regenbronnen bij een nieuwe windrun en logt bron/run, `s`, `θ`, betrouwbare-bloktelling en fit/fallback op INFO.
- Tussenreceipt: `direnv exec /home/mthq/motregen cargo check --workspace` exit 0. Gerichte tests compileerden en alle motion-/GRIB-/ingesttests behalve één nieuwe strikte float-gelijkheid waren groen; die test zag `0,20000002` versus `0,2` en is naar een passende tolerantie gecorrigeerd. Volgende stap: gerichte suite opnieuw groen, documentatie/harnas uitbreiden en de eerste commit publiceren.

## 2026-08-31T09:55:40Z — Kernpad groen en eerste reviewpunt

- `docs/arome.md` documenteert de echte p1-windinventaris, de keuze voor 300 m, het ongemoeide 10m-publicatiepad en de logreeks als beslissignaal voor een eventuele latere p3-track. `docs/motion.md` documenteert de betrouwbaarheidsdefinitie, N=12, clamps, fallbackketen en mengvolgorde.
- `spec/motion_reference.py` kan nu een byte-identiek framepaar vóór/na vergelijken, eist dat de mediaanfout op gemeenschappelijke signaalblokken niet verslechtert, rapporteert totale en verse-cel-vulgraad en tekent beide Rustvelden naast pySTEPS in één quiver-artefact.
- Synchrone tussenreceipts, alle exit 0: `direnv exec /home/mthq/motregen cargo test -p motregen-ingest -p motion -p knmi-grib`; `direnv exec /home/mthq/motregen uv run --project spec --with pyright pyright spec/motion_reference.py` (0 fouten); `git diff --check`.
- Volgende stap: deze coherente implementatie committen en als draft-PR publiceren; daarna oude/nieuwe daemonruns op hetzelfde echte bronpaar uitvoeren, fitwaarden/vulgraad/pySTEPS meten en op basis daarvan de betrouwbaarheidskalibratie zo nodig bijstellen.
