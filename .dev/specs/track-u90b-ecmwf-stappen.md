# U90b — ECMWF ook per tijdstap publiceren (MIP-36, PO-aanvulling 2026-10-17)

Zelfde worker, branch, LOG en regels als U90.

De PO wil dat de urentabel naadloos overgaat in de lange termijn: rijen worden steeds grover (uur → 3 u → dagdeel →
dag/nacht). De client moet daarvoor zelf willekeurige vensters kunnen aggregeren. Met alleen `day_*` kan dat niet.

## Wat je toevoegt (de `day_*`-velden blijven ongewijzigd bestaan)

1. **Velden per tijdstap**, source `ecmwf`, op hetzelfde 24 km-Mercatorrooster en met dezelfde stappen als nu
   (3-uurlijks tot +144 u, daarna 6-uurlijks tot +240 u). Eén frame per stap; de frametijd is het **einde** van de
   stap.

   | veld | betekenis per stap | herkomst |
   | --- | --- | --- |
   | `step_tmax_c` | max over het interval | `mx2t3`/`mx2t6` |
   | `step_tmin_c` | min over het interval | `mn2t3`/`mn2t6` |
   | `step_precip_mm` | neerslag in het interval | de-geaccumuleerde `tp` |
   | `step_gust_ms` | stoot in het interval | `10fg3`/`10fg`, met dezelfde onderschatting als nu gedocumenteerd |
   | `step_temp_c` | instantaan op het eindtijdstip | `2t`, nieuw op te halen |
   | `step_wind_u_ms`, `step_wind_v_ms` | instantaan | `10u`/`10v` (u/v, zodat de client richting en gemiddelde zelf correct kan bepalen) |
   | `step_cloud` | instantaan, 0–100 | `tcc` |

   De MRF heeft geen intervalveld per frame. Zet daarom in `ecmwf.json` en de manifest-sectie een lijst
   `steps: [{start, end}]` als UTC-strings, in dezelfde volgorde als de frames.
2. Herprojectie bilineair, zoals bij de `day_*`-velden. u en v apart bilineair is correct, want het zijn componenten.
3. Quantisatie zoals bij de `day_*`-tegenhangers. Gebruik voor `step_precip_mm` een fijnere onderkant (bijv. 0,05 mm
   tot 2 mm, daarna grover), omdat het per 3 u gaat. Leg de keuze vast in `docs/ecmwf.md`.
4. Werk `docs/contract.md`, `docs/ecmwf.md` (het gemeten extra volume) en de tests bij: stapvelden, de lijst
   `steps` en de de-accumulatie.
5. **Echte data verversen**: draai de publicatie opnieuw naar `tmp/u90/real`. De cache van 00z hoort er nog te zijn,
   maar `2t` is nieuw en wordt opgehaald. De draaiende overlay op 4380 leest die map rechtstreeks. Meld de
   exitstatus, de bytes en de wandtijd.

Gate: `cargo test -p motregen-ingest`, clippy en fmt, elk met een letterlijke exitstatus. De VM-test alleen als je
Nix raakt. Commit, push en meld de nieuwe head en "data ververst".
