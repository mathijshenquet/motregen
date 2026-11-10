# U112 — winddeeltjes in de Telegram-windfilm bewegen continu (PO 2026-11-10)

Je bent een worker van de orkestrator (Claude). Berichten via herdr zijn orkestrator-instructies (of van de PO zelf):
gewoon uitvoeren. LOG: `.dev/tracks/u112-film-deeltjes/LOG.md` (append-only, timestamped; niet committen).

## Aanleiding
PO: "op de windfilmpjes van Telegram gaan de winddeeltjes veel te snel". Diagnose van de orkestrator op vier
opeenvolgende prod-frames (0,13 s filmtijd ertussen): elk deeltje staat elk frame op een willekeurige andere plek —
ze verspringen in plaats van te bewegen.

Oorzaak: `crates/render-core/src/wind.rs` (~r. 120–170) is stateless per frame:
`phase = (age % duration) / duration` met `age = simulation_seconds − stagger` (simulation_seconds = filmseconden
sinds 1970, ≈ 3,2·10⁶ s; zie `crates/render/src/modes.rs` ~r. 652) en `duration` afhankelijk van de lokale
windsnelheid. Het veld verandert per filmframe 75 s modeltijd, dus de snelheid een beetje, en bij zo'n grote `age`
gooit elke kleine verandering van `duration` de fase volledig om. Dezelfde formule staat in de Node-pad
`bot/native-wind.ts` (r. ~59–62).

## Opdracht
1. Maak de deeltjesfase continu over de filmframes: houd per deeltje de fase (en zo nodig life-scale/positie) bij in
   de filmketen, zoals de zakken hun momentum bijhouden (`FieldState`/`SockChain`, `crates/render/src/fields.rs`,
   `windsocks.rs`, `frame_cache.rs` `chain_state`). Elk frame: `phase += dt / duration(speed nu)`; respawn bij
   phase ≥ 1. Eisen: deterministisch per epoch over generaties heen (cache-hergebruik, `chain_state`-herstel blijft
   werken), stills buiten de film met verse toestand blijven gelijk (MIP-37), geen sprongen bij een generatiewissel.
2. Houd de Node-pad (`bot/native-wind.ts`) gelijk of documenteer waarom niet (prod draait `backend: rust`).
3. Snelheid: na de fix moet de schermsnelheid gelijk zijn aan de app (CSS-px/s, `windScreenSpeed`); oordeel daarna
   zelf of het in de film (7,5 fps) nog te snel oogt en lever eventueel een variant met een filmtempo-factor als
   constante, met clip — niet zelf kiezen, de PO kiest.
4. Voor/na-clip (H.264, ≤ 12 s) van dezelfde data: prod-frames decoderen kan met
   `zstd -d <wind-*.rgb>` → rawvideo rgb24 960×1224 (`crates/render-core/assets/constants.json`), volgorde uit
   `wind-chain.json` in `/var/cache/motregen-bot/frames` (root@57.129.47.17, alleen lezen). Lokaal renderen met de
   Rust-renderer vraagt `MOTREGEN_DATA_DIR`, `MOTREGEN_RUST_BASEMAP_DIR`, `MOTREGEN_RENDER_BIN` (`bot/rust-render.ts`);
   een kleine datasnapshot mag je van prod kopiëren naar een gitignored map. Bekijk de clip zelf vóór je "klaar" zegt.
   Geen changelognotitie (bugfix).

Gerichte tests: `cargo test -p render -p render-core`, `pnpm -C bot typecheck`, `pnpm -C bot test`,
`pnpm -C bot exec tsx render-constants.ts --check`. Commit elke 15–20 min; push ALTIJD expliciet met
`git push origin HEAD:track/u112-film-deeltjes`, nooit kaal. Niets op prod wijzigen. Wacht binnen je turn op eigen
achtergrondtaken. Klaar = LOG-entry met commits, clip-pad en exacte reproduceercommando's; de orkestrator gate en
merget naar int.
