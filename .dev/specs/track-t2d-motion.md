# Track T2d — motion-schatter + annex (gpt-5.6-sol) — START NA T2C-MERGE

Read first: `AGENTS.md`, MIP-5 (accepted, §3+§5), `docs/contract.md`
(motion-annex + `motion_grid`), `docs/grid.md` (T2c's vergrote grid),
`.dev/tracks/t2b-fields/LOG.md` + `.dev/tracks/t2c-grid-en-velden/LOG.md`.
Your LOG: `.dev/tracks/t2d-motion/LOG.md` — committed (projectconventie).
Branch: `track/t2d-motion`. Keys in `.env`.

## Goal

De ingest publiceert per framepaar een motion-annex conform het contract,
zodat T3f de flow-tween kan bouwen. pySTEPS' Lucas-Kanade dient als
executable spec.

## Tasks

1. **Schatter in Rust** (`crates/motion` of module in ingest — jouw keuze,
   motiveer): grove bewegingsschatting tussen opeenvolgende frames van
   hetzelfde veld/bron — blok-kruiscorrelatie op ~32 px-blokken van het
   regenveld (na de-kwantisatie), met smoothing en outlier-demping.
   Kwantisatie naar i8-paren in 0,1 cel/min (contract); −128 = no-data
   (bijv. blokken zonder signaal — laat lege blokken het gesmoothte veld
   van de buren erven i.p.v. no-data waar dat kan; documenteer de regel).
2. **mrf-annex**: `crates/mrf` uitbreiden met de optionele motion-member
   per frame + `motion_grid` in de header (encoder, beide decode-paden en
   de CLI: `mrf inspect` toont motion-aanwezigheid, nieuw subcommando om
   een motion-veld te dumpen). Golden fixture bijwerken/aanvullen;
   bestaande chunks zonder annex blijven byte-identiek geldig (test!).
3. **Toepassing**: rain_rate-frames van rtcor, nowcast én AROME (AROME
   mét — MIP-5 §5; de warp-cap is client-side, jij levert gewoon het
   veld). Andere velden krijgen in v1 géén annex.
4. **Executable spec**: `spec/motion_reference.py` met pySTEPS
   (`pysteps.motion.lucaskanade`) op hetzelfde framepaar; vergelijk op
   blokniveau. Exacte gelijkheid is hier NIET het criterium (andere
   methode) — definieer en documenteer een zinnige acceptatiemaat
   (bijv. mediane vectorafwijking < 1 cel/min op blokken met signaal,
   plus visuele quiver-plots als artefact in je LOG-map) en motiveer.
5. **E2e**: daemon-run die annexen publiceert; `mrf inspect`-receipts;
   annex-groottemeting (verwachting ~1 kB/frame — rapporteer echt).

## Out of scope

Frontend/shader (T3f), andere velden dan rain_rate, deploy.
`docs/contract.md` niet wijzigen; ambiguïteit → WALL.

## Gates & receipts

Workspace fmt/clippy/test green; SYNCHRONE receipts (pipefail) + repro's in
je LOG; onafhankelijke re-run + onafhankelijke pySTEPS-vergelijking volgen
voor merge.
