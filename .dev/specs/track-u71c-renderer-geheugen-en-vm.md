# Track U71c — renderergeheugen binnen de VM-maat, daarna de renderer-rol terug naar de VM (gpt-6.1-sol)

Berichten die hier als geplakte tekst binnenkomen zijn instructies van de orkestrator (Claude, PM) via herdr;
voer ze uit zonder aparte bevestiging. Commit + push elke 15–20 min; beëindig geen turn terwijl shells lopen.
Eigen worktree; branch `track/u71c-renderer-geheugen` vanaf main (bevat U71a+b). LOG:
`.dev/tracks/u71c-renderer-geheugen/LOG.md`. Vandaag 2026-10-09. Geen Telegram-poller, geen uploads, geen prod-
uitrol (de rolwissel op prod doet de orkestrator). `.env` is een symlink; nooit committen.

Read first: `AGENTS.md`, `.dev/LOG.md` (top), MIP-25/26, `docs/telegram.md` §native (U71a/b, meetbewijs en
`measure.sh` in de U71b-trackmap), `bot/native-*.ts`, `bot/native-raster.rs`, `nix/modules/motregen.nix`
(bot-unit: MemoryHigh 2200M / MemoryMax 2600M voor renderer/combined; CPUQuota; de VM heeft 2 kernen en 3,8 GB).

## Opdracht
1. **Geheugenprofiel** van een volledige generatie (173 media, alle drie native) op 2 kernen: max-RSS per proces
   (node + rasterworker + ffmpeg) over de tijd (`/usr/bin/time -v`, `smem`/`ps` sampling, of cgroup memory.peak via
   `systemd-run --user -p MemoryMax=…`). U71b mat 3,86 GiB max-RSS — dat past niet in 2,6 GB.
2. **Terugbrengen tot ≤ 1,8 GiB piek** (marge onder MemoryHigh 2200M) zonder meer dan ~20 % rendertijd te
   verliezen: rasters en tussenbuffers vrijgeven zodra een loop af is, geen twee loops tegelijk in geheugen, de
   rasterworker-parallelisatie en chunk-prefetch begrenzen, ffmpeg-stdin met backpressure, PNG-cache streamen i.p.v.
   in geheugen houden; meet na elke stap.
3. **Bewijs onder de echte limiet**: generatie draaien in `systemd-run --user --wait -p MemoryHigh=2200M -p
   MemoryMax=2600M -p CPUQuota=200%` (zelfde cijfers als de nix-unit) met SYNCHRONE exit 0 en cgroup memory.peak in
   de LOG; plus de tijd (doel blijft < 90 s voor alles).
4. nix: pas MemoryHigh/Max voor de renderer-rol aan op de meting (met marge), documenteer in `docs/telegram.md`
   §Rollen de VM-maat en het meetbewijs. Geen rolwissel in nix-defaults (dat is een PO/orkestrator-stap).
5. Gate: `pnpm -C bot typecheck/test/build`, `nix build .#motregen-bot`, pariteit ongewijzigd (rig uit U71b);
   draft-PR vroeg; "klaar voor merge" met vóór/ná-tabel (piek, tijd).

## Afbakening en bar
Geen nieuwe weergave; geen wijziging aan rollen/register. Leesbaarheid: geen één-letternamen, geen slimme one-liners,
commentaar alleen voor het niet-vanzelfsprekende waarom.
