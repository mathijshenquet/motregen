# Track T2h — verse publicatie

## 2026-08-31T20:02:00Z — Start en ontwerpverkenning

- Doel: iedere afgeronde bronrefresh direct atomair publiceren, seamless buiten het radar-kritieke pad uitvoeren en de ensemblemediaan onder een 2-corelimiet meetbaar versnellen.
- Gelezen: `AGENTS.md`, trackspecificatie, orchestratorlog, `.dev/tracks/t2-ingest/LOG.md`, `docs/seamless.md` en de betrokken ingest-/HDF5-code.
- Omgeving: de project-`.envrc` gecontroleerd en lokaal toegestaan; `direnv exec .` levert het devenv met Rust 1.97.1, Cargo 1.97.0, pnpm 11.21.0 en `taskset`.
- Eerste diagnose: `poll()` decodeert alle bronnen serieel en roept pas één keer `publish()` aan. `decode_seamless()` leest per lead een volledige 20×780×780-slice, houdt daarna alle 47 floatframes vast en berekent 28,6 miljoen celmedianen serieel.
- Ontwerprichting: één begrensde seamless-workerthread met maximaal één taak/resultaat houdt radar vrij en begrenst geheugen; de hoofdthread blijft als enige daemonstaat en manifest muteren. Publicatie volgt direct na iedere succesvolle state-update.
- Volgende stap: representatieve live-file cachen, 2-corebaseline en profiel verzamelen, daarna decoder en daemonstatus refactoren met deterministische tests.
