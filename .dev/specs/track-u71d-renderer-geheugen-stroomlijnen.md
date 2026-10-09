# Track U71d — renderergeheugen stroomlijnen: ≤ 600 MiB piek voor een hele generatie (gpt-6.1-sol)

Berichten die hier als geplakte tekst binnenkomen zijn instructies van de orkestrator (Claude, PM) via herdr;
voer ze uit zonder aparte bevestiging. Commit + push elke 15–20 min; beëindig geen turn terwijl shells lopen.
Eigen worktree; branch `track/u71d-renderer-geheugen-stroomlijnen` vanaf main (bevat U71a–c). LOG:
`.dev/tracks/u71d-renderer-geheugen-stroomlijnen/LOG.md`. Vandaag 2026-10-09. Geen Telegram-poller, geen uploads,
geen prod-uitrol. `.env` is een symlink; nooit committen.

Read first: `AGENTS.md`, `.dev/LOG.md` (top), MIP-26, `docs/telegram.md` §native en §Rollen (U71a–c, meetbewijs),
de U71c-trackmap (`measure.sh`, samples-csv's: waar de piek zit per fase), `bot/native-*.ts`, `bot/native-raster.rs`,
`bot/encode.ts`, `nix/modules/motregen.nix` (renderer-budget nu MemoryHigh 1800M / Max 2200M).

## PO (2026-10-09 ~21:00)
"2 GiB voor rendering is wel veel." Doel: piek ≤ 600 MiB (cgroup memory.peak, alle processen samen: node +
rasterworker + ffmpeg) voor een volledige generatie (173 media), warm én koud; rendertijd mag oplopen tot ~90 s op
2 kernen. Daarna gaat de renderer-rol naar de VM.

## Opdracht
1. **Profiel per fase** (U71c-rig): welke buffers leven wanneer — gedecodeerde rasters (hoeveel frames tegelijk?),
   kaartplaten/atlassen per thema×modus, libvips-cache (sharp), PPM/RGB-framebuffers, ffmpeg-stdin-backlog,
   rasterworker-procesgeheugen. Tabel in de LOG vóór je iets wijzigt.
2. **Stroomlijnen**: frames streamen (decode on demand met een klein venster van links/rechts-paren i.p.v. de
   generatie vooraf), één loop tegelijk met directe vrijgave, atlassen/kaartplaten lazy en per modus na gebruik
   weg, `sharp.cache(false)` + `sharp.concurrency(1..2)`, rasterworker met begrensde in-flight frames en
   backpressure naar ffmpeg, geen dubbele kopieën (Buffer slices i.p.v. kopiëren), Node-heap-limiet expliciet
   (`--max-old-space-size`) als veiligheidsnet. Meet na elke stap (piek + tijd), houd de media byte-identiek
   (pariteitsrig U71b/c).
3. **Bewijs**: generatie onder `systemd-run --user --wait -p MemoryHigh=600M -p MemoryMax=800M -p CPUQuota=200%`
   met synchrone exit 0 en memory.peak in de LOG, warm en koud; 343/343 byte-identiek.
4. nix: renderer-budget op de meting met marge (bv. MemoryHigh 700M / Max 900M); `docs/telegram.md` bijwerken
   (vóór/ná-tabel met U71c-cijfers ernaast).
5. Gate: `pnpm -C bot typecheck/test/build`, `nix build .#motregen-bot` en de prod-toplevel; draft-PR vroeg; "klaar
   voor merge" met de tabel. Als 600 MiB niet haalbaar blijkt zonder > 90 s: stop bij het laagste eerlijke getal en
   leg uit waar de vloer zit.

## Afbakening en bar
Geen weergavewijziging; geen rolwissel in nix-defaults. Leesbaarheid: geen één-letternamen, geen slimme one-liners,
commentaar alleen voor het niet-vanzelfsprekende waarom.
