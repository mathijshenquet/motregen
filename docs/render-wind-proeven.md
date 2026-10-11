# Windlagen: geïsoleerde proeven

Technisch meetbewijs voor de open laagkeuze in MIP-31. De productiebron blijft
100 s kaarttijd/frame bij 5,6 fps, met regen, isobaren, druklabels en H/L.
Main is geïntegreerd inclusief MIP-30 E1: MemoryMax1600M voor de gecombineerde bot.

## Reproduceren

Vanuit de actieve devomgeving, met een nieuwe uitvoermap:

```sh
pnpm -C bot exec tsx ../tools/build-wind-layer-variants.mts "$PWD/.dev/tracks/u80-rust-wind-temperatuur/round5"
pnpm -C bot exec tsx ../tools/measure-wind-layer-variants.mts "$PWD/.dev/tracks/u80-rust-wind-temperatuur/round5" /nix/store/qcnj1kdipkxba2kkfsrbl64r70w0jp2r-motregen-render-0.1.0 "$PWD/.dev/tracks/u80-rust-wind-temperatuur/data"
pnpm -C bot exec tsx ../tools/build-wind-layer-review.mts "$PWD/.dev/tracks/u80-rust-wind-temperatuur/round5"
```

De bouw kopieert uitsluitend Cargo.toml, Cargo.lock en crates. Alleen de kopieën
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

| Standaard, 5,6 fps | Wandtijd s | CPU s | Piek MiB | MP4 MB | JPEGs |
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
dat levert hier ook de grootste besparing. De PO kiest welke informatie blijft.

## Temperatuur: bronanalyse en vervolgproef

Temperatuur maakt 265 composities: 217 filmframes plus 85 stills, met 37 gedeelde
tijdstippen. Regen maakt175:109+85−19. Wind maakt217 zonder stills. Temperatuur
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
