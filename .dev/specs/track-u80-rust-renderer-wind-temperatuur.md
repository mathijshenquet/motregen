# Track U80 — MIP-29 C2: wind- en temperatuurfilm volledig in Rust (gpt-6.1-sol)

Berichten die hier als geplakte tekst binnenkomen zijn instructies van de orkestrator (Claude, PM) via herdr;
voer ze uit zonder aparte bevestiging. Commit + push elke 15–20 min; beëindig geen turn terwijl shells lopen.
Eigen worktree; branch `track/u80-rust-wind-temperatuur`, **gestart vanaf `track/u76-rust-renderer-regen`** (de
Rust-kern van C1 staat nog niet op main). LOG: `.dev/tracks/u80-rust-wind-temperatuur/LOG.md` (append-only, tijden
uit `date`). Vandaag 2026-10-11. Geen Telegram-poller, geen uploads, geen prod-uitrol, niets op de VM (de VM-meting
doet de orkestrator). `.env` is een symlink; nooit committen. Draft-PR vroeg (basis: de U76-branch).

Parallel loopt U76 ronde 3 op dezelfde crates (regenplan 100 s/4,5 fps, klokovergang, loopframes hergebruiken voor
stills). Houd je werk daarom in NIEUWE modules en raak `rain.rs`, `overlay.rs`, `time.rs` en de regen-CLI zo min
mogelijk; merge `origin/track/u76-rust-renderer-regen` zodra de orkestrator meldt dat ronde 3 klaar is, en daarna
main zodra U76 daar staat.

Read first: `AGENTS.md`, `.dev/LOG.md` (top), **`.dev/proposals/0029-…md` (MIP-29: doelopzet en waarom)**,
`docs/render.md` en `crates/render-core` + `crates/render` (wat C1 heeft neergezet: CLI, `media.json`, constanten uit
TypeScript, tekst met ingebed lettertype, parallelle frames), de huidige route die je vervangt:
`bot/native-modes-render.ts` (volgorde van de lagen per frame), `bot/native-wind.ts` + `bot/native-strokes.ts`
(windstreepjes: deterministische deeltjes, levensduur, staart, zee-demping), `bot/native-temperature.ts` +
`bot/native-field-raster.rs/.ts` (temperatuurvlakken en lijnen tekenen — dit deel is al Rust), 
`bot/native-isoline-labels.ts` (labelplaatsing), `bot/native-pressure-marks.ts` (H/L), en de gedeelde logica in de
app: `web/src/core/isolines.ts` en wat het aanroept (contouren, vereenvoudigen, ringen), de windparameters en
-kleuren, het temperatuurpalet, `MAP_FOCUS_SATURATION`, `rainPresentation` voor regen-over-wind (MIP-24),
`bot/sequences.ts` (wind en gevoelstemperatuur: −2…+12 u per 5 min bij 10 fps = 169 frames; temperatuur ook 85 stills).

## Doel
Het wind- en het temperatuurfilmpje (en de temperatuur-stills) komen uit hetzelfde Rust-programma als regen, zonder
Node in het pixelpad en zonder browser. **Wind eerst**: dat is op prod de traagste (75–116 s van ~220 s per
generatie; het streepjeswerk draait nu per deeltje per pixel in TypeScript).

## Opdracht
1. **Isolijnen in `render-core`** (pure module, bouwt voor wasm32): contouren uit een veld (isobaren uit druk,
   isothermen uit gevoelstemperatuur), met dezelfde niveaus, vereenvoudiging en ringen als `web/src/core/isolines.ts`.
   Dit is de code die later via WASM ook in de app moet draaien (aparte track): houd de API daarop gericht — invoer
   een raster + parameters, uitvoer lijnstukken/ringen, geen I/O. Fixturetest: laat de TypeScript-implementatie voor
   twee of drie echte velden de contouren exporteren (script in de build, zoals de constanten) en eis dat Rust
   dezelfde lijnen geeft binnen een kleine tolerantie.
2. **Labelplaatsing** op isolijnen (waar, welke hoek, geen overlap, niet over de rand) als pure module met dezelfde
   regels als `native-isoline-labels.ts`; fixturetest tegen de TS-uitkomst. **Tekst rechtstreeks in Rust**, gedraaid
   langs de lijn (geen Chromium-blad; pixelgelijkheid met de browser is geen eis — MIP-29).
3. **Wind**: streepjes (zelfde deeltjeslogica en parameters, uit gegenereerde constanten), isobaren + labels, H/L,
   regen eroverheen met de menging voor Wind, temperatuurpunten, klok/voettekst uit C1. `--mode wind`.
4. **Gevoelstemperatuur**: gedempte basiskaart, temperatuurvlakken en isothermen (verhuis de logica uit
   `native-field-raster.rs`), labels, klok/voettekst; film + 85 stills, stills die op een loopframe vallen hergebruiken.
   `--mode feels`.
5. **Eén aanroep voor alles**: `--mode all` rendert regen, wind en temperatuur in één proces (gedeelde decode en
   kaartplaten, de drie films naast elkaar over de beschikbare kernen); `media.json` beschrijft alle drie.
   Node-schakelaar uitbreiden: `MOTREGEN_RUST_RENDERER=weather,feels,wind` (standaard uit; per modus terugval).
6. **Inhoudstests** (geen pixelvergelijking met de oude beelden): isolijnniveaus en -ligging (fixtures), kleur per
   temperatuur uit dezelfde tabel, aantal en richting van streepjes bij een bekend veld, labeltekst = lijnwaarde,
   dag/nacht per frame, H boven een maximum en L boven een minimum.
7. **Beelden voor de PO**: wind- en temperatuurfilm plus per modus vier beelden (historie, nu, +6 u, nacht) naast
   dezelfde uit de huidige route, als `index.html` in de trackmap. Zelf bekijken vóór "klaar"; zeg wat je anders
   ziet dan in de huidige route en waarom.
8. **Meting** op de dev-host, `taskset -c 0,1` onder `systemd-run --user --wait -p MemoryMax=600M -p CPUQuota=200%`,
   synchrone exit: per modus en voor `--mode all`, tijd en cgroup-piek, faseprofiel (ms per frame: velden, contouren,
   labels, streepjes, compositie, JPEG, ffmpeg). Doel: wind ≤ 5 s, temperatuur (film + stills) ≤ 6 s, `all` ≤ 12 s,
   piek ≤ 400 MiB. De VM is ~5,6× trager; het einddoel is een hele generatie < 60 s dáár. `nix build
   .#motregen-render` moet de nieuwe modi bevatten; exact meetcommando in de LOG.
9. Gate: `cargo test -p render-core -p render`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`,
   `cargo build -p render-core --target wasm32-unknown-unknown`, `pnpm -C bot typecheck/test/build`, `nix build
   .#motregen-render .#motregen-bot`. Meld eerst "wind klaar" (met cijfers en beelden, zodat de orkestrator al op de
   VM kan meten), daarna "klaar voor merge".

## Afbakening en bar
Geen wijziging aan de web-app (WASM in de app is een aparte track), geen botlogica, geen `/weer`-grafiek, geen GPU.
Afhankelijkheden klein houden en verantwoorden. Leesbaarheid: geen één-letternamen, geen slimme one-liners,
functies die één ding doen, commentaar alleen voor het niet-vanzelfsprekende waarom. Loop je tegen een
ontwerpkeuze aan die de app-kant raakt (API van de isolijnmodule), leg hem met alternatieven vast en kies.
Een eerlijke "dit lukt niet zo, want…" is evenveel waard als een groene gate.
