# Weermedia in Rust (MIP-29 C1/C2)

`motregen-render` maakt precies één generatie: regenloop −1…+2 uur (109 kaartframes per 100 seconden,
4,5 fps, daarna vijf holdframes) en 85 JPEG-stills −2…+12 uur per tien minuten. Alle invoer komt van
schijf. Het programma start alleen ffmpeg; tekst en temperatuurpunten worden rechtstreeks met het ingebedde
Inter-lettertype getekend. `--mode wind` maakt de windfilm; `--mode feels` maakt de gevoelstemperatuurfilm
en 85 stills. Beide films hebben 169 kaartframes van −2…+12 uur per vijf minuten, 10 fps en tien holdframes.
Alle temperatuur-stills gebruiken hun RGB-loopframe rechtstreeks. De renderer eindigt na deze generatie.

```sh
motregen-render --data-dir /pad/data --basemap-dir /pad/platen --mode all --out-dir /pad/media
```

`--manifest /pad/snapshot.json` kiest een vast manifest in plaats van `DATA_DIR/manifest.json`. Chunks worden
steeds relatief aan `--data-dir` gelezen. De modi zijn `weather` (standaard), `wind`, `feels` en `all`. `--help` en `--version` zijn
beschikbaar. Een ontbrekende chunk, verkeerde plaatprojectie, ontoereikende tijdlijn of encoderfout geeft een
niet-nul exitstatus. `media.json` verschijnt pas na succesvolle afronding van de volledige matrix.

## Basiskaartinvoer

De vijf gegenereerde bronbestanden in `crates/render/assets/basemaps/` worden met het renderpakket geïnstalleerd
in `$out/share/motregen-render/basemaps` (samen 635.032 bytes). Nix kopieert ze; bouwen en renderen starten geen
Chromium. Ververs ze vanuit een lokaal gemaakte native botcache die bij het huidige `NATIVE_VIEW`,
`FRAME_PIXELS` en regenrooster hoort. De meest recent gemaakte plaat per thema wordt overgenomen:

```sh
pnpm -C bot exec tsx prepare-rust-basemaps.ts /pad/botcache /pad/data ../crates/render/assets/basemaps
```

Het resultaat is `light.png` en `dark.png` (RGB/RGBA, 960×1224 pixels), `water-light.png` en `water-dark.png`
(het bestaande lage-resolutiemasker, dekking in het alfakanaal) en `basemap.json` versie 1 met `size`, `view`
(Web Mercator centrum en zoom), `grid` (rooster voor het kadermasker) en `inputs` (oorspronkelijke bestandsnamen).
De kaartplaten bevatten de plaatsnamen. Temperatuurwaarden, klok en voettekst zitten niet in de platen.
Het native botkader past Nederland (inclusief Zeeland, Limburg en de Wadden), zonder Vlaanderen als
fitdoel. De bovenstrook van 48 pixels is verwijderd met behoud van zoom en bodemlijn. Het klokpaneel
sluit linksboven aan op de beeldrand; alleen rechtsonder is rond. Tijd, Amsterdamse datum (zoals `zo 11 okt`)
en de eigen modustitel staan op drie regels, 16 pixels van links. Datum en titel zijn 30 pixels en hebben
hetzelfde contrast als de klok. De regenhoek is 200×154 pixels; alleen een langere modustitel verbreedt
het paneel zodat tekst erbinnen blijft. Na een wijziging van `NATIVE_VIEW` moeten beide basiskaarten
opnieuw worden vastgelegd; een oude plaat bijsnijden geeft geen passende projectie of labelplaatsing.
Het watermasker dempt de windstaarten op zee; de regencompositie gebruikt het niet. Deze export start geen browser.
`prepare-rust-basemaps.test.ts` laat de gate falen als maat of view in de metadata afwijkt van de TypeScript-bron;
de PNG-maten en het alfakanaal van beide watermaskers worden ook gecontroleerd.

