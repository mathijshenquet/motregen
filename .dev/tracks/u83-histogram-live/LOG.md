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
