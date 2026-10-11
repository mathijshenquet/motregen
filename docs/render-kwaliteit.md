# Filmkwaliteit — meetbewijs U80 ronde 3 v2

Standaard: **veryfast / CRF 18 / H.264 High / yuv420p / faststart**, met een veiligheidsgrens van
**20.000.000 bytes**. Rust en Node lezen hetzelfde `crates/render/assets/video-encoding.json`:
preset, CRF, grens, VBV-budgetfactor 0,9 en buffertijd 2 seconden. De bestaande omgevingsoverschrijvingen
voor preset, CRF en grens werken in beide routes. Alleen ultrafast krijgt expliciet `8x8dct=1`; veryfast
levert vanzelf High. Loopcaches omvatten de instellingen; JPEG-cache en beeldplanning blijven gelijk.

Het plafond is `maxrate = floor(0,9 × maxBytes × 8 / filmduur)` bits/s, met `bufsize = 2 × maxrate` bits.
De filmduur omvat de holdframes en gebruikt de oorspronkelijke beeldsnelheid, inclusief regen op 9/2 fps.
Bij 20 MB is dat 8.044.692 bits/s voor wind/temperatuur (17,9 s) en 5.684.210 bits/s voor regen (25⅓ s).
CRF bepaalt de normale kwaliteit; VBV begrenst drukke uitzonderingen. De harde bestandsgroottecontrole
blijft het laatste vangnet. Er is geen herencode.

## Keuze en volledige generatie

De PM mat op de productie-VM naast de draaiende bot: ultrafast/18 29,4 s en 373 MB piek,
veryfast/18 36,3 s en 568 MB piek, met overlap van een botgeneratie. Wind was respectievelijk 15,8 en 7,5 MB;
temperatuur/regen bij veryfast 5,4/3,9 MB. Faster/18 liep tegen 600 MB aan en werd afgebroken wegens OOM.
De PM ziet op 100%-uitsnedes geen verschil tussen ultrafast/18 en veryfast/18. Veryfast past ruim binnen
het circa 45 s-budget en houdt veel meer groeimarge onder 20 MB. De gemeten host/VM-factor is ongeveer 2,75.
Deze VM-cijfers zijn door de PM aangeleverd en dateren van vóór de VBV-wijziging.

De volledige offline-generatie met de **gebouwde Node- en Rust-storepakketten**, inclusief manifestlezen,
één Rust-all-proces, cache-import, drie films en 170 JPEGs, slaagt synchroon: **15,302 s wall / 28,904 s CPU /
584 MiB cgroup-piek**, nul swap. CPUQuota=200%, taskset op kernen 0 en 1, MemoryMax=1200M zoals de huidige
gecombineerde bot-unit. Cachehergebruik is ook met een nieuwe StillRenderer gecontroleerd. Geen browser of netwerk.
Factor 2,75 voorspelt **42,1 s op de VM**; dit is een schatting. Er is hier geen productie-VM gestart.

| Modus | Nieuwe storefilm (bytes) | MB | SSIM | SSIM oud (~2,5 MB) |
|---|---:|---:|---:|---:|
| Wind | 8.407.923 | 8,408 | 0,982210 | 0,916000 |
| Temperatuur | 4.981.131 | 4,981 | 0,988763 | 0,955658 |
| Regen | 4.785.525 | 4,786 | 0,985672 | 0,948199 |

Zes native 480×360-uitsnedes tonen drukke regen, windstreepjes, labels, temperatuurvlakken en dag/nacht.
Op 100% zijn geen storende extra blokken, banding of vegen zichtbaar; vlakken en contouren uit de RGB-bron
blijven herkenbaar. De films zijn niet verliesloos. De pagina bevat de drie nieuwe **storefilms** en vóór/na/bron.

## Bewijs voor het plafond

Meetdata: volledige snapshot 2026-10-11, generated=2026-10-11T06:40:24Z, now=2026-10-11T06:35:00Z.
960×1272; wind/temperatuur 169 bewegende frames + 10 holdframes bij 10 fps, regen 109 + 5 bij 9/2 fps.
Alle encodes sequentieel onder CPUQuota=200%, taskset 0,1, één x264-thread; synchroon exit 0.
Encodeertijd omvat het starten/wachten op de unit en staat exact in de reviewtabel/receipts.
SSIM vergelijkt gedecodeerde video met **exacte RGB-frames vóór ffmpeg**, beide geconverteerd naar yuv444p
zodat 4:2:0-verlies meetelt. Alleen bewegende frames tellen mee. JPEGs zijn geen referentie.

