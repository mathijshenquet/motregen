# Track U76 — MIP-29 C1: regenfilmpje en regen-stills volledig in Rust (gpt-6.1-sol)

Berichten die hier als geplakte tekst binnenkomen zijn instructies van de orkestrator (Claude, PM) via herdr;
voer ze uit zonder aparte bevestiging. Commit + push elke 15–20 min; beëindig geen turn terwijl shells lopen.
Eigen worktree; branch `track/u76-rust-renderer-regen` vanaf main. LOG: `.dev/tracks/u76-rust-renderer-regen/LOG.md`
(append-only, tijden uit `date`). Vandaag 2026-10-10. Geen Telegram-poller, geen uploads, geen prod-uitrol, niets op
de VM (de VM-meting doet de orkestrator). `.env` is een symlink; nooit committen. Draft-PR vroeg.

Read first, in deze volgorde: `AGENTS.md`, `.dev/LOG.md` (top), **`.dev/proposals/0029-…md` (MIP-29, accepted — het
hele waarom en de doelopzet)**, `Cargo.toml` + `crates/mrf` (decoder bestaat al) + `crates/motion`,
`bot/native-raster.rs` (de regencompositie die al Rust is: sampling, smoothing-kernen, meebewegen, menging),
`bot/native-raster.ts` + `bot/native-rain.ts` + `bot/native-render.ts` (wat Node er nu omheen doet: frames kiezen,
bewegingsveld, thema per frame, stills), `bot/sequences.ts` + `bot/stills.ts` (welke tijden: loop −1…+2 u per 45 s
bij 10 fps, 241 frames + 1 s eindhold; 85 stills −2…+12 u per 10 min), `bot/native-overlay.ts` (klok/voettekst —
wát er staat, niet hoe: dat is Chromium-fotografie en vervalt), `bot/native-labels.ts` + `web/src/core/temperature.ts`
(de temperatuurpunten "11°" op de regenkaart), `bot/native-map.ts` (basiskaartplaat: PNG + watermasker),
`bot/encode.ts` (ffmpeg-instellingen), `web/src/core/` voor tijdmodel, framemenging, palet en `rainPresentation`
(MIP-24) en de smoothing van U72 (blur 5×5 tot +2 u, oplopend naar 9×9 bij +3 u; kap volgt de staplengte).

## Doel
Eén Rust-programma maakt het regenfilmpje en de regen-stills, van schijf tot MP4/JPEG, zonder Node, zonder
browser. Node mag het alleen nog aanroepen. Dit is het eerste van vijf delen; de opzet moet de volgende delen
(temperatuur, wind, `/weer`, de bot zelf) kunnen dragen.

## Opdracht
1. **`crates/render-core`** — pure bibliotheek: geen bestanden, geen netwerk, geen klok, geen threads die `wasm32`
   breken (rayon achter een feature). Modules: tijdmodel en framemenging; palet; regencompositie (verhuis de logica
   uit `bot/native-raster.rs`, leesbaar opgedeeld); tekst (lettertype ingebed, bv. `fontdue`/`ab_glyph`; Inter voor
   klok en voettekst zoals de app); klok- en voettekst-overlay; temperatuurpunten. `cargo build -p render-core
   --target wasm32-unknown-unknown` moet slagen (alleen bouwen, nog niet gebruiken).
2. **`crates/render`** — programma `motregen-render`, met een vaste, gedocumenteerde CLI, bv.
   `motregen-render --data-dir <map met manifest.json en chunks/> --basemap-dir <map met dag/nacht-platen>
   --mode weather --out-dir <map>`: leest alles van schijf (`crates/mrf`), rendert frames met beide kernen, stuurt
   rauw RGB rechtstreeks naar ffmpeg (stdin, backpressure), schrijft `weather-loop.mp4`, de stills als JPEG en een
   `media.json` (bestanden, kaarttijden, generatie, maten, rendertijden). Eén generatie per aanroep, dan eindigen.
3. **Basiskaartplaten als invoer.** De renderer start geen browser. Voor nu levert een klein script de twee platen
   (dag/nacht, 960×1272) en het watermasker uit de bestaande botcache of via de bestaande capture; documenteer het
   formaat. (Bouwen als nix-artefact is deel C5.)
4. **Gedeelde constanten één keer.** Palet, `rainPresentation`, smoothing-/warp-parameters, de plaatsenlijst voor de
   temperatuurpunten en de beeldmaat staan nu in TypeScript. Genereer ze naar één JSON (script in `web/` of `bot/`,
   in de build) dat Rust inleest (`include_str!`); geen met de hand overgetikte getallen. Een test faalt als het
   JSON niet bij de TypeScript-bron past.
5. **Node roept alleen aan.** Achter een schakelaar (bv. `MOTREGEN_RUST_RENDERER=weather`, standaard uit) laat
   `bot/render.ts` voor modus `weather` het Rust-programma draaien en neemt de bestanden over in zijn cache met de
   bestaande sleutels; de rest van de bot merkt niets. Zonder schakelaar blijft alles zoals het is (terugval).
6. **Inhoudstests** (geen pixelvergelijking met de oude beelden — PO: die eis is vervallen): palet → kleur per
   intensiteit gelijk aan de TS-tabel; framekeuze en menging gelijk aan het tijdmodel (dezelfde fixtures als `web`);
   smoothing-sigma per kaarttijd; dag/nacht per frame; kloktekst en dag kloppen met de kaarttijd (Europe/Amsterdam).
7. **Beelden voor de PO**: het filmpje en vier stills (historie, nu, +2 u, nacht) in de trackmap; ernaast dezelfde
   uit de huidige route. Zelf bekijken vóór "klaar".
8. **Meting op de dev-host** met `taskset -c 0,1` onder `systemd-run --user --wait -p MemoryMax=400M -p CPUQuota=200%`:
   tijd en cgroup-piek voor loop + 85 stills, synchrone exit. Doel hier: < 15 s, < 300 MiB. Lever daarnaast
   `nix build .#motregen-render` (pakket in `nix/packages/`, in `flake.nix`), zodat de orkestrator op de VM kan
   meten; schrijf het exacte meetcommando in de LOG.
9. Gate: `cargo test -p render-core -p render`, `cargo clippy` schoon, `cargo fmt --check`, de wasm-build,
   `pnpm -C bot typecheck/test/build`, `nix build .#motregen-render .#motregen-bot`. Meld "klaar voor merge" met
   de cijfers, de CLI en de beelden.

## Afbakening en bar
Alleen regen (modus `weather`). Geen temperatuur-/windmodus, geen `/weer`, geen botlogica, geen wijziging aan de
web-app. Geen GPU. Afhankelijkheden klein houden en in de LOG verantwoorden. Leesbaarheid: geen één-letternamen,
geen slimme one-liners, functies die één ding doen, commentaar alleen voor het niet-vanzelfsprekende waarom.
Loop je tegen een ontwerpkeuze aan die de volgende delen raakt (crate-indeling, CLI, `media.json`), leg hem met
alternatieven in de LOG vast en kies; een eerlijke "dit lukt niet zo, want…" is evenveel waard als een groene gate.
