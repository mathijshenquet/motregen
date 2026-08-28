# Track T3f — flow-tween in de shader (gpt-5.6-sol) — START NA T3E-MERGE (EN T2D VOOR ECHTE DATA)

Read first: `AGENTS.md`, MIP-5 (accepted), `docs/contract.md`
(motion-annex + `motion_grid`), `.dev/tracks/t2d-motion/LOG.md` (indien al
gemerged), en de LOG's van T3c/T3d/T3e. Your LOG:
`.dev/tracks/t3f-flow-tween/LOG.md` — committed. Branch: `track/t3f-flow-tween`.

## Goal

Buien bewegen tussen frames in plaats van te vervagen: tweezijdige
semi-Lagrangiaanse warp in de regen-shader op basis van de motion-annex,
met crossfade als automatische fallback.

## Tasks

1. **mrf-client**: motion-annex parsen (header `motion_grid` + per-frame
   `motion`-verwijzing; i8-paren, 0,1 cel/min, −128 = no-data), decode in
   de bestaande worker, upload als kleine RG-texture (of RG8 met
   +128-offset — documenteer de encoding). Vitest: decode een
   synthgen-annex byte-exact.
2. **synthgen**: motion-annexen genereren die consistent zijn met de
   beweging van de synthetische buien (het advectieveld is daar bekend!) —
   dat maakt de visuele check objectief: met correcte warp beweegt de
   synthetische bui vloeiend, met kapotte warp zie je het meteen.
3. **Shader**: tweezijdige warp — sample frame A op x − v·dt·Δt en frame B
   op x + v·(1−dt)·Δt (Δt = frame-interval in minuten; v uit de
   motion-texture, bilineair gesampled), blend met gewicht dt.
   **Warp-cap** (MIP-5): begrens de totale verplaatsing (bijv. max ~15
   cellen) zodat AROME-uurstappen niet smeren; boven de cap glijdt het
   gedrag terug richting crossfade. Frames zonder annex: pure crossfade —
   geen zichtbare knik bij de overgang tussen wel/geen annex.
4. **No-data/randen**: warp mag geen data van buiten het veld of uit
   no-data naar binnen slepen (clamp + masker).
5. Tunables (cap, blendcurve) als constants; korte voor/na-notitie + welke
   artefacten je nog ziet (rotatie/shear, cel-geboorte) in je LOG.

## Out of scope

Ingest/Rust, wind-particles (hebben hun eigen veld), deploy.
`docs/contract.md` niet wijzigen.

## Gates & receipts

`pnpm build`/`typecheck`/`test` green; SYNCHRONE receipts + repro's;
onafhankelijke re-run volgt. Eindstaat: synthgen-scène toont vloeiend
bewegende bui bij scrubben (beschrijf de manuele check), en op echte data
(T2d gemerged) geen zichtbare ghosting meer op het radar-segment.
