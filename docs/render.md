# Regenmedia in Rust (MIP-29 C1)

`motregen-render` maakt precies één generatie: regenloop −1…+2 uur (109 kaartframes per 100 seconden,
4,5 fps, daarna vijf holdframes) en 85 JPEG-stills −2…+12 uur per tien minuten. Alle invoer komt van
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

`weather-loop.mp4` is H.264/yuv420p met faststart, 960×1272, beeldsnelheid `9/2`, 109 bewegende frames en
vijf holdframes (114 frames, 25⅓ seconde). Beeldsnelheid en het gehele holdaantal worden uit `sequencePlan`
en `holdFrames` gegenereerd; ffmpeg ontvangt de verkorte breuk en `tpad=stop=5`.
De bestaande limiet van 3 MB geldt. `weather-EPOCH.jpg` gebruikt kaarttijd in UTC-milliseconden, kwaliteit 95
en 4:4:4-kleur. `media.json` versie 1 bevat:

1. `mode`, `generated`, `now`, `width`, `height`, `fps`, `frames`, `hold_frames`, `loop_epochs` en `clock_variant`.
2. `files`: bestandsnaam, `kind` (`animation`/`photo`), kaarttijd `epoch`, bytes en beeldmaat.
3. `render_ms` (bronvoorbereiding + framecompositie), `encode_ms` (JPEG), `loop_ms` (tot de complete MP4), `total_ms`.
4. `profile`: `output_frames`, `source_frames` en opgetelde fase-wandduraties in microseconden:
   `decode_us`, `sampling_us` (bronvoorfilter + dekkingsmasker), `motion_us` (bewegingsveld projecteren),
   `mixing_us` (bilineair samplen, meebewegen, mengen en regen inkleuren), `overlay_us` (temperatuur/klok/voettekst),
   `jpeg_us` en `ffmpeg_wait_us` (stdin schrijven en ffmpeg afronden). Deel door `output_frames × 1000`
   voor ms per samengesteld frame; deel `jpeg_us` door `85 × 1000` voor ms per JPEG. Fase- en
   renderduraties overlappen bij parallel werk en zijn dus niet optelbaar tot `total_ms`.

De MP4 bevat kaarttijden op basis van `now`; `generated` bepaalt de generatie-identiteit. Beide blijven
afzonderlijk bewaard. Tijdzone Europe/Amsterdam geldt uitsluitend voor de getekende klok en dag.
Bronvoorrang, broncelbreedten, palet, smoothing en warp komen uit de bestaande TypeScript-regels.
Elk bronframe wordt eenmaal voorgefilterd met zijn eigen sigma, op de oorspronkelijke bronlattice en met
dezelfde R8-ronding na elke filterpass. Alleen het zichtbare gebied plus de maximale warpkap en filterburen
wordt berekend. Conservatieve dekkingsmaskers slaan uitsluitend aantoonbaar lege uitvoertegels over.
Loop en stills delen bronframes en worden in kaarttijdvolgorde met twee werkers samengesteld; JPEG draait
mee tijdens de loop. Een aparte schrijver geeft de geordende RGB-batches aan ffmpeg door. Eén batch van vier
frames mag op de schrijver wachten, zodat RGB- en bewegingsvelden begrensd blijven. Alle 19 stills binnen
het loopvenster gebruiken het RGB-loopframe rechtstreeks: 175 composities voor 109 loopframes en 85 stills.
`pnpm -C bot render:constants` genereert de ingebedde JSON; de botbuild draait dit ook. De constantentest
faalt bij drift. De kern heeft geen bestands-, netwerk- of systeemkloktoegang en bouwt voor wasm32.

## Klokproeven voor de PO

`--clock-variant schuif`, `--clock-variant klap` en `--clock-variant kruisfade` maken dezelfde regenloop met
drie verschillende cijferovergangen. De klok beweegt tussen veelvouden van vijf minuten, onafhankelijk van
de bronstap (ook bij HARMONIE met uurdata). Op de twee tussenframes is de overgang op ⅓ en ⅔; uitsluitend
de veranderende cijfers bewegen. Vaste cijferkolommen houden de overige cijfers en dubbele punt stil.
`schuif` rolt omlaag, `klap` vouwt de boven-/onderhelft om een horizontaal scharnier, `kruisfade` mengt de
dekking van beide cijfers. Stills tekenen altijd hun eigen exacte kaarttijd. `clock_variant` in het receipt
registreert de proefvariant.

De enige centrale keuze is `CLOCK_TRANSITION` in `crates/render-core/src/clock.rs`. Die staat voorlopig op
`None`: zonder CLI-keuze blijft de bestaande klok actief, totdat de PO een variant kiest. De CLI gaat voor
de constante; Node geeft geen proefvariant door.

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
