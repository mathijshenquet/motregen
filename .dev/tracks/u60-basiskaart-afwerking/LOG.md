# U60 — basiskaart-afwerking

## 2026-10-07T21:15:00Z — Start

- `git fetch origin main` + `git merge --ff-only origin/main`: exit 0; basis `7e8c33b`, inclusief contrastieve A/B-aanvulling.
- Spec, MIP-21, docs/basemap.md, tilemaker-profiel, publisher, snapshot en basemap-client gelezen. Devenv actief (`DIRENV_ACTIVE`, `IN_NIX_SHELL`).
- PO-PNG bekeken: het bestand toont de uurtabel, geen kaart. Eigen vaste A/B-views leveren het visuele bewijs.
- U59-tracklog is niet aanwezig in deze checkout; de broncheckout en bewaarde snapshot/tussenbestanden worden gezocht.
- Plan: Liberty-snapshot hergebruiken; groenklassen/rankfilters en nachtcontrast aanpassen, archief via publisher vernieuwen; vaste A/B in licht/donker met meettabel; gerichte checks en mobiele rig. Preview 4340, rig 4397/8397, aparte outDir.
- Dit LOG is op expliciet verzoek committed, append-only. Grote tussenbestanden staan onder het genegeerde `tmp/`.
