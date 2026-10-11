# Filmkwaliteit — meetbewijs U80 ronde 3

Standaard: **ultrafast, CRF 18, High met `8x8dct=1`, yuv420p, faststart**, met een harde veiligheidsgrens
van **20.000.000 bytes**. Preset, CRF en grens staan in één gedeeld JSON-bestand, met dezelfde omgevingsoverschrijvingen
in Rust en Node. Geen maxrate, bufsize, doelbitrate of herencode. Dit vervangt de vroegere ~2,5 MB-doelgrootte.

Meetdata: volledige lokale snapshot 2026-10-11, generated=2026-10-11T06:40:24Z, now=2026-10-11T06:35:00Z.
960×1272 pixels; wind/temperatuur 169 bewegende frames + 10 holdframes bij 10 fps; regen 109 + 5 bij 9/2 fps.
Alle encodes sequentieel onder `systemd-run --user --wait -p CPUQuota=200% taskset -c 0,1`, x264 één thread.
Encodeertijd is gemeten wandtijd inclusief het starten/wachten op de unit; elke encoder synchroon exit 0.

SSIM vergelijkt gedecodeerde video met **exacte ongecomprimeerde RGB-frames vóór ffmpeg**. Beide worden voor SSIM naar
yuv444p geconverteerd: het verlies door 4:2:0 blijft in de vergelijking zichtbaar. Alleen bewegende frames tellen mee.
De RGB-stromen zijn met een lokale ffmpeg-tee-wrapper vastgelegd uit de oorspronkelijke store-renderer; JPEGs zijn geen referentie.
Deze extra schrijf-I/O telt niet mee in de generatie- of encodeertijden. MB hieronder is decimaal.

| Modus | Preset | CRF | MB | Encoderen (s) | SSIM | Profiel |
|---|---|---:|---:|---:|---:|---|
| Wind | ultrafast | 16 | 20.311 | 1.442 | 0.984661 | Constrained Baseline |
| Wind | ultrafast | 18 | 17.076 | 1.331 | 0.981985 | Constrained Baseline |
| Wind | ultrafast | 20 | 14.516 | 1.266 | 0.978942 | Constrained Baseline |
| Wind | veryfast | 16 | 10.215 | 3.616 | 0.984312 | High |
| Wind | veryfast | 18 | 8.408 | 3.325 | 0.982210 | High |
| Wind | veryfast | 20 | 6.869 | 3.651 | 0.979586 | High |
| Wind | medium | 16 | 9.897 | 8.701 | 0.986849 | High |
| Wind | medium | 18 | 8.190 | 8.253 | 0.985385 | High |
| Wind | medium | 20 | 6.753 | 7.794 | 0.983499 | High |
| Temperatuur | ultrafast | 16 | 14.171 | 1.204 | 0.992074 | Constrained Baseline |
| Temperatuur | ultrafast | 18 | 12.360 | 0.709 | 0.990797 | Constrained Baseline |
| Temperatuur | ultrafast | 20 | 10.532 | 1.091 | 0.988771 | Constrained Baseline |
| Temperatuur | veryfast | 16 | 5.951 | 2.600 | 0.990376 | High |
| Temperatuur | veryfast | 18 | 4.982 | 2.629 | 0.988763 | High |
| Temperatuur | veryfast | 20 | 4.122 | 2.783 | 0.986959 | High |
| Temperatuur | medium | 16 | 5.770 | 5.262 | 0.992730 | High |
| Temperatuur | medium | 18 | 4.835 | 5.055 | 0.991652 | High |
| Temperatuur | medium | 20 | 4.027 | 5.129 | 0.990304 | High |
| Regen | ultrafast | 16 | 13.871 | 0.928 | 0.987950 | Constrained Baseline |
| Regen | ultrafast | 18 | 12.031 | 0.841 | 0.986809 | Constrained Baseline |
| Regen | ultrafast | 20 | 10.091 | 0.785 | 0.985306 | Constrained Baseline |
| Regen | veryfast | 16 | 5.823 | 1.911 | 0.986983 | High |
| Regen | veryfast | 18 | 4.785 | 1.897 | 0.985672 | High |
| Regen | veryfast | 20 | 3.907 | 1.775 | 0.984049 | High |
| Regen | medium | 16 | 5.891 | 4.738 | 0.988718 | High |
| Regen | medium | 18 | 4.845 | 5.452 | 0.987840 | High |
| Regen | medium | 20 | 3.973 | 4.320 | 0.986746 | High |

