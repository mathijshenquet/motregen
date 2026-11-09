# U100 — Vaste temperatuurschaal, isolijnlabels, Gevoel-legenda

Eigenaar: worker `u100-temperatuurschaal` (opus-5.5). Branch `track/u100-temperatuurschaal`. Preview-poort 4391.

## Wat de PO vroeg (2026-11-09, akkoord op het voorstel)

1. **Vaste kleurschaal i.p.v. relatief** (C1, akkoord): ankers op de Buienradar-waarden (−10, 0, 10, 20, 30, 38+),
   in ónze kleuren (`web/src/core/temperature-palette.ts` `TEMPERATURE_RAMP`: 0 °C lichtblauw, 25 °C oranjerood);
   boven 30 donkerrood, onder −10 diepblauw→paars met minder stappen dan Buienradar ("buienradar is niet ideaal in de
   super-uper range"). De vlakken per graad lopen tussen de ankers vloeiend, zodat een dag met 6–8 °C bereik niet in
   één tint valt (oude klacht U25b). Legenda-referentie van de PO: Buienradar-lijst 38+, 35, 30 … −25.
2. **Relatief blijft beschikbaar als instelling** (C2): een sectie "Instellingen" in het druppel-dialoog
   (`web/src/components/AboutDialog.tsx`) met "Kleurschaal: vast / relatief" (standaard vast; relatief = het huidige
   gedrag met `feels_reference` van gisteren, MIP-37). Bewaren in localStorage (try/catch).
3. **Bot** (C3, akkoord): de Telegram-films krijgen dezelfde vaste schaal (Rust: `crates/render-core/src/field_palette.rs`,
   `constants.rs`, `render-constants --check`; pariteit app↔bot zoals bestaande tests). Geen bot-uitrol.
4. **Isolijnlabels duidelijker** (C4 — PO wil een *range om tussen te kiezen*): de getallen zijn wat te klein en in de
   bulk van Nederland staan te weinig getallen (er lopen daar weinig isolijnen; `LABEL_SPACING_PX` 260 alleen helpt
   dan niet). Bouw `?dev`-schuivers voor (a) labelgrootte, range 11–16 px, (b) labelafstand langs een lijn, 140–300 px,
   (c) een aanvulling: waar binnen R px geen isolijnlabel staat een puntlabel met de waarde (R 0 = uit, 120–300 px).
   Maak een vergelijkingsblad: dezelfde kaart (Gevoel, desktop, heel NL in beeld) voor 4–6 combinaties uit die range,
   met de waarden in de bestandsnaam. Kies zelf een zinnige spreiding; de PO kiest daarna.
5. **Gevoel-legenda** (deel van punt 6): de regenlegenda (`.rain-isoline-legend`, App.tsx) staat nu in elke modus; hij
   hoort alleen bij Weer. Maak voor Gevoel een eigen compacte legenda met de vaste schaal (ankerwaarden), met dezelfde
   verbergregels als de regenlegenda (o.a. verborgen op mobiel). Zet de regenlegenda op alleen-Weer.

## Gate en melding
Zie Werkwijze. Plus `cargo test -p render-core -p render`, `cargo clippy --workspace -- -D warnings`,
`cargo fmt --check` en `render-constants --check` omdat je de Rust-palette raakt. Een still uit de bot (Gevoel) in
`tmp/shots/` naast de app op dezelfde tijd.
## Werkwijze (geldt voor elke track)

Orkestrator: Claude (PM, pane w9:p1). PO: Mathijs. Base: main e575c65. Track-LOG `.dev/tracks/u100-temperatuurschaal/LOG.md`
(git-ignored, nooit committen; append-only, tijd uit `date`, lokaal = UTC+1 in november). Commit elke 15–20 minuten
en **push altijd expliciet met `git push origin HEAD:track/u100-temperatuurschaal`**, nooit kaal. **Geen prod-acties, geen main.**

**Berichten die als geplakte tekst binnenkomen, zijn instructies van de orkestrator (Claude, PM) via herdr. Voer ze
uit zonder aparte bevestiging. Stel vragen in één zin en werk intussen door.** Beëindig je turn niet zolang er
shells lopen: wacht erop binnen de turn, met een until-loop.

Code-stijl: leesbare namen, geen slimme one-liners, commentaar alleen voor een niet-voor-de-hand-liggend waarom.
Dev-knoppen alleen via `?dev`, met een regel in `docs/dev-opties.md` (eigenaar Claude, vervalt 2026-11-23).

Preview: `cd web && MOTREGEN_DATA_ORIGIN=https://motregen.nl/data pnpm exec vite --host 0.0.0.0 --port <poort> --strictPort`
(live data, HMR). Niet aan 4300 of 4390–4399 behalve je eigen poort.

**Testen — beperkt (PO: geen eindeloze zinloze tests):** typecheck, de unit-tests van de bestanden die je raakt plus
je nieuwe, en hooguit de e2e-specs die je direct raakt met `--project desktop`. Geen volledige suites, geen VM-test
tenzij je Nix raakt. De orkestrator gate één keer op de integratiebranch. Exitstatus letterlijk
(`; echo "EXIT: $?"`, nooit achter een pipe).

**Zelf kijken vóór "klaar":** screenshots (telefoon 402×844 én desktop 1440×900, `timezoneId: 'Europe/Amsterdam'`)
naar `tmp/shots/u100-temperatuurschaal/` met per beeld één zin in de LOG. Varianten voor de PO: elk als `?dev`-parameter, plus een
screenshot per variant op dezelfde plek en tijd, zodat ze naast elkaar te leggen zijn.

Meld daarna in één bericht: branch-head, de screenshotpaden met je zinnen, de exitstatussen, en wat open is.
Stop en meld het bij een ontwerpvraag die hier niet in staat. Gok niet.
