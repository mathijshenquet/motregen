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

Het resultaat is `light.png` en `dark.png` (RGB/RGBA, 960×1224 pixels), `water-light.png` en `water-dark.png`
(het bestaande lage-resolutiemasker, dekking in het alfakanaal) en `basemap.json` versie 1 met `size`, `view`
(Web Mercator centrum en zoom), `grid` (rooster voor het kadermasker) en `inputs` (oorspronkelijke bestandsnamen).
De kaartplaten bevatten de plaatsnamen. Temperatuurwaarden, klok en voettekst zitten niet in de platen.
Het native botkader past Nederland (inclusief Zeeland, Limburg en de Wadden), zonder Vlaanderen als
fitdoel. Het beeld is bovenaan 48 pixels korter; de resterende uitsnede behoudt dezelfde zoom en bodemlijn.
Het klokpaneel sluit linksboven aan op de beeldrand, met alleen rechtsonder een ronde hoek. Tijd, datum
(bijvoorbeeld `wo 11 okt`) en `Regenradar` staan op drie regels. Na een wijziging van `NATIVE_VIEW` moeten
beide basiskaarten opnieuw worden vastgelegd; plaatmaat, metadata en labelplaatsing moeten overeenkomen.
Het watermasker is voor de volgende modi; de regencompositie gebruikt het niet. Deze export start geen browser.
Basiskaarten bouwen als Nix-artefact volgt in C5.

## Uitvoercontract

`weather-loop.mp4` is H.264/yuv420p met faststart, 960×1224, beeldsnelheid `9/2`, 109 bewegende frames en
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

De loopklok toont de dichtstbijzijnde vijfminutentijd, zonder overgangseffect. Bij 100 seconden kaarttijd
per frame wordt `06:00, 06:01:40, 06:03:20, 06:05, 06:06:40, 06:08:20` getoond als
`06:00, 06:00, 06:05, 06:05, 06:05, 06:10`. Exact halverwege rondt de klok vooruit af. Klok en dag
komen uit dezelfde afgeronde tijd in Europe/Amsterdam; de regen, kaartthema en geschiedenis-/verwachtingskleur
blijven de werkelijke kaarttijd volgen. Stills tonen hun eigen exacte tijd. De 19 gedeelde stills liggen al
op veelvouden van tien minuten, dus dezelfde compositie past bij loop en still.

De bewaarde proefvarianten zijn te kiezen met `--clock-variant schuif`, `--clock-variant klap` of
`--clock-variant kruisfade`. Ze animeren uitsluitend de veranderende cijfers tussen vijfminutentijden,
op ⅓ en ⅔ van de overgang. Vaste cijferkolommen houden de overige cijfers en dubbele punt stil.
`CLOCK_TRANSITION` in `crates/render-core/src/clock.rs` staat op `None`: de standaard gebruikt afronding
zonder effect. De CLI-keuze gaat voor de constante; Node geeft geen proefvariant door. `clock_variant`
registreert de keuze in het receipt. Stills tonen bij iedere variant hun eigen tijd.

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