`-profile:v high` alleen activeert bij ultrafast geen High-gereedschap: ffprobe blijft Constrained Baseline melden.
Daarom is de gekozen variant nogmaals gemeten met `8x8dct=1`; ffprobe bevestigt nu werkelijk High.

| Modus | Gekozen MB | Encoderen (s) | SSIM nieuw | SSIM oud (~2,5 MB) |
|---|---:|---:|---:|---:|
| Wind | 17,020 | 1,212 | 0,982027 | 0,916000 |
| Temperatuur | 12,439 | 1,133 | 0,990831 | 0,955658 |
| Regen | 12,032 | 0,739 | 0,986809 | 0,948199 |

Op zes native 480×360-uitsnedes zijn drukke regen, windstreepjes, labels, temperatuurvlakken en dag/nacht bekeken.
De oude windfilm heeft uitgesproken blokken en rafels; de oude temperatuurfilm heeft ruis langs isolijnen.
Bij de gekozen CRF 18 zijn geen storende extra blokken, banding of vegen zichtbaar op deze uitsnedes.
De kleurvakken en contouren die al in de RGB-bron staan, blijven zichtbaar. 4:2:0 en compressie zijn niet verliesloos.
CRF 20 geeft lagere SSIM en meer verlies aan fijne winddetails; CRF 16/ultrafast overschrijdt de 20 MB-grens bij wind (20,315 MB).
Veryfast en medium kosten duidelijk meer CPU; bestandsgroottebesparing is geen doel.

De **volledige** nieuwe Rust-generatie (`--mode all`, 3 films + 170 JPEGs) duurt **11,301 s wall / 21,180 s CPU**,
met een cgroup-piek van **410,6 MiB**, bij dezelfde CPU-affiniteit/quota en MemoryMax=600M.
De opgegeven factor 3,5 voorspelt **39,6 s op de VM**; dit is een schatting, geen VM-receipt.
Ter vergelijking: veryfast/18 duurt 14,796 s (VM ~51,8 s), veryfast/16 16,840 s (VM ~58,9 s).
De oorspronkelijke store-renderer opnieuw gemeten zonder RGB-capture: 12,122 s.
De PM meldde 34,0 s op prod vóór deze wijziging; de definitieve VM-meting blijft zijn gate.

De volledige offline-generatie via de **gebouwde Node- en Rust-storepakketten** duurt **12,631 s wall / 24,100 s CPU /
388 MiB piek** onder dezelfde CPU-quota/affiniteit en MemoryMax=600M. Dit omvat manifestlezen, één Rust-all-proces,
cache-import, 3 films en 170 JPEGs; de cache wordt ook met een nieuwe StillRenderer hergebruikt. Geen netwerk of browser.
Voor de hele botgeneratie voorspelt factor 3,5 dus **44,2 s op de VM**, binnen ~45 s. De storefilms zijn ieder één byte
groter door container-metadata (`moov`); de gehele `mdat`-payload is bytegelijk, alle gedecodeerde frames gelijk
en alle 170 JPEGs bytegelijk aan de review-uitvoer.

Beelden, films, alle varianten en meettabel: [lokale reviewpagina](http://ageq-dev2:4397/review/quality/index.html).
Er zijn geen Telegram-uploads, pollerstarts of prod-acties uitgevoerd.

Reproduceren met de vastgelegde RGB-stromen en `before/media.json` in QUALITY_DIR:

```bash
export MOTREGEN_QUALITY_FFMPEG="$(command -v ffmpeg)"
node tools/measure-video-quality.mjs QUALITY_DIR
node tools/measure-video-quality.mjs QUALITY_DIR --high
```

Het meetprogramma bewaart per encode het exacte commando, exit 0, ffprobe-data en SSIM per frame.
Een volledige generatie meten gebruikt de gebouwde store-renderer, dezelfde datasnapshot en geen kwaliteitsoverschrijvingen.
Voor reviewbestanden is de 20 MB-grens niet toegepast op afgewezen matrixvarianten; productie weigert overschrijdingen.

Gate synchroon exit 0: cargo test render-core/render (31 tests), clippy --all-targets -D warnings, fmt,
bot typecheck/test (130 tests)/build, nix flake check --no-build en nix build motregen-render + motregen-bot.
Browserreview: 84 lokale links HTTP 200, drie films afspeelbaar op 960×1272, alle 18 uitsnedes werkelijk 480×360 op 100%,
geen paginafouten; desktop en smal scherm bekeken.
