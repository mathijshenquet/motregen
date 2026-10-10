# Regenmedia in Rust (MIP-29 C1)

`motregen-render` maakt precies één generatie: regenloop −1…+2 uur (241 kaartframes per 45 seconden,
10 fps, daarna één seconde eindhold) en 85 JPEG-stills −2…+12 uur per tien minuten. Alle invoer komt van
schijf. Het programma start alleen ffmpeg; tekst en temperatuurpunten worden rechtstreeks met het ingebedde
Inter-lettertype getekend. De renderer eindigt na deze generatie.

```sh
motregen-render --data-dir /pad/data --basemap-dir /pad/platen --mode weather --out-dir /pad/media
```

`--manifest /pad/snapshot.json` kiest een vast manifest in plaats van `DATA_DIR/manifest.json`. Chunks worden
steeds relatief aan `--data-dir` gelezen. Alleen modus `weather` bestaat in C1. `--help` en `--version` zijn
beschikbaar. Een ontbrekende chunk, verkeerde plaatprojectie, ontoereikende tijdlijn of encoderfout geeft een
niet-nul exitstatus. `media.json` verschijnt pas na succesvolle afronding van de volledige matrix.

## Basiskaartinvoer

De bestaande native botcache levert voorlopig de platen. Gebruik een cache die bij deze beeldmaat, dit
kaartaanzicht en dit regenrooster is gemaakt. De meest recent gemaakte plaat per thema wordt overgenomen:

```sh
pnpm -C bot exec tsx prepare-rust-basemaps.ts /pad/botcache /pad/data /pad/platen
```

Het resultaat is `light.png` en `dark.png` (RGB/RGBA, 960×1272 pixels), `water-light.png` en `water-dark.png`
(het bestaande lage-resolutiemasker, dekking in het alfakanaal) en `basemap.json` versie 1 met `size`, `view`
(Web Mercator centrum en zoom), `grid` (rooster voor het kadermasker) en `inputs` (oorspronkelijke bestandsnamen).
De kaartplaten bevatten de plaatsnamen. Temperatuurwaarden, klok en voettekst zitten niet in de platen.
Het watermasker is voor de volgende modi; de regencompositie gebruikt het niet. Deze export start geen browser.
Basiskaarten bouwen als Nix-artefact volgt in C5.

## Uitvoercontract

`weather-loop.mp4` is H.264/yuv420p met faststart, 960×1272, 10 fps, 241 bewegende frames en 10 holdframes.
De bestaande limiet van 3 MB geldt. `weather-EPOCH.jpg` gebruikt kaarttijd in UTC-milliseconden, kwaliteit 95
en 4:4:4-kleur. `media.json` versie 1 bevat:

1. `mode`, `generated`, `now`, `width`, `height`, `fps`, `frames`, `hold_frames` en `loop_epochs`.
2. `files`: bestandsnaam, `kind` (`animation`/`photo`), kaarttijd `epoch`, bytes en beeldmaat.
3. `render_ms` (compositie), `encode_ms` (JPEG), `loop_ms` (frameproductie en ffmpeg samen), `total_ms`.

De MP4 bevat kaarttijden op basis van `now`; `generated` bepaalt de generatie-identiteit. Beide blijven
afzonderlijk bewaard. Tijdzone Europe/Amsterdam geldt uitsluitend voor de getekende klok en dag.
Bronvoorrang, broncelbreedten, palet, smoothing en warp komen uit de bestaande TypeScript-regels.
`pnpm -C bot render:constants` genereert de ingebedde JSON; de botbuild draait dit ook. De constantentest
faalt bij drift. De kern heeft geen bestands-, netwerk- of systeemkloktoegang en bouwt voor wasm32.

## Optionele Node-aanroep

```sh
MOTREGEN_RUST_RENDERER=weather
MOTREGEN_DATA_DIR=/pad/data
MOTREGEN_RUST_BASEMAP_DIR=/pad/platen
MOTREGEN_RENDER_BIN=/pad/motregen-render
```

De schakelaar staat standaard uit. Node geeft alleen de manifest-snapshot en paden door, controleert het
uitvoercontract en neemt de complete MP4/JPEG-matrix over onder de bestaande cachesleutels. De rendereridentiteit
in de sleutel onderscheidt deze beelden van de oude route. `MOTREGEN_RENDER_BIN` valt terug op `motregen-render`
in PATH; het Nix-botpakket vult het pad automatisch in. Verwijder de schakelaar voor de bestaande route.
Temperatuur- en windmodus blijven bij hun huidige renderer.

## Bouwen en meten

```sh
nix build .#motregen-render .#motregen-bot
cargo build -p render --release
cargo build -p render-core --target wasm32-unknown-unknown
systemd-run --user --wait --pipe -p MemoryMax=400M -p CPUQuota=200% -p MemoryAccounting=yes \
  taskset -c 0,1 /absoluut/result/bin/motregen-render \
  --data-dir /pad/data --basemap-dir /pad/platen --mode weather --out-dir /pad/media
```

De Nix-wrapper zorgt dat ffmpeg ook binnen een systemd-unit gevonden wordt. Voor de Cargo-binary moet de
ffmpeg-PATH expliciet aan de unit worden doorgegeven (`--setenv=PATH=…`). De synchrone systemd-uitvoer meldt
exitstatus, looptijd en geheugenpiek van de hele cgroup, inclusief ffmpeg. C1 raakt geen Telegram-uploads,
poller of ingest-publicatie; aansluiten na een generatie en de VM-meting gebeuren afzonderlijk.