## Uitvoercontract

`weather-loop.mp4` is H.264/yuv420p met faststart, 960×1224, beeldsnelheid `9/2`, 109 bewegende frames en
vijf holdframes (114 frames, 25⅓ seconde). Beeldsnelheid en het gehele holdaantal worden uit `sequencePlan`
en `holdFrames` gegenereerd; ffmpeg ontvangt de verkorte breuk en `tpad=stop=5`.
Films gebruiken veryfast/CRF 18, H.264 High, yuv420p en faststart. Het VBV-plafond volgt uit de
veiligheidsgrens en de volledige filmduur, inclusief hold: `maxrate = floor(0,9 × maxBytes × 8 / duur)`,
`bufsize = 2 × maxrate`. De encoder kan bij extreme beelden kwaliteit inleveren om binnen het budget te blijven.
De harde controle op 20.000.000 bytes blijft het laatste vangnet; er is geen herencode. Alleen bij een
ultrafast-overschrijving wordt `8x8dct=1` toegevoegd om High te krijgen. De gedeelde standaard staat
in `crates/render/assets/video-encoding.json`, ingebed in Rust en geïmporteerd door Node. `MOTREGEN_VIDEO_PRESET`,
`MOTREGEN_VIDEO_CRF` en `MOTREGEN_VIDEO_MAX_BYTES` overschrijven dezelfde waarden in beide routes. CRF is een geheel
getal 1…51; de veiligheidsgrens moet positief en onder 50.000.000 bytes blijven. Encoderinstellingen zijn onderdeel
van de loopcachesleutel; JPEG-sleutels blijven gelijk. Meetbewijs staat in [render-kwaliteit.md](render-kwaliteit.md).
`weather-EPOCH.jpg` gebruikt kaarttijd in UTC-milliseconden, kwaliteit 95
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
Regen gebruikt de U77-standaard `violet-laat`/`drempel-zacht`, met afzonderlijke tabellen voor dag en nacht
en echte alfa-over: de ondergrond krijgt gewicht `1 − alfa`, geen kwadraat van de dekking.
Elk bronframe wordt eenmaal voorgefilterd met zijn eigen sigma, op de oorspronkelijke bronlattice en met
dezelfde R8-ronding na elke filterpass. Alleen het zichtbare gebied plus de maximale warpkap en filterburen
wordt berekend. Conservatieve dekkingsmaskers slaan uitsluitend aantoonbaar lege uitvoertegels over.
Loop en stills delen bronframes en worden in kaarttijdvolgorde met twee werkers samengesteld; JPEG draait
mee tijdens de loop. Een aparte schrijver geeft de geordende RGB-batches aan ffmpeg door. Eén batch van vier
frames mag op de schrijver wachten, zodat RGB- en bewegingsvelden begrensd blijven. Alle 19 stills binnen
het loopvenster gebruiken het RGB-loopframe rechtstreeks: 175 composities voor 109 loopframes en 85 stills.
`pnpm -C bot render:constants` genereert de ingebedde JSON; de botbuild draait dit ook. De constantentest
faalt bij drift. De kern heeft geen bestands-, netwerk- of systeemkloktoegang en bouwt voor wasm32.

## Wind en gevoelstemperatuur

De pure kern leest een raster met waarden en geldigheid. De temporele en ruimtelijke B-splines, contouren,
korte ringen, adaptieve isobaarstap en labelankers volgen de bestaande TypeScript-regels. Drie crops uit echte
velden toetsen veldwaarden exact, contourpunten binnen 0,00001 cel en labels binnen 1,5 pixel/0,1 graad.
Temperatuurbanden en koude/warme ankers komen uit dezelfde gegenereerde palettabel. De rastervulling is
verhuisd uit `native-field-raster.rs` naar `render-core`; de oude helper gebruikt deze kern ook.

