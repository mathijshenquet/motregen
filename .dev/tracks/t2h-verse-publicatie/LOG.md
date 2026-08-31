# Track T2h — verse publicatie

## 2026-08-31T20:02:00Z — Start en ontwerpverkenning

- Doel: iedere afgeronde bronrefresh direct atomair publiceren, seamless buiten het radar-kritieke pad uitvoeren en de ensemblemediaan onder een 2-corelimiet meetbaar versnellen.
- Gelezen: `AGENTS.md`, trackspecificatie, orchestratorlog, `.dev/tracks/t2-ingest/LOG.md`, `docs/seamless.md` en de betrokken ingest-/HDF5-code.
- Omgeving: de project-`.envrc` gecontroleerd en lokaal toegestaan; `direnv exec .` levert het devenv met Rust 1.97.1, Cargo 1.97.0, pnpm 11.21.0 en `taskset`.
- Eerste diagnose: `poll()` decodeert alle bronnen serieel en roept pas één keer `publish()` aan. `decode_seamless()` leest per lead een volledige 20×780×780-slice, houdt daarna alle 47 floatframes vast en berekent 28,6 miljoen celmedianen serieel.
- Ontwerprichting: één begrensde seamless-workerthread met maximaal één taak/resultaat houdt radar vrij en begrenst geheugen; de hoofdthread blijft als enige daemonstaat en manifest muteren. Publicatie volgt direct na iedere succesvolle state-update.
- Volgende stap: representatieve live-file cachen, 2-corebaseline en profiel verzamelen, daarna decoder en daemonstatus refactoren met deterministische tests.

## 2026-08-31T20:17:00Z — 2-corebaseline en faseprofiel

- Productiepad gemeten met de ongewijzigde releasebinary, `taskset -c 0,1`, live bestand `KNMI_PYSTEPS_BLEND_ENS_202608312005.nc`, 48 frames (+125…+360). Seamless totaal: 266,03 s; een eerdere ongewijzigde run op dezelfde host: 258,92 s.
- Tijdelijke fase-instrumentatie: HDF5/gzip-read 25,66 s en alle broncelmedianen 2,05 s. Daarmee zit circa 238,3 s (89,6%) ná de NetCDF-mediaan in gather/kwantisatie en vooral de seriële motioncorrelatie/encoding.
- Volledige baseline-run: 484,23 s wall, 447,19 s user, 9,26 s system, 94% van één CPU en maximaal 246.800 kB RSS. Exacte uitvoer: `data/t2h-profile-before.log` (gitignored).
- Besluit aangescherpt: frameparen voor motion begrensd parallel over maximaal twee threads; seamless blijft als geheel één achtergrondtaak. De decoder wordt iterator-gebaseerd zodat bronframes niet alle 48 tegelijk als floatarrays in geheugen blijven; gather+kwantisatie krijgt geen tijdelijke volledige float-doelarray meer.
- Volgende stap: iterator/gather-optimalisatie en achtergrondworker implementeren; daarna dezelfde live input en CPU-affiniteit nameten.

## 2026-08-31T20:45:00Z — Implementatie en geoptimaliseerde live-meting

- Incrementele publicatie: na iedere geslaagde AROME-, RTCOR-, nowcast-, UV- of seamless-state-update wordt meteen een volledig atomisch manifest geprobeerd. Een dirty vlag bewaart een mislukte publicatie voor retry; startup publiceert al met AROME+RTCOR en voegt de overige bronnen later atomisch toe.
- Seamless-worker: precies één achtergrondtaak; alleen de hoofdthread accepteert het resultaat en muteert daemonstaat/manifest. Een resultaat met een verouderde AROME-windrun wordt verworpen. De daemon blijft tijdens decode iedere radarcadans pollen.
- Geheugen/CPU: `SeamlessDecoder` levert één bronframe per keer; gather en regenkwantisatie maken geen tijdelijke float-doelarray. Motion-frameparen en mrf-framecompressie gebruiken ieder een eigen pool van exact twee threads; gewone radarbronnen blijven inline en delen dus geen wachtrij met seamless.
- Profielvondst: `mrf::quantize` bouwde en valideerde voor ieder doelpunt opnieuw de 256-entry regentabel (~81 miljoen keer/run). De tabel is nu één `LazyLock`; parallelle mrf-encoding is byte-identiek getest.
- 2-core live-nameting (`taskset -c 0,1`, 48 frames): seamless 32,616 s tegenover 266,031 s = 8,16× sneller. Fasen: framevoorbereiding 27,577 s; motion+encoding 4,396 s. Volledige `--once`: 44,33 s tegenover 484,23 s. Max-RSS 352.816 kB tegenover 246.800 kB; 8,6% van 4 GB.
- Live publicatiereceipt in dezelfde run: manifest om 20:43:00Z direct na RTCOR (9 chunks), 20:43:05Z na nowcast (10), 20:43:09Z na UV (11), 20:43:38Z na seamless (12). Exacte output: `data/t2h-profile-after-optimized.log` (gitignored).
- Gerichte synchrone receipts exit 0: slow-seamless-test (kunstmatig 1 s, verse RTCOR-publicatie terwijl worker nog liep), partial-startup-test, h5py seamless-cross-check, byte-identieke parallelle mrf-encoding, quantisatieregels en strict clippy voor de gewijzigde crates.
- Volgende stap: documentatie/commit/draft-PR, volledige workspace-gates en live spotcheck van de geproduceerde seamless-chunk.
