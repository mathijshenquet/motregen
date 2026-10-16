# U83 histogram-live — LOG

## 2026-10-16 09:42 CEST — start
- Spec gelezen: /home/mathijs/worktrees/motregen/repro-regenbeweging/.dev/specs/track-u83-histogram-en-regenmenging-live.md
- Branch track/u83-histogram-live op 48e3eea (= origin/main). Volgende: preview op 4321, schermbeelden, dan punt 1 (banding).

## 2026-10-16 09:56 CEST — punt 1 (banding) opgelost
- Oorzaak (twee lagen):
  1. Hemelstops één per heel uur; donkerte springt per uur (uurgemiddelde straling, bv. 0,50→0,82→1,0). Lineair
     tussen uren = vlakke stukken met knikken. Fix: gaussisch gemiddelde over de uren (σ 45 min), stops per 20 min.
  2. De harde randen onderin kwamen van de horizonnevel: 16 gestapelde stroken van elk ~0,4 % dekking; elke strook
     wordt op 8 bit afgerond (+0 of +1 niveau) en waar dat omslaat springen ze alle 16 tegelijk. Fix: één rect met
     een SVG-masker (userSpaceOnUse, strak om de rect). Gecontroleerd in headless Chromium én Firefox: luminantieprofiel
     onderin glad, geen sprongen (tmp/rowprofile.mjs, tmp/layer-bisect.ts).
- Test toegevoegd (cloud-section: geen sprongen/knikken bij wisselende uren); HistogramScrubber-test telt geen
  vaste stop-aantallen meer.
- Gate: typecheck 0, test 0 (570), build 0, e2e cloud-section desktop 0. (pnpm test moet buiten de sandbox: tsx-pipe.)

## 2026-10-16 10:04 CEST — slice op verzoek van de orkestrator (punten 1, 2, 4)
- Orkestrator: slice i.p.v. pakket; alleen `pnpm typecheck` + één eigen schermbeeld; geen e2e/volledige suite.
- Punt 2: wolkenlagen vóór de regen getekend (Weer), plus een `<use>`-kopie ná de regen (Lucht). Dekking achter
  min(1, 2·(1−lucht)), vóór min(1, 2·lucht): geen dip, geen sprong. Regen vol in beide modi (was 35 % in Lucht).
  Het id zit op een binnengroep, omdat <use> ook de inline-dekking kloont. Gecontroleerd op synthdata (:4322, Chromium):
  Weer regen vóór, Lucht wolken vóór. Firefox-check van <use> niet gedaan (slice).
- Punt 4: DEFAULT_RAIN_LOOK.blend = 'rand'. Wind/Lucht: rain-presentation 'per-modus' houdt dezelfde menging
  (gedempt in Wind, vermenigvuldigd in Lucht) en de contour komt dus mee. Telegram-bot: rendert met eigen
  Rust-palet (crates/render-core/src/palette.rs) zonder contour; 'rand' komt daar niet mee, bot niet gewijzigd.
- HistogramScrubber-test aangepast aan de volle regen + voorste kopie (niet gedraaid: slice).
- Punt 3 overgeslagen in deze slice.
- Gate: typecheck exit 0. Geen unit/e2e/build-gate gedraaid (orkestrator gate op de integratiebranch).
