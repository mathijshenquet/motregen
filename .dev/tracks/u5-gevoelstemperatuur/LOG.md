# Track U5 — gevoelstemperatuur zoals KNMI, switch weg

## 2026-09-23T — Start, bronverificatie, ingest

- Gelezen: AGENTS.md, spec, MIP-10, docs/fields.md, `feels_like_c` en tests, App.tsx-temperatuurpaden, `web/src/core/temperature.ts`. Worker: claude opus (geen codex, per spec).
- Bronverificatie KNMI: TR-309 (cdn.knmi.nl/knmi/pdf/bibliotheek/knmipubTR/TR309.pdf) §2.3 geeft JAG/TI met T op 1,5 m, W in m/s op 10 m, geldig −46…+10 °C en 1,3…49,0 m/s. De KNMI-uitlegpagina's (gevoelstemperatuur-windchill, "gevoelstemperatuur in het weerbericht" 2009) noemen alleen JAG/TI. **KNMI publiceert geen gevoelstemperatuur voor warm weer**: daarvoor is er sinds 2026 "hittekracht" (0–10, WBGT-basis, in de KNMI-app). De Steadman/BoM-tak uit MIP-10 is dus geen KNMI-definitie. Bron is BoM (bom.gov.au/info/thermal_stress): AT = Ta + 0,33e − 0,70ws − 4,00, e = rh/100·6,105·exp(17,27Ta/(237,7+Ta)), ws op 10 m. Vastgelegd in docs/fields.md.
- **Afwijking, bewust en niet stil:** een harde overgang op 10 °C geeft 1,4 °C sprong (3 m/s, RH 80 %) tot 2,2 °C (RH 60 %). Dat botst met MIP-10's eigen eis "geen sprong > 1 °C". Oplossing: een lineaire band 10→15 °C tussen JAG/TI en AT. KNMI blijft exact tot en met 10 °C, BoM exact vanaf 15 °C. Neveneffect: bij ≳10 m/s in droge lucht is gevoel in de band vrijwel vlak (tot −0,1 °C/°C), wat de test toelaat (≥ −0,05 per 0,1 °C). PM/PO kan de bandbreedte (`FEELS_LIKE_BLEND_C`) of de hele band terugdraaien.
- Windchill-drempel nu `v ≥ 1,3 m/s` (TR-309) in plaats van `> 4,8 km/u`.
- Tests: `feels_like_follows_knmi_wind_chill_up_to_ten_degrees` (−5 °C/20 km/u → −11,6; TR-309 tabel 3: 0 °C/10 km/u → −3; calm → T), `feels_like_uses_steadman_apparent_temperature_when_warm` (25 °C/RH 60/2 m/s → 25,85, met de hand nagerekend), `feels_like_is_continuous_around_ten_degrees` (RH 0,5–0,95 × wind 0,5–12 m/s; sprong over 10 °C < 0,05; stappen 5–25 °C binnen −0,05…0,3). De oude test `feels_like_uses_wind_chill_heat_index_and_fallback` vervalt: de NOAA-heat-index-tak bestaat niet meer, en de bewering "18 °C → 18 °C" is precies het gedrag dat MIP-10 afschaft.
- Gates (direnv exec ., sandbox uit): `cargo test --workspace` → CARGO-TEST-EXIT: 0; `cargo clippy --workspace -- -D warnings` → CLIPPY-EXIT: 0. Cargo.lock ongewijzigd.
- Volgende: live AROME-meting gevoel−temp, daarna frontend.

## 2026-09-23T — Live AROME-meting

- Tijdelijk example (niet gecommit, weer verwijderd): `build_arome_chunks(api, $TMPDIR/arome-cache, 24, None)` haalde de nieuwste live run op (353 MB). Daarna decodeerde ik elk gecacht lead-member 1..24 met `knmi_grib::decode_arome_fields` en rekende per cel van het native AROME-grid (hele domein incl. Noordzee, vóór integratie/kwantisatie) `feels_like_c − T` uit. Exit 0.
- Run **2026-09-23T10:00Z**, 24 leads, 3.650.400 celwaarden: gevoel−temp **min −12,90 · p05 −9,06 · mediaan −2,57 · p95 −0,39 · max +2,75 °C**. 76.829 celwaarden met T ≤ 10 °C, 1.838.981 met T ≥ 15 °C, de rest in de band. Onder de oude afleiding was dit 0,00 over alle cellen (MIP-10 §1). De extremen zitten boven zee bij harde wind.

## 2026-09-23T — Frontend: switch weg

- App.tsx: `TemperatureField`, `temperatureField`-signaal, `hasBothTemperatures`, `activeTemperatureField`/`activeTemperatureTimeline` en de switch-UI zijn weg. De kaartlabels lezen nu altijd `feelsLikeTimeline()`. De ongebruikte `Field`-import is verwijderd.
- Kaart: waar de switch stond staat een klein, niet-interactief bijschrift "° gevoel" (`.temperature-caption`, `pointer-events: none`). Dat kost minder ruimte dan "gevoel" bij tien stadslabels. Er is geen temperatuur-"meter" in de UI (de meter toont alleen regen), dus daar viel niets om te zetten.
- Urenoverzicht: kolomkop "Gevoel". De cel toont gevoel groot en luchttemperatuur klein en gedempt eronder (`.air-temperature`, title "Luchttemperatuur") (MIP-10 §2.2).
- Dode code/tests: er waren geen unit- of e2e-tests die alleen de switch dekten (grep web/src + web/e2e). `core/temperature.test.ts` dekt de labels en blijft staan. `.temperature-switch`-CSS is vervangen.
- Diff in App.tsx beperkt tot de temperatuurpaden (U2/U4 werken parallel).

## 2026-09-23T — Deploy-verwachting

- De daemon start met `arome_id = None` en bouwt in `initialize()` meteen de nieuwste AROME-run opnieuw (main.rs `refresh_arome`). De eerste manifestpublicatie na de herstart door auto-upgrade bevat dus de nieuwe waarden, ook als die run al eerder gepubliceerd was.
- Auto-upgrade: `dates = "03:15"`, `randomizedDelaySec = 30min`, `fixedRandomDelay` → ~03:19 Europe/Amsterdam = ~01:19Z. Vandaag was de nieuwste run om 10:58Z die van 10:00Z (lag < 1 u). **Verwachting bij merge vandaag: HARMONIE-run `2026-09-24T00:00:00Z`** (of 01:00Z als die er om 01:19Z al is) is de eerste met de nieuwe waarden.
- Check: in `manifest.json` de `feels_like_c`-chunk met `source: harmonie` → `run`. Decodeer daarna een frame van `feels_like_c` en `temp_c`: over het land moet het verschil zichtbaar ≠ 0 zijn (vandaag live: mediaan −2,6 °C). Alle runs vóór die herstart hebben verschil 0,00.
- Web-gates (direnv exec .., sandbox uit): `pnpm typecheck` → 0 (na het verwijderen van de ongebruikte `Field`-import; eerste poging 2), `pnpm test` → 0 (91 passed), `pnpm build` → 0. `pnpm e2e`: eerste poging exit 1, omdat poort 8185 bezet was door de e2e-caddy van track U2 (vaste poorten in playwright.config.ts). De herkansing wacht tot 8185/4185 vrij zijn.
