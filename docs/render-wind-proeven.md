# Windlagen: geïsoleerde proeven

Technisch meetbewijs voor de laagkeuze in MIP-31. De PO koos Wind op
75 s kaarttijd/frame bij 7,5 fps, zonder regen en met isobaren, druklabels en H/L.
Regen en Gevoelstemperatuur behouden 100 s / 5,6 fps; gewone web-Wind behoudt regen.
Main is geïntegreerd inclusief MIP-30 E1: MemoryMax1600M voor de gecombineerde bot.

## Definitieve standaard en volledige generatie

De afzonderlijke plannen komen uit `bot/sequences.ts`; Rust ontvangt `loops.wind`
en `loops.feels`. Wind: 289 kaartframes + acht holdframes, 15/2 fps, 39,600 s.
Regen: 109+6, 28/5 fps; Gevoelstemperatuur: 217+6, 28/5 fps. De Node-pixelroute
tekent geen regen in Wind. De browserterugval verbergt regen bij still-Wind;
gewone Wind houdt regen. De gerichte desktoptest controleert beide routes,
zichtbare isobaren en de vaste windsimulatieklok. Alle 170 stills blijven behouden.

De productie-Nix-renderer op dezelfde snapshot onder taskset0,1/CPU200%/
MemoryMax1600M/geen swap: **15,447 s wandtijd, 29,303 CPU s, 510,3 MiB piek**,
synchroon exit0. MP4-groottes: Regen4.348.101 B, Gevoelstemperatuur5.446.585 B,
Wind8.541.704 B. De store-bot valideert het volledige mixed-planreceipt, inclusief
alle stills tot +12 uur. Alle 173 bestanden zijn bytegelijk: regen/temperatuur
tegen de eerdere standaard, Wind tegen de gekozen regenloze proef. Daardoor
zijn ook alle gedecodeerde beelden gelijk. De hostmeting is geen VM-meting;
de PM doet die op zijn vaste snapshot vóór merge/uitrol.

```sh
systemd-run --user --wait --pipe --unit=u80-mip31-final -p CPUQuota=200% -p MemoryMax=1600M -p MemorySwapMax=0 -p MemoryAccounting=yes --setenv=MALLOC_ARENA_MAX=2 --setenv=MALLOC_MMAP_THRESHOLD_=131072 taskset -c 0,1 /nix/store/11c9qlj4aj6kdzgwckyf286xdwa8ddn0-motregen-render-0.1.0/bin/motregen-render --mode all --data-dir "$PWD/.dev/tracks/u80-rust-wind-temperatuur/data" --basemap-dir /nix/store/11c9qlj4aj6kdzgwckyf286xdwa8ddn0-motregen-render-0.1.0/share/motregen-render/basemaps --out-dir /pad/lege-uitvoer
```