Wind tekent temperatuurpunten, isobaren, deterministische windstaarten met zee-demping, H/L op prominente
drukextremen, regen volgens de gedeelde presentatie voor Wind, isolijnlabels en klok/voettekst. Gevoelstemperatuur tekent de gedempte
basiskaart, kleurvlakken, isothermen en labels. Gedraaide tekst wordt rechtstreeks met Inter gerasterd;
pixelgelijkheid met de oude browseratlas is geen eis (MIP-29). Per kaartframe bepaalt de gedeelde tijdlogica dag/nacht.

`wind-loop.mp4` en `feels-loop.mp4` hebben 179 gecodeerde frames en duren 17,9 seconden. Alleen `feels` levert
ook `feels-EPOCH.jpg`. Hun individuele `media.json` volgt hetzelfde contract als regen. Het profiel voegt
`fields_us`, `contours_us`, `labels_us`, `strokes_us` en `composition_us` toe. Deze laatste fase is kleurvulling
en het tekenen van lijnen; regen staat onder `mixing_us`, klok/temperatuurpunten onder `overlay_us`.
Voorbereiding, twee tekst-/rasterworkers en de ffmpeg-schrijver overlappen met begrensde wachtrijen.

`--mode all` start de drie modi tegelijk op dezelfde twee rasterworkers. Kaartplaten en het immutable
lettertype worden gedeeld. Bronrasters worden per bronframe gezamenlijk gedecodeerd en voorgefilterd;
weak verwijzingen delen actieve buffers, en een cache van maximaal 4 MiB houdt recente regenbuffers vast
wanneer de drie tijdplannen uiteenlopen. De batches in `all` zijn kleiner dan bij een losse modus.
`media.json` verschijnt pas na de complete generatie en bevat `mode: "all"`, `generated`, `now`, `width`,
`height`, `total_ms`, `shared_raster_hits` en een `modes`-object met de volledige individuele receipts.
Alle MP4/JPEG-bestanden staan rechtstreeks in de uitvoermap. Timing per modus in `all` omvat wachten op
de gedeelde kernen; meet losse modi voor hun eigen tijdlat. Parallelle fasetijden zijn niet optelbaar.

## Klokproeven voor de PO

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

## Klok per modus

De gekozen U76-schuifklok is standaard, met tussenposities 1/6 en 15/16. Alleen veranderende cijfers bewegen;
de overige cijfers en dubbele punt blijven stil. Regen heeft drie frames per vijfminuteninterval, dus fases
0 → 1/6 → 15/16 → 1. Wind en gevoelstemperatuur stappen exact vijf minuten per frame: de gedeelde kloklogica
komt daar telkens op fase nul uit en wisselt de volledige cijfers hard. Datum en thema volgen de werkelijke
kaarttijd; stills tonen hun exacte tijd zonder beweging. De titels zijn Regenradar, Wind en Gevoelstemperatuur.

De constante CLOCK_TRANSITION staat op Some(Schuif). De CLI kan expliciet schuif of klap kiezen; kruisfade
is verwijderd. Met de constante op None blijft de oude afronding op de dichtstbijzijnde vijf minuten
beschikbaar in de kern. Rust-cacheversie 30 en de framegrootte voorkomen hergebruik van oude beelden.

## Optionele Node-aanroep

```sh
MOTREGEN_RUST_RENDERER=weather,feels,wind
MOTREGEN_DATA_DIR=/pad/data
MOTREGEN_RUST_BASEMAP_DIR=/pad/platen
MOTREGEN_RENDER_BIN=/pad/motregen-render
```