| Modus | Zonder VBV (bytes) | 20 MB VBV (bytes) | Verschil (bytes) | SSIM zonder/met | 2 MB VBV (bytes) | SSIM bij 2 MB |
|---|---:|---:|---:|---:|---:|---:|
| Wind | 8.408.158 | 8.407.922 | −236 | 0,982210 / 0,982210 | 1.852.205 | 0,946306 |
| Temperatuur | 4.981.569 | 4.981.130 | −439 | 0,988763 / 0,988763 | 1.849.357 | 0,975121 |
| Regen | 4.785.449 | 4.785.524 | +75 | 0,985672 / 0,985672 | 1.791.360 | 0,972192 |

De normale films passen al zonder VBV binnen het berekende bufferbudget: de minimale vulling in een
packet/DTS-simulatie met initiële vulling 90% is 13.008.958 / 13.078.726 / 8.360.290 bits, telkens positief.
Het plafond vraagt dus geen vermindering om deze dag te laten passen. SSIM blijft exact gelijk op de zes
gepubliceerde decimalen; het grootteverschil blijft onder 0,01%. **De bestanden, H.264-payload en gedecodeerde
pixels zijn niet bytegelijk**: inschakelen van x264-VBV verandert ook kleine coderingskeuzes. Dat verschil is
werkelijk gemeten, niet alleen een andere SEI-header. De test bewaart beide hashes en presenteert geen
bitidentiteit als bewijs. De losse meetfilms zijn door container-metadata elk één byte kleiner dan de storefilms.

Daarnaast slaagt de **echte store-renderer met --mode all en MOTREGEN_VIDEO_MAX_BYTES=2000000**:
wind 1.852.206, temperatuur 1.849.358, regen 1.791.361 bytes; alle drie onder de grens, plus 170 JPEGs.
Deze volledige generatie: 12,793 s wall / 24,751 s CPU / 587,9 MiB cgroup-piek, onder MemoryMax=600M en
CPUQuota=200%. Zo is ook de Rust-aanroep, inclusief hold, werkelijk met een bindend plafond gedraaid.

## Reproduceren en gate

Met vastgelegde RGB-stromen in reference/ en before/media.json onder QUALITY_DIR:

```bash
export MOTREGEN_QUALITY_FFMPEG="$(command -v ffmpeg)"
pnpm -C bot exec tsx ../tools/verify-video-vbv.mts /absoluut/pad/QUALITY_DIR
node tools/measure-video-quality.mjs QUALITY_DIR
node tools/measure-video-quality.mjs QUALITY_DIR --high
```

De VBV-proef gebruikt de echte Node-encoderargumenten, controleert SSIM/grootte, het bufferbudget van de
onbegrensde film en de geforceerde 2 MB-grens, en bewaart de volledige gedecodeerde-frame- en payloadhashes.
De twee oude meetcommando's reproduceren onderstaande matrix zonder VBV en de ultrafast-High-proef.
MB is overal decimaal; geheugen in MiB is de hele cgroup, inclusief kindprocessen.

Gatecommando's (synchroon uitvoeren):

```bash
cargo test -p render-core -p render
cargo clippy --all-targets -- -D warnings
cargo fmt --check
pnpm -C bot typecheck
pnpm -C bot test
pnpm -C bot build
nix flake check --no-build
nix build .#motregen-render .#motregen-bot --no-link --print-out-paths
nix build .#checks.x86_64-linux.nixos-vm --no-link --print-out-paths -L
```

De VM-test bouwt en draait beide lokale NixOS-testnodes. De Rust-node gebruikt de standaard drie modi,
de echte Node→Rust→ffmpeg-keten en alle serviceConfig-hardening uit productie, mechanisch op gelijkheid
gecontroleerd behalve de offline test-ExecStart. Dit is geen proef op de productie-VM.
Receipts en de append-only LOG blijven genegeerde lokale werkbestanden.

[Beelden, films en volledige meettabel](http://ageq-dev2:4397/review/quality/index.html).
Geen Telegram-uploads, pollerstarts of prod-acties.

## Oorspronkelijke 27-variantenmatrix zonder VBV

De ultrafast-rijen hieronder waren Constrained Baseline; de aparte High-proef gebruikte 8x8dct=1.
De huidige standaard is veryfast/18 met het hierboven gemeten VBV-plafond.

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