De [reviewpagina](http://ageq-dev2:4397/review/round5/index.html) bevat de drie
definitieve films, zes dag-/nachtbeelden, drie klokstroken en de eerdere vier
laagproeven. `final-measurement.json`, `receipts/final-all.txt` en
`final-content-proof.json` geven profielen, exact commando en bestandsgelijkheid.
Encoder veryfast/CRF18, High/yuv420p/faststart en het duurgebonden 20MB-VBV blijven gelijk.

Worker-gate: cargo37tests/clippy/fmt/wasm, bot133tests/typecheck/build,
web569tests/typecheck/build, zeven gerichte desktoptests in `telegram.spec.ts`,
proeftools typecheck, `nix flake check --no-build` en Nix render/bot/bot-roles/toplevel.
Alle exits synchroon geobserveerd0. De Nix-VM-testasserties bewaken nu de
afzonderlijke fps/frames/hold. De worker heeft geen VM gestart; de PM bouwt/draait
die test en doet de finale VM-meting. Geen prod- of echte Telegramactie.

## Reproduceren

Vanuit de actieve devomgeving, met een nieuwe uitvoermap:

```sh
pnpm -C bot exec tsx ../tools/build-wind-layer-variants.mts "$PWD/.dev/tracks/u80-rust-wind-temperatuur/round5"
pnpm -C bot exec tsx ../tools/measure-wind-layer-variants.mts "$PWD/.dev/tracks/u80-rust-wind-temperatuur/round5" /nix/store/qcnj1kdipkxba2kkfsrbl64r70w0jp2r-motregen-render-0.1.0 "$PWD/.dev/tracks/u80-rust-wind-temperatuur/data"
pnpm -C bot exec tsx ../tools/build-wind-layer-review.mts "$PWD/.dev/tracks/u80-rust-wind-temperatuur/round5"
```

De bouw archiveert de bron op `244bf915130e6167139294a2dbbda19f557d3a36`, vóór de
laagkeuze; zo blijven alle vier proeven reproduceerbaar na het verwijderen van
de regenlaag uit de Windfilm. Uit dat archief krijgen uitsluitend Cargo.toml,
Cargo.lock en crates een eigen bouwkopie. Alleen de kopieën
krijgen het proefplan (75 s, 7,5 fps, 289 kaartframes + acht holdframes, 39,6 s)
en de laagwijzigingen. De bronvervangingen stoppen bij onverwachte bronwijzigingen.
De drukloze proef slaat drukrasters, veldvoorbereiding, contouren, ring-/lijnlabels,
H/L en lijnrasterisatie over; alleen de drukroosterheader blijft voor dezelfde
projectie. De regenloze proef maakt geen WindRain, dus geen regenvoorfilter,
motion of menging. Temperatuurpunten, windsimulatie, klok, kaartplaten en encoder
blijven gelijk. Er zijn geen proefvlaggen of nieuwe caches in productiecode.

Cargo bouwt op de dev-host. Afzonderlijke Nix-derivations installeren de binaire
uitvoer met autoPatchelf, ffmpeg, kaartplaten en plan.json. `packages.json` bevat
de vier storepaden, binaries, basemaps en SHA256-fingerprints van gewijzigde bronnen.
De vier `package`-symlinks zijn GC-roots. Alle ELF-afhankelijkheden zijn opgelost;
iedere closure bevat 308 storepaden, nul Chromium. De PM kan die closures kopiëren
en direct draaien; compileren op de VM is niet nodig. Deze worker deed geen VM-,
prod- of Telegramactie.

Per pakket, op de meetmachine met een lege uitvoermap:

```sh
systemd-run --user --wait --pipe -p CPUQuota=200% -p MemoryMax=1600M -p MemorySwapMax=0 -p MemoryAccounting=yes --setenv=MALLOC_ARENA_MAX=2 --setenv=MALLOC_MMAP_THRESHOLD_=131072 taskset -c 0,1 STORE/bin/motregen-render --mode wind --data-dir SNAPSHOT --basemap-dir STORE/share/motregen-render/basemaps --out-dir UITVOER
```

## Hostmetingen op dezelfde snapshot

Snapshot generated **2026-10-11T06:40:24Z**, now **06:35Z**; de gereflinkte
2026-10-11-datasnapshot. Twee vastgezette kernen, CPUQuota200%, MemoryMax1600M,
geen swap. Alle acht renders eindigden synchroon met exit 0. MB is 1.000.000 bytes.

| Wind, 7,5 fps | Wandtijd s | CPU s | Piek MiB | MP4 MB |
|---|---:|---:|---:|---:|
| Volledig | 9,020 | 16,216 | 218,4 | 12,569 |
| Zonder regen | 4,679 | 8,086 | 238,5 | 8,542 |
| Zonder isobaren, druklabels en H/L | 7,428 | 14,162 | 211,4 | 11,440 |
| Zonder beide | 3,722 | 6,235 | 221,1 | 7,319 |

| Vóór MIP-31, 5,6 fps | Wandtijd s | CPU s | Piek MiB | MP4 MB | JPEGs |
|---|---:|---:|---:|---:|---:|
| Regen | 5,428 | 8,878 | 200,3 | 4,348 | 85 |
| Gevoelstemperatuur | 6,852 | 11,865 | 199,6 | 5,447 | 85 |
| Wind | 6,652 | 12,650 | 216,4 | 11,549 | 0 |
| Alles samen | 16,927 | 33,523 | 477,2 | 5,447 / 4,348 / 11,549 | 170 |

Dezelfde meetronde vergelijkt lagen; oudere hostmetingen waren trager. Losse
modustijden zijn niet optelbaar tot `all`. De PM-VM-cijfers in MIP-31 gebruiken
een latere snapshot (generated12:47:47Z, now12:45Z), dus zijn geen gepaarde
host/VM-meting. Ze bewijzen daar wel dat temperatuur de duurste losse modus is.

In de volledige Windproef: regenvoorfilter4,360 s, motion1,968 s en menging7,537 s;
drukvelden0,281 s, contouren1,599 s, labels0,161 s en lijncompositie1,010 s.
Dit zijn opgetelde **fasewandtijden** met overlappend werk, geen optelbare CPU-
of generatietijden. De drukloze receipts tonen fields/contours=0 en praktisch
geen lijncompositie; de regenloze receipts tonen sampling/motion/mixing=0.

## Beelden en controle

[Vergelijkingspagina](http://ageq-dev2:4397/review/round5/index.html): vier films,
dag-/nachtbeelden, zes opeenvolgende bewegingsframes en acht klokframes per proef,
metingen, profielen, exacte commando's en kopieerbare storepaden. Alle films zijn
High/yuv420p, 15/2 fps, 297 frames en faststart. Dagframe48=08:35, nachtframe0=07:35,
motionframes96–101=09:35…09:41:15 (Europe/Amsterdam).

De acht volledige beelden en vier bewegings-/klokstroken zijn zelf bekeken.
Dezelfde klokhoek en datum blijven leesbaar; drukloze beelden missen lijnen en
druklabels. Zonder regen zijn de streepjes en temperatuurpunten beter zichtbaar;
dat levert hier ook de grootste besparing. De PO koos zonder regen, met drukinformatie.

## Temperatuur: bronanalyse en vervolgproef

Temperatuur maakt 265 composities: 217 filmframes plus 85 stills, met 37 gedeelde
tijdstippen. Regen maakt175:109+85−19. Wind maakte217 vóór MIP-31 en maakt nu289 zonder stills. Temperatuur
heeft dus 51% meer composities dan regen, en berekent per tijdstip temporele
veldblending, contouren, ringraster, labels, kleurvulling en lijnrasterisatie.

`field_raster::fill` samplet al op 1/3 resolutie (320×408) met dezelfde bicubische
veldwaarden en ringfade. Daarna schaalt bilineair mengen het RGBA-raster naar alle
960×1224 pixels: circa311 miljoen uitvoerpixels per generatie. `contours_us` bevat
zowel trace als ring_raster; `composition_us` bevat fill en lines. De gerichte
proeftool instrumenteert alleen een bronkopie. Vervolg op expliciet PM-verzoek:
fill/lines en trace/ring apart meten; één proef met gelijke RGBA-hoekjes versnellen,
zonder resolutie, kleuren, contouren of fade te wijzigen. Pas productiecode alleen
aan bij gecontroleerde winst en vergelijking van alle filmframes en85 JPEGs.

### Afgeronde temperatuurproef: niet opgenomen

`profile-temperature-preview.mts` maakt twee bronkopieën: `baseline` en
`equal-corners`. Beide krijgen uitsluitend tijdelijke tijdmetingen; de tweede
handelt vier gelijke RGBA-bronhoekjes rechtstreeks af. De proef verandert geen
resolutie, kleuren, contouren, fade of niet-uniforme interpolatie.

| Paar | Baseline s / CPU s | Proef s / CPU s | Upscale baseline / proef s |
|---|---:|---:|---:|
| AB | 8,907 / 16,468 | 9,637 / 16,431 | 5,422 / 2,843 |
| BA | 10,218 / 18,699 | 9,019 / 16,226 | 6,035 / 2,777 |
| AB | 11,705 / 21,092 | 11,798 / 20,754 | 7,564 / 4,156 |

Het snelpad versnelt de upscale-fase circa45–54%, maar de volledige render wordt
in twee van drie paren niet sneller. Totale winst is onvoldoende bewezen; daarom
is **geen temperatuur-optimalisatie in productiecode opgenomen**. Alleen
fasewinst is geen bewijs van generatiewinst. De overlappende fasewandtijden
veranderen ook door scheduling en belasting.

Eerste baseline, gesplitst: fill8,548 s (sampling3,126 + upscale5,422), lines3,246;
trace5,769 s en ring_raster1,097. De proef: fill5,999 (sampling3,156 + upscale2,843),
lines3,344; trace5,292 en ring_raster1,060. De vaste 1/3-sampling is dus niet de
hele compositiekost: bilineaire upscale/menging en lijnrasterisatie kosten samen
meer. Contourtrace is duurder dan het ringraster. Deze cijfers zijn fasetijden,
geen optelbare CPU-tijden.

De bestaande36 inhoudstests zijn groen in de proefkopie. Volledige vergelijking
van **223 gedecodeerde RGB-filmframes en85 gedecodeerde JPEGs**: nul afwijkende
frames/foto's/bytes, maximale afwijking0 (1.085.736.960 RGB-bytes gecontroleerd).
Dezelfde controle vergelijkt de geïnstrumenteerde baseline met de oorspronkelijke
store-renderer: eveneens exact gelijk. Beide films zijn5.446.585 bytes.

```sh
pnpm -C bot exec tsx ../tools/profile-temperature-preview.mts "$PWD/.dev/tracks/u80-rust-wind-temperatuur/round5/temperature-profile" baseline
pnpm -C bot exec tsx ../tools/profile-temperature-preview.mts "$PWD/.dev/tracks/u80-rust-wind-temperatuur/round5/temperature-fast" equal-corners
pnpm -C bot exec tsx ../tools/measure-temperature-preview.mts "$PWD/.dev/tracks/u80-rust-wind-temperatuur/round5" "$PWD/.dev/tracks/u80-rust-wind-temperatuur/data" /nix/store/qcnj1kdipkxba2kkfsrbl64r70w0jp2r-motregen-render-0.1.0
pnpm -C bot exec tsx ../tools/compare-temperature-media.mts "$PWD/.dev/tracks/u80-rust-wind-temperatuur/round5/temperature-baseline-1/media" "$PWD/.dev/tracks/u80-rust-wind-temperatuur/round5/temperature-fast-1/media" "$PWD/.dev/tracks/u80-rust-wind-temperatuur/round5/temperature-proof.json"
```

Alle zes generaties CPUQuota200%, taskset0,1, MemoryMax1600M, geen swap en dezelfde
ffmpeg uit de productieclosure; synchrone exit0. Exacte commando's en faseprofielen
staan in `temperature-measurements.json` en de zes `receipts/temperature-*.txt`.
Pixelbewijs: `temperature-proof.json` en `temperature-instrumentation-proof.json`
op de vergelijkingspagina. Hergebruik van de vaste samplingcoördinaten/gewichten
zou eveneens inhoud kunnen behouden; dat is een onderzoekskandidaat, geen uitgevoerde
optimalisatie. Lagere resolutie of minder contouren zou de inhoud veranderen en
is niet onderzocht.