Zonder Nix-module staat de schakelaar standaard uit. Node geeft alleen de manifest-snapshot en paden door, controleert het
uitvoercontract en neemt de complete MP4/JPEG-matrix over onder de bestaande cachesleutels. De rendereridentiteit
in de sleutel onderscheidt deze beelden van de oude route. `MOTREGEN_RENDER_BIN` valt terug op `motregen-render`
in PATH; het Nix-botpakket vult het pad automatisch in. Verwijder de schakelaar voor de bestaande route.
Een modus die niet in de lijst staat gebruikt zijn bestaande renderer. Wind importeert alleen de film;
regen en gevoelstemperatuur importeren ook alle 85 JPEGs zonder opnieuw te encoderen. Zijn alle drie de modi
gekozen, dan delen gelijktijdige cache-misses één `--mode all`-proces en worden de drie receipts verdeeld over
de bestaande sequentiecache. Node valideert eerst de volledige matrix. Een gedeeltelijke keuze gebruikt losse
modi. Complete cache-hits starten geen renderer; een mislukte generatie kan opnieuw worden geprobeerd.
De bestaande Node-pixelroute blijft op `PRE_U77_RAIN_LOOK`; de Rust-route toont het nieuwe regenbeeld.

## Nix-unit en terugval

`services.motregen.bot.rustModes` kiest voor `renderer` en `combined` standaard
`[ "weather" "feels" "wind" ]`. De unit zet `MOTREGEN_RUST_RENDERER` en
`MOTREGEN_RUST_BASEMAP_DIR` op de store-platen. De botwrapper levert `MOTREGEN_RENDER_BIN`, de renderwrapper
voegt ffmpeg aan PATH toe. Bij alle drie Rust-modi bevat de unit geen Chromium-pad. Een lege lijst herstelt
de bestaande Node-route; een gedeeltelijke lijst houdt Chromium voor de overige modi beschikbaar.
De `poller` krijgt geen Rust- of browseromgeving.

Prod, rolchecks en de NixOS-test gebruiken `nixosModules.motregen` uit de flake. Deze publieke module bindt
de pakketdefaults aan de flake; afnemers hoeven geen `specialArgs.self` door te geven. De bestaande
Chromium-proef in de NixOS-test kiest expliciet `rustModes = [ ];` om de Node-terugval te blijven toetsen.

Rust vereist een lokaal snapshot. `services.motregen.bot.dataDir` valt terug op `services.motregen.dataDir`
en wordt alleen-lezen gemount op `/run/motregen-data`, ook voor een zelfstandige renderer zonder ingest.
`CacheDirectory=motregen-bot` blijft schrijfbaar onder `ProtectSystem=strict`; binaries en platen zijn
leesbaar vanuit de store. De bestaande grenzen blijven 1100 MiB voor `renderer` en 1200 MiB voor `combined`,
ruim boven de gemeten Rust-generatiepiek van 384,6 MiB en met ruimte voor Node en uploads.

De extra node `rust` in `nix/tests/motregen.nix` draait de echte Node-sequentielaag, store-renderer en
ffmpeg-kindprocessen met de standaard Rust-modi. Een kleine, in Nix gegenereerde MRF-fixture bevat droge regen,
14 °C, 1012 hPa en wind (3, 2) m/s, van −2 tot +12 uur; de kaartplaten en uitvoermaat zijn die van productie.
De proef importeert drie films en 170 JPEGs, controleert cache-hits en sluit de bot-unit netjes af met exit 0.

Een Nix-assertie vergelijkt alle `serviceConfig`-properties met prod, behalve `ExecStart` voor het offline
testprogramma. Geen hardening-property wordt aangepast of overgeslagen: user/group, alleen-lezen datamount,
schrijfbare cache, `ProtectSystem`, `ProtectHome`, `ProtectProc`/`ProcSubset`, private devices/tmp,
kernel-/klok-/hostname-/cgroupbescherming, namespace-/adresfamilie-/realtime-/SUID-beperkingen,
lege capabilities, `NoNewPrivileges`, `LockPersonality`, `SystemCallArchitectures`, UMask en corelimiet
blijven gelijk, net als de geheugen-/CPU-grenzen, OOM- en herstartinstellingen. Het Node-proces controleert
de ro-mount en een geweigerde schrijfproef (`EROFS`), niet-root uid, lege effectieve capabilities,
`NoNewPrivs=1` en `Seccomp=2`. Prod configureert geen afzonderlijke `SystemCallFilter`-allowlist;
wel de seccompbeperkingen via architectuur, adresfamilies en namespaces. `PrivateNetwork=false` blijft gelijk.

