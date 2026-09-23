# U1 — laadprofiel

- 2026-09-23 12:45 UTC — Track gestart (claude opus, worktree `track/u1-laadprofiel` vanaf main `ed05b51`). Context gelezen: AGENTS.md, MIP-8 §7, docs/perf.md, T3h/T3l-logs, App.tsx-laadpijplijn, mrf.ts, perf.ts, e2e. Codehypothese vóór meting (nog te bewijzen): het histogram toont standaard −3 u…+8 u (horizon 8), L1 vult alleen −1…+2 u tijdens idle, en L2 (de rest) start pas na een vaste `setTimeout(30_000)` + `requestIdleCallback` — dat is precies de "~30 s" van de PO. Coverage per balk = één regenframe (volledig decoded grid), dus "meerdere datapunten per balk" lijkt niet de gate; wel wordt een frame dat de kaart/autoplay al decodeerde niet als histogrambalk gemarkeerd. Prod-manifest 12:37Z: regen = rtcor 36 (−3 u) + nowcast 25 + seamless 48 + harmonie 24 frames. Plan fase 1: loadtrace in `core/perf.ts` + laag-tags door MrfClient, Playwright `pnpm e2e:profile` (prod + synth), JSON + tijdlijn naar `web/e2e/profiles/`.
- 2026-09-23 13:10 UTC — **Fase 1 staat.** Loadtrace in `core/perf.ts` (`PerfMonitor.loads`: requests met laag/prio/frames/start/eerste byte/einde/bytes, frames met bytes-klaar/decoded, marks voor schedule/queue-start/stage/rain/timeline); MrfClient krijgt de trace en een `layer`-argument; App tagt L0/L1/L2/refresh. Profiel: `web/e2e/load.profile.ts` + `load-profile-report.ts`, config `playwright.profile.config.ts`, scripts `pnpm e2e:profile` (synth) en `pnpm e2e:profile:prod` (deze build, /data geproxyd naar motregen.nl); `MOTREGEN_PROFILE_TARGET=origin` meet de gedeployde bundle (alleen CDP + DOM). E2e-poorten via env instelbaar (u2-track bezette 4185/8185 tegelijk).
  Receipts: `pnpm typecheck` exit 0; `pnpm test` 26 files / 92 tests exit 0 (incl. nieuwe LoadTrace-test); `pnpm build` exit 0; `MOTREGEN_E2E_PORT=4195 MOTREGEN_E2E_DATA_PORT=8195 pnpm e2e` 3/3 exit 0 (desktop passief 547.578 B, warm 0 B, tweede klik 0). Profielen: `pnpm e2e:profile` exit 0, `pnpm e2e:profile:prod` exit 0, origin-run exit 0.

  **Koude prod-tijdlijn, desktop** (`prod-desktop-2026-09-23T12-54-29-764Z`; manifest 12:37Z; 110 zichtbare balken = −3 u…+8 u):

  | t (ms) | gebeurtenis |
  | ---: | --- |
  | 185–410 | manifest (1,8 kB) |
  | 420–820 | 12 headers parallel (64 kB) |
  | 1.036–3.108 | kaartframes rtcor 34/35 + nowcast 1–3 (183 kB) + motion |
  | 1.854 | **TTFR**; L0 ingepland (locatie De Bilt) |
  | 1.862–2.497 | L0: 6 uurvelden × 24 frames als volle chunks (1.667 kB) + regenpaar rond nu |
  | 3.468 | stadium `direct` (≈1 s decode van 144 uurframes na laatste L0-byte) |
  | 3.972 | L1 ingepland via `requestIdleCallback` (−1 u…+2 u) |
  | 3.973–4.805 | L1: rtcor 23–35 (384 kB) + nowcast 0–24 (722 kB) |
  | 4.951 | stadium `window`: **37/110 balken (34%)** |
  | 4.951–34.951 | **niets voor het histogram: `setTimeout(30_000)`** (App.tsx `scheduleRainWindow`) |
  | 14.811–36.070 | autoplay-prefetch: 40 losse seamless-frame-requests (1.730 kB) — gedecodeerd, maar tellen niet als balk |
  | 36.072 | L2 ingepland ("diepe idle": timer + `requestIdleCallback` met 5 s time-out, 1,1 s na timer) |
  | 36.117 | 76/110 (69%) in één klap: 39 balken waarvan het frame al door prefetch/kaart gedecodeerd was |
  | 36.073–36.753 | L2: rtcor 0–35 opnieuw (614 kB, overlapt 384 kB van L1), seamless 41–47 (396 kB), harmonie 0–23 volle chunk (1.074 kB) |
  | **37.360** | **110/110 (100%)**; `complete` @ 37.361 |

  **Koude prod-tijdlijn, mobiel 4G** (`prod-mobile-4g-2026-09-23T12-55-10-923Z`, 9 Mbps/60 ms/CPU 4×): TTFR 2.859; L0 2.865–5.037 (1.677 kB); `direct` 5.673; L1 ingepland 6.529, klaar 8.202 (1.111 kB); `window` 7.855 met 37/110 (34%); prefetch 16.603–32.453 (2.116 kB, 36 losse requests); L2 ingepland **39.372** (timer 30 s + 1,5 s idle-wachten); 39.465 → 80/110 in één klap; L2-transfer 39.376–41.035 (rtcor 613 kB opnieuw, harmonie 1.074 kB); **100% @ 40.737**.
  Gedeployde bundle (origin-modus, alleen DOM/CDP) bevestigt: 100% @ 34.811 desktop / 43.765 4G. Synth reproduceert hetzelfde patroon: 100% @ 30.668 desktop / 33.458 4G (54% bij 569 ms, dan niets tot L2 @ 30.579).

  **Kritieke keten die de 30 s verklaart (desktop, cijfers):** TTFR 1,85 s → L0 klaar 2,50 s + decode → `direct` 3,47 s → idle → L1 3,97–4,95 s (34% gevuld) → **30,0 s vaste deep-idle-timer** (4,95 → 34,95 s) → 1,1 s wachten op `requestIdleCallback` (autoplay houdt de main thread bezig; time-out 5 s) → L2-netwerk 0,68 s → decode/publicatie 0,6 s → 37,36 s. Van de 37,4 s is 31,1 s (83%) pure wachttijd op de trigger; netwerk+decode voor alles buiten L1 is ~1,3 s desktop / ~1,7 s 4G. De profielpoort-tabel bevestigt: 108 van 110 balken hebben "laag-trigger" als grootste wachtsegment.
  **PO-hypothese getoetst:** coverage per balk is één regenframe (geen meervoudige datapunten per balk), dus "eisen van coverage" is niet de poort — wél twee nevenbevindingen: (1) een frame dat kaart/autoplay-prefetch al decodeerde telt niet mee (39 balken prod-desktop waren tot 21 s eerder beschikbaar); (2) batching is inefficiënt: L2 haalt rtcor opnieuw als span 0–35 terwijl L1 23–35 al had (≈384 kB dubbel), prefetch haalt seamless per frame los (40 requests) en L2 haalt daarna de harmonie-chunk volledig (1.074 kB) hoewel maar 2–3 uurframes zichtbaar zijn. Volgende stap: commit fase 1, draft-PR, dan fase-2-ontwerp.
