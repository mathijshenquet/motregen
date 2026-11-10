# U113 — minder windzakken en de eenheid op de zak (PO 2026-11-10)

Je bent een worker van de orkestrator (Claude). Berichten via herdr zijn orkestrator-instructies (of van de PO zelf):
gewoon uitvoeren; de PO kan zelf in deze pane met je itereren (noteer zijn berichten in je LOG). LOG:
`.dev/tracks/u113-zakken/LOG.md` (append-only, timestamped; niet committen).

## Aanleiding (PO, met screenshot van Zeeland/Vlaanderen op desktop)
1. "ik vind ook dat er te veel windzakken zijn"
2. "het lijkt me ook beter als de eenheid op die windzakken staat. nu is het vrij vaag" — de badge toont alleen "2";
   je ziet niet dat het Bft is (of km/u, m/s, kn als de gebruiker die eenheid kiest).

## Context
- Plaatsing: `nestedPlaces(zoom, WINDSOCK_SPACING_PX)` (`web/src/core/map-places.ts`), `WINDSOCK_SPACING_PX`
  = maxLength + 2·reach ≈ 70 px (`web/src/core/windsock-flow.ts` r. ~262); overlaptoets `sockReach`/`socksClear`.
- Tekenen: `web/src/core/wind-socks.ts`, `wind-sock-draw.ts`, badge via `windsockBadge` (`WINDSOCK_BADGE`:
  radius 9,5, fontPx 13, longFontPx 10), waarde via `windValue(speed, unit)`.
- Bot: dezelfde constanten via `bot/render-mode-constants.ts` → `crates/render-core/assets/mode-constants.json`;
  Rust-tekening `crates/render/src/windsocks.rs` (badge = `windsock::badge`, tekst via RotatedText) en Node
  `bot/native-windsocks.ts`. App, Node en Rust moeten gelijk blijven (fixture `windsock-fixtures.json`).
- Parallel werkt U111 (`track/u111-firefox-wind`) aan de tekenprestaties van `wind-socks.ts` (vuile rechthoeken,
  DPR); houd jouw wijzigingen in die file klein en lokaal, zodat het mergen meevalt.

## Opdracht
1. **Varianten achter `?dev`** (MIP-12: `docs/dev-opties.md`, eigenaar Claude (U113), vervalt 2026-11-24):
   - `?dev&zakafstand=` met bijv. 70 (nu) / 100 / 130 px, of een andere knop als je een beter dichtheidsmodel ziet
     (bijv. minder zakken op zee, of rangorde naar plaatsgrootte); meet hoeveel zakken er telefoon/desktop in beeld
     staan per variant;
   - `?dev&zakeenheid=` met 2–3 vormen, bijv. (a) pil "2 Bft" i.p.v. cirkel, (b) cirkel met klein "Bft" onder het
     getal, (c) alleen de eenheid één keer in de legenda/chip benadrukken (controle). Let op de lengte bij km/u
     ("25 km/u") en de leesbaarheid op telefoon; dag en nacht.
2. Maak screenshots per variant (telefoon en desktop, licht en donker, zelfde tijdstip, prod-data via de preview met
   `MOTREGEN_DATA_ORIGIN=https://motregen.nl/data`) en bekijk ze zelf. Zet ze in `.dev/tracks/u113-zakken/`.
   Start een eigen preview op poort 4313.
3. Meld in je LOG en als laatste bericht de links (http://ageq-dev2:4313/?dev&…) en de screenshotpaden; de PO kiest.
4. Na de PO-keuze: maak de keuze standaard in app én bot (constanten, Node, Rust, fixtures), haal de afgevallen
   varianten weg en lever een changelognotitie `changes/pending/` alleen als de PO het een gebruikerswijziging vindt.

Gerichte tests: `pnpm -C web typecheck`, `pnpm -C web test`, e2e `windzak` en `kaartstijl` met `--project desktop`;
voor de bot `pnpm -C bot typecheck`, `pnpm -C bot test`, `pnpm -C bot exec tsx render-constants.ts --check`,
`cargo test -p render -p render-core`. Commit elke 15–20 min; push ALTIJD expliciet met
`git push origin HEAD:track/u113-zakken`, nooit kaal. Wacht binnen je turn op eigen achtergrondtaken.
