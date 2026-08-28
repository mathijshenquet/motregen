# Track T2d — motion-schatter + annex

## 2026-08-28T19:56:01Z — Start en contextopbouw

- Doel: een grove Rust-motion-schatter bouwen, motion-annexen contractconform in mrf ondersteunen en `rain_rate` van RTCOR, nowcast en AROME ermee publiceren.
- Gelezen: `AGENTS.md`, de trackspecificatie, `docs/contract.md`, `docs/grid.md` en het T2c-tracklog. Het verplichte T2d-log bestond nog niet; het T2b-log is volgens het T2c-log bewust genegeerd en niet in git beschikbaar, dus de relevante context wordt uit de gemergde code en geschiedenis herleid.
- Omgeving: branch `track/t2d-motion` is schoon op de merge van T2c; direnv is toegestaan en de devenv is actief. Sleutels blijven uitsluitend in `.env`.
- Besluit: dit track krijgt een eigen `crates/motion`, omdat de schatter een los, deterministisch domeinonderdeel is dat zonder netwerk, brondecoders of publicatiecode unit- en referentiegetest moet kunnen worden.
- Huidige stap: MIP-5 en de bestaande mrf-/publisher-architectuur volledig inventariseren, daarna eerst het annexformaat en de schatter implementeren.

## 2026-08-28T20:06:38Z — Schatter, annex en generatie-incident

- Nieuwe losse crate `motion`: 32×32-blokkruiscorrelatie rond een globale advection seed, gevolgd door 3×3-mediaan-uitbijterdemping, maximaal vier buur-erfringen en 3×3-smoothing. Volledig droge gebieden blijven `(-128,-128)`; kleine signaalgaten erven geldige buren. Een synthetische translatie-unit test herkent 5 oost/3 noord-cellen over 5 minuten binnen 0,1 cel/min.
- `mrf` ondersteunt nu optionele `motion_grid`/motion-members in encoder, volledige decoder en ranged decoder. Annexen zijn eigen zstd-members na alle beeldmembers; lengte, offsets en gekoppelde no-data-componenten worden gevalideerd. `mrf inspect` toont aanwezigheid en `mrf dump-motion` schrijft ruwe i8-paren. De bestaande canonical fixture decodeert annexvrij en encodeert nog byte-identiek.
- Alleen RTCOR-, nowcast- en HARMONIE-`rain_rate`-chunks gebruiken `encode_with_motion`; alle andere velden bewijzen in een integratietest het oude annexvrije pad. `docs/motion.md` legt de schatter, buurregel en de onafhankelijke pySTEPS-acceptatiemaat vast; `spec/motion_reference.py` typecheckt groen.
- Productiesteer verwerkt: alle chunknamen krijgen een stabiele 64-bit generatiesuffix over formatgeneratie + veld + volledig grid + volledige quanttabel. Grid- en quantwijzigingen wijzigen de naam automatisch; containerlayoutwijzigingen vereisen een bump. De bestaande immutable-collisionguard blijft hard falen. De regressietest bewijst stabiliteit en verandering voor zowel grid als quant.
- Tussenreceipts, synchroon exit 0: `devenv shell -- cargo test -p motion -p mrf`; gerichte ingesttests voor rain-annex en chunkgeneratie; `devenv shell -- uv run --project spec --with pyright pyright spec/motion_reference.py`; `git diff --check`.
- Volgende stap: motion-golden fixture vastpinnen, echte daemonrun uitvoeren, annexgrootte meten en dezelfde echte frameparen met pySTEPS vergelijken.