Telegram-poller/uploads, echte ingest, live data en de productie-VM maken geen deel uit van deze proef;
netwerkverzoeken vanuit Node worden geweigerd. De bestaande node toetst daarnaast de Chromium-terugval.
`nix build .#checks.x86_64-linux.nixos-vm --no-link -L` bouwt én draait beide lokale test-VM's en moet
synchroon met exit 0 afronden naast `nix flake check --no-build`.

## Manifestpublicaties tijdens een generatie

Ingest kan na iedere gewijzigde bron een nieuw atomair manifest publiceren (`finish_refresh`/`publish_after`
in `crates/ingest/src/main.rs`); de publisher geeft iedere publicatie een nieuwe `generated`-tijd.
`refreshRendered` in `bot/runtime.ts` leest één manifest voor de hele generatie, wacht op alle renders,
uploads en registerpublicatie, en leest pas na de daaropvolgende 15 seconden opnieuw. Een nieuw manifest
onderbreekt de lopende generatie niet. De laatst gelezen snapshot kan dus nog worden gepubliceerd terwijl
ingest al een nieuwere heeft; bij de volgende ronde wordt uitsluitend het dan nieuwste manifest gekozen.
Er is geen wachtrij voor alle tussengelegen manifesten.

Bij drie publicaties binnen 30 seconden en circa 36 seconden koude rendertijd zijn dit gewoonlijk één
generatie (als de bot pas na de reeks leest) of twee (als hij vroeg begint, daarna de laatste versie leest).
De drie publicaties veroorzaken niet elk automatisch een generatie. Drie renders blijven mogelijk als
generaties sneller klaar zijn of de publicatiereeks langer duurt; `generated` maakt ook bronwijzigingen die
de kaartfilms niet raken tot een nieuwe cache-identiteit.

Voorstel voor een aparte productkeuze: wacht met beginnen totdat het laatst waargenomen manifest 30 seconden
stabiel is. Dat kan de gebruikelijke reeks tot één generatie samenvoegen, tegen extra actualiteitsvertraging
van ongeveer 30 seconden na de laatste publicatie. Deze ronde verandert die generatielogica niet.

## Bouwen en meten

```sh
nix flake check --no-build
nix build .#motregen-render .#motregen-bot
nix build .#nixosConfigurations.motregen.config.system.build.toplevel
cargo build -p render --release
cargo build -p render-core --target wasm32-unknown-unknown
systemd-run --user --wait --pipe -p MemoryMax=600M -p CPUQuota=200% -p MemoryAccounting=yes \
  taskset -c 0,1 /absoluut/result/bin/motregen-render \
  --data-dir /pad/data --basemap-dir /pad/platen --mode all --out-dir /pad/media
```

`nix flake check --no-build` hoort bij de gate: deze evalueert ook alle rolchecks en de NixOS-testdefinitie,
zonder een test-VM te starten. Daarna moet de NixOS-toplevel-build synchroon met exit 0 afronden.

De Nix-wrapper zorgt dat ffmpeg ook binnen een systemd-unit gevonden wordt. Voor de Cargo-binary moet de
ffmpeg-PATH expliciet aan de unit worden doorgegeven (`--setenv=PATH=…`). De synchrone systemd-uitvoer meldt
exitstatus, looptijd en geheugenpiek van de hele cgroup, inclusief ffmpeg. C1 raakt geen Telegram-uploads,
poller of ingest-publicatie; aansluiten na een generatie en de VM-meting gebeuren afzonderlijk.
