# T2g data-dieet — werklog

## 2026-08-31T13:53:29Z — start en contractkaders

- Doel: de live `data/chunks`-werkset byte-voor-byte verklaren, veilige server-side resolutiewinsten implementeren en contractwijzigingen uitsluitend als concept-MIP voorleggen.
- Werkboom `track/t2g-data-dieet` was schoon op `50c62d0`; direnv heeft de project-`.envrc` toegestaan en de devenv is actief.
- Gelezen: trackspecificatie, `AGENTS.md`, MIP-2, MIP-4, `docs/perf.md`, `docs/grid.md`, `docs/mrf.md`, `docs/fields.md`, `docs/ingest.md` en `docs/contract.md`.
- Kaders: regen blijft op het 1km-grid; MIP-2 houdt v0 intra-only en `dict: null`; MIP-4 staat gereduceerde uurveldgrids toe. Frontend- en contractwijzigingen zijn buiten scope.
- Live invoer wordt alleen gelezen uit `/home/mthq/motregen/data/chunks`; meetwerk gebeurt op kopieën of afgeleide data in een lokale tijdelijke map.
- Volgende stap: manifest/chunks inventariseren, mrf-frames decoderen en een reproduceerbare analyse voor veldgrootte, no-data, subsampling, dictionary, delta en sessietransfers bouwen.
