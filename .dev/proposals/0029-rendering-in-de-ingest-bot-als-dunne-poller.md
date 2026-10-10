# MIP-29 — De VM draait alleen Rust: renderer en Telegram-bot zonder Node

Status: accepted (PO 2026-10-10) · auteur: orkestrator (PM)

## Aanleiding
Op 2026-10-10 liep de Telegram-bot op prod zeven uur vast. De directe oorzaak was een lek in het uploadpad
(overbrugd in U75), maar de PO stelde de onderliggende vraag: waarom draait daar een complexe Node-codebase die
alle pixels aanraakt? Zo is het gegroeid (MIP-21 → 25 → 26): eerst Playwright-screenshots van de app, daarna
"native" rendering in dezelfde TypeScript. Alleen het inkleuren van regen en temperatuur zit in twee kleine
Rust-hulpprogramma's (`bot/native-raster.rs`, `bot/native-field-raster.rs`); Node haalt de data op, pakt uit,
rekent isolijnen, tekent windstreepjes, labels en klok, en stuurt elk frame heen en weer en door naar ffmpeg.
Tekst komt uit Chromium: ruim tienduizend vooraf gefotografeerde klokteksten, en per generatie een nieuw
labelplaatje — alleen om pixelgelijk te zijn aan de browser, een eis die geen doel dient.

## Besluit (PO 2026-10-10)
1. **Op de VM draait alleen Rust.** Geen Node, geen Playwright, geen Chromium.
2. **MapLibre rendert alleen de basiskaart**, dag en nacht, één keer, bij de build (niet op de VM). "De rest is
   allemaal standaard renderwerk, dat doe ik veel liever in Rust na."
3. **Geen pixelgelijkheid** met de browser of met de oude bot-beelden ("het oude beeld lijkt alleen vaag op wat er
   op de website staat"). Tekst (labels, klok, voettekst) tekent Rust rechtstreeks met het lettertype.
4. **Gedeelde logica bestaat één keer.** Uitpakken, tijdmodel, isolijnen en labelplaatsing komen in één Rust-kern die
   de bot rechtstreeks gebruikt en de app via WASM ("dan hebben we isolijnlogica twee keer?" — nee).
5. **De bot raakt geen bestanden aan.** Media worden één keer per generatie bij Telegram aangemeld per URL
   (Telegram haalt ze bij Caddy op); antwoorden gaan op `file_id`.
6. **De renderer is een apart Rust-programma** dat na elke generatie start (advies PM, geen bezwaar PO): renderen
   kan de data-publicatie van de ingest dan nooit ophouden, en een lek kan niet over generaties oplopen.

## Opzet
- `crates/render-core` — pure bibliotheek, geen bestanden of netwerk, compileert ook naar `wasm32`:
  tijdmodel en framemenging, palet, regencompositie (smoothing + meebewegen, uit `native-raster.rs`),
  temperatuur-/drukvlakken (uit `native-field-raster.rs`), isolijnen + labelplaatsing, windstreepjes, tekst,
  klok/voettekst, de grafiek van `/weer`. Decoderen via de bestaande `crates/mrf`.
- `crates/render` — programma `motregen-render`: leest manifest en chunks uit de datamap, de twee basiskaartplaten
  (met labellaag en watermasker) uit het pakket, schrijft MP4 (ffmpeg op stdin) en JPEG plus `media.json`.
- `crates/bot` — programma `motregen-bot`: long polling, commando's en knoppen, aanmelden per URL, register op
  `file_id`, `/weer <plaats>` (grafiek via `render-core`, plaatszoeker uit dezelfde catalogus als de app).
- Basiskaartplaten: build-artefact (nix), gemaakt met MapLibre in een headless browser op de bouwmachine.
- App: de WASM-kern vervangt de TypeScript-versie per onderdeel, lui geladen (isolijnen draaien al in een worker
  en pas bij temperatuur/wind). Het tekenen zelf blijft WebGL in de app en processor-Rust in de bot; dat is nu
  ook al dubbel.

## Maatstaf
- Inhoud: tests op dezelfde invoer → dezelfde kleuren (één palettabel), lijnen en getallen op de goede plek.
- Beeld: de PO kijkt per onderdeel, vóór omschakelen op prod.
- Snelheid en geheugen: **op de VM zelf gemeten vanaf het eerste onderdeel** (les 2026-10-09: de dev-host is ruim
  twee keer zo snel). Doel: hele generatie < 60 s op de VM, piek < 300 MiB.
- App (WASM): eerste laadtijd gelijk, framesnelheid gelijk, bundel voor de eerste weergave niet groter. Haalt een
  onderdeel dat niet, dan blijft daar de TypeScript staan met een test die beide gelijk houdt — als uitzondering.

## Fasering (elk deel los uitrolbaar, de oude route blijft terugval tot het volgende deel werkt)
- **A (U75, vandaag)**: overbrugging — uploadlek dicht, bot leest data van schijf; noodverband OOM-kill blijft.
- **C1**: regenfilmpje en regen-stills in Rust, van schijf tot MP4/JPEG, incl. klok/voettekst en tekst; meting op de VM.
- **C2**: temperatuur en wind in Rust (isolijnen, labels, streepjes, isobaren, drukletters); isolijn-kern via WASM
  in de app.
- **C3**: de grafiek van `/weer` in Rust.
- **C4**: de bot in Rust; aanmelden per URL.
- **C5**: Node, Playwright en Chromium van de VM af; basiskaartplaten als build-artefact; opruimen `bot/*.ts`.

## Risico
Regressie in snelheid verwacht de PM niet (er valt werk weg). Het risico zit in de inhoud: ruim 4000 regels worden
opnieuw geschreven — menging per modus en dag/nacht (MIP-24), smoothing/meebewegen en bronovergangen (U72),
labelplaatsing, dag/nacht per frame. Daarom per deel omschakelen met terugval, inhoudstests en de PO-blik.
