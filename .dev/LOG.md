# motregen — orchestrator log (newest first)

## 2026-08-31 (avond) — dieet live op prod; scorebord; morgen: progressief laden

- T2g merged (sessie 20,1→6,9 MB; dictionary +2,8% en delta +41% = gemeten
  regressies, afgewezen; MIP-2-intra-only empirisch gevalideerd). T5b merged
  (mobiele profielen: pre-dieet 47 s op 4G / 142 s op 3G). T5c merged:
  scorebord vs buienradar.nl — radar 2,1–7,4× sneller, ~10× minder requests,
  bytes hun enige winst (pre-dieet-snapshot).
- T4-vangst: pnpm-fixed-output-hash was stale na T2g → nachtelijke upgrade
  zou stranden; fix geverifieerd+merged; upgrade handmatig getriggerd.
  LES: tracks die pnpm-lock/Cargo.lock raken krijgen voortaan nix flake
  check in de merge-verificatie. Prod nu: nieuwe closure, dieet-manifest
  publiek, werkset 8,60 MB (was 21,9), nul failed units. SSH naar de VPS
  vanaf ageq-mthq intermitterend geblokkeerd (poort 22; 443 fijn) — retries
  werken; observeren.
- CF-observatie: bot-bescherming blokkeert non-browser-UA's (urllib 403;
  curl/browsers ok) — regel versoepelen ALS data-endpoint ooit open data
  voor derden moet zijn. Geparkeerd.
- t3g (PO-sessie): conflicten met T5-instrumentatie opgelost, 73 tests, maar
  mijn onafhankelijke e2e ving een intermitterende warm-chunk-budget-
  overschrijding op desktop → terug naar sol (regressie fixen of budget
  herkalibreren met onderbouwing; 3× green vereist). Merge wacht daarop.
  PO meldde: t3g bevat ook al optimalisatiewerk; morgen MIP-8-spec daarop
  bijsnijden. Backend-vervolg nodig: historische observaties voor de
  uitgebreide tabel-history (T2h, spec na t3g-merge).
- MIP-8 §7: bouwontwerp progressief laden (L0≤1,5 MB / L1 skeleton / L2
  intentie; passief-budget ≤3 MB) — PO: morgen tackelen.

## 2026-08-31 — 🌧 MOTREGEN.NL IS LIVE (T4/T2f/T5 merged; Cloudflare-cutover)

- T5 (sol, 58m): perf-module + HUD (?perf=1/triple-tap), Playwright-suite
  `pnpm e2e` (on-demand per MIP-7 §5), smoke-script, baselines in
  docs/perf.md. Verified (58 tests + e2e green) en merged. BEVINDING: echte
  sessie = 20,1 MB (synth 1,31 MB); uitsplitsing gemeten: regen 12,2 MB over
  4 bronnen, uurvelden 11,3 MB waarvan cloud_frac 2,5 + rel_humidity 2,4 —
  data-dieet (subsampling tabelvelden, dictionary, lazy fields) geparkeerd
  als kandidaat-MIP; Cloudflare-technisch geen probleem (cacheable, gedeeld).
- T2f (sol, ~60m): 300m-windbaseline met online s/θ-kalibratie; gates green,
  quiver-bewijs in track-LOG; merged; lokale daemon herstart.
- T4 (sol, 24m + PO-gedreven installatie): volledige NixOS-config VM-bewezen
  (nix flake check onafhankelijk gere-rund, exit 0) én — met expliciete
  PO-autorisatie in de pane — nixos-anywhere-installatie op de OVH-VPS
  (57.129.47.17 / 2001:41d0:701:1100::d923, legacy-kexec-vlag nodig op
  Ubuntu 26.04). Secrets via .env-overdracht geplaatst. Merged naar main —
  auto-upgrade (dagelijks 03:19) maakt main = productie.
- Livegang uitgevoerd (orchestrator, via API's): Porkbun parkeer-ALIAS+
  wildcard weg (NB: A-create naast bestaand ALIAS rapporteert SUCCESS maar
  wordt opgeslokt — eerst ALIAS deleten), A/AAAA → VPS; Caddy pakte LE-cert;
  volledige regenketen live geverifieerd (5 bronnen, Range 206). Cloudflare:
  zone eceaddc…, proxied A/AAAA, SSL Full (strict), cache-rule /data/*,
  NS-cutover bij Porkbun → bayan/venus.ns.cloudflare.com; activatie-watcher
  loopt. Backfill-piek op VPS: load ~1,0, 591 MB RAM — ruim binnen 4 GB.
- Metingen: temp-vs-gevoel vandaag exact 0,00 °C verschil over 401.875
  cellen (alle temps 11,4–19,5 °C = dode zone) — switcher werkt, seizoen
  slaapt; UX-verfijning (dempen bij gelijkheid) op de polish-lijst.
- Open: PO's t3g-sessie (zijn merge-call), 20 MB-data-dieet-MIP (geparkeerd),
  smoke-script als systemd-timer op de VPS (na CF-activatie), open-source-
  pass (backlog), day/night v2 (geparkeerd).

## 2026-08-31 — 3 dagen unattended; PO-iteratiesessie; OVH-deployplan

- Seamless ging op 28-08 avond live: volledige regenketen rtcor(5m) →
  nowcast(+2u,5m) → seamless(+6u,5m) → harmonie(uurlijks). Daarmee was de
  hele PO-wensenlijst van dag 1 gemerged (11 tracks, MIP-1…5 accepted).
- Stabiliteitsdatapoint: daemon draaide 2d12u onbeheerd door op ageq-mthq;
  manifest vandaag vers (08:54Z), piek-RSS 324 MB (VmHWM — seamless-mediaan
  streamt per lead), caddy 32 MB, chunks-werkset 300 MB. Sterk bewijs voor
  de 4 GB-VPS-sizing.
- PO-iteratiesessie geopend: track/t3g-po-iteratie (sol, eigen dev-server op
  :4175) — PO stuurt deze pane ZELF interactief; orchestrator monitort niet
  mee en merget na afloop met de gebruikelijke verificatie. 4173 blijft de
  stabiele main-preview.
- Deployplan PO: OVH VPS (2 vCPU/4 GB/40 GB NVMe/500 Mbps onbeperkt,
  ~€45/jr), NixOS, alles unattended, Cloudflare ervoor (vervroegt het
  CDN-moment uit MIP-3 §5 — prima, het cachecontract lag er al). Locaties:
  Limburg(DE)/Gravelines(FR); advies Limburg (dichtst bij NL). RAM-verdict:
  ruim voldoende (zie datapoint). T4-spec + MIP-6 (unattended
  NixOS-inrichting, secrets, auto-updates) zodra de box er is.

## 2026-08-28 (avond) — T3e/T2d/T3f verified+merged; flow-tween LIVE; T2e in flight

- T3e (sol, 26m, 52 tests): kaartframe+maxBounds, dichtstbijzijnde stad,
  histogram-redesign (y-as/banden/hover, lijn-vs-staaf-toggle; sols advies:
  lijn), verleden=observaties, vibe-uurtabel, wind light-mode+zoom-fixes.
- Incident tussendoor: daemon exit 1 "immutable chunk collision" na de
  T2c-gridwijziging (namen dragen grid niet) → data/chunks+manifest geruimd,
  herstart; PO zag daardoor kort 404/lege velden. Structurele fix via T2d.
- Day/night-tinting op PO-verzoek uitgezet (flag, MIP-4 ronde 7).
- T2d (sol, 31m, 15 suites): 32px-blok motion (pySTEPS-medianen 0,27–0,79
  cel/min, bar 1,0), mrf motion-annexen (~0,5–0,7 kB/frame), CLI dump, en
  generatie-suffix in chunknamen (collision/cache-fix). Merged; daemon
  herbouwd+herstart, live annexen geverifieerd.
- T3f (sol, 14m, 55 tests): RG8-motion-textures + masker, tweezijdige
  semi-Lagrangiaanse warp (15-cel-cap), crossfade-fallback, synthgen-motion.
  Merge had één docs/mrf.md-conflict (T2d↔T3f) — unie-resolutie, gesquasht
  in de merge-commit (NB: jj weigert conflicted ancestors te pushen; los
  conflicts op vóór jj new, of squash terug). LIVE op 4173 met echte annexen.
- In flight: T2e (seamless, sol). Web-rij leeg. Openstaand voor PO:
  lijn-vs-staaf-keuze, mobiele-GPU-check wind/warp.

## 2026-08-28 — MIP-5 accepted; T2d/T3f specs queued; track-pijplijn

- MIP-5 accepted met alle aanbevelingen (annex-in-chunk, AROME met cap,
  pySTEPS-LK als executable spec). Contract additief uitgebreid:
  motion-annex per frame + motion_grid in de header (i8-paren, 0,1 cel/min,
  −128 no-data); crossfade blijft fallback.
- Specs geschreven: T2d (motion-schatter + mrf-annex, sol) en T3f
  (warp-shader + synthgen-motion, sol). Pijplijn om conflicts te vermijden:
  crates-rij T2c(terra, loopt) → T2d; web-rij T3d(sol, loopt, incl.
  wind-trails-steer) → T3e (nitpicks) → T3f.
- In flight: T3d, T2c, live-daemon (9 velden zodra T2c landt).
- PO ook: seamless blend (+2…+6 u) in scope → contract-source "seamless" +
  regime-prioriteit bijgewerkt; T2e-spec queued na T2d. Crates-rij is nu
  T2c → T2d → T2e; web-rij T3d → T3e → T3f.

## Backlog (PO-blessed, geen track)

- Open-source-pass (PO 2026-08-28: "nice om te open sourcen later"): LICENSE
  aan de root (workspace zegt al MIT), README per crate, en knmi-grib /
  knmi-hdf5 / mrf als losse crates naar crates.io — incl. verwijzing naar de
  spec/-referentieharnas als conformance-bewijs. Repo is al public.

## 2026-08-28 — PO live-review ronde 2 → T2b + T3c launched

- PO on real data: light basemap duidelijk beter dan dark (dark toont
  EEZ-/maritieme grenzen — weg ermee — en mist terrain-tinten); wil
  Windy-stijl wind-particles, subtieler: onder de regen op ~60% opacity,
  lagere dichtheid, snelheid ∝ wind, subtiele bft-kleurcodering. Vastgelegd
  als MIP-4-amendement.
- Contract additief uitgebreid: veldenlijst (temp_c, feels_like_c,
  wind_u_ms/wind_v_ms als paar met identiek grid/tijden, uv) + quant-regel
  versoepeld (alleen 255=null universeel; quant[0]==0 alleen
  rain/radiation) zodat signed velden passen. Rain/radiation-chunks blijven
  byte-identiek geldig; mrf-validators aan beide kanten moeten de
  versoepeling volgen (in beide specs opgenomen).
- Specs geschreven en gelanceerd: T2b (sol; AROME temp/wind/straling +
  cloud-modified-UV-ingest, feels-like serverside, per-veld quant-tabellen,
  paar-invariant-test) en T3c (sol; dark-parity, wind-particle-layer onder
  regen, temp-labels + switcher, synthgen-uitbreiding; MOTREGEN_SYNTH=1
  workflow tot T2b merged).

## 2026-08-28 — REAL RAIN LIVE: T2 verified+merged; end-to-end wired

- Map-vanished bug (PO report): vite's public-dir middleware caches the file
  list at boot; the T3b-merge config change restarted vite at 15:40:43 and my
  synthgen wrote at 15:41 → /data/* fell through to SPA-fallback HTML.
  Server restart fixed it. Lesson: after regenerating public/ data, restart
  vite dev.
- T2 landed (sol, 1h03m): live RTCOR+nowcast+ranged-AROME ingest (352.9 MB
  i.p.v. 867.4 MB per run), shared 650×700 EPSG:3857 grid, atomic
  manifest/chunks + pruning, HDF5 fixtures + h5py/pyproj cross-checks
  (455k cellen binnen één quant-stap), Caddyfile.dev per MIP-3. Independently
  re-verified: workspace gates green (13 suites), mrf inspect op echte chunk,
  manifest = rtcor 36f + nowcast 25f + harmonie 24f. MERGED.
- Wiring (orchestrator): release binary gebouwd; daemon draait live op main
  (data/); caddy :8080; vite dev proxyt /data → :8080 (MOTREGEN_SYNTH=1 =
  synthetische fallback); 4173 toont echte regen. Committed+pushed.
- Running processes on ageq-mthq: motregen-ingest (daemon), caddy :8080,
  vite dev :4173 — all background tasks of this session.
- Next: PO visual round on real data; MIP-4 fields track (temp/feels-like/
  UV/cloud symbols) as T2b; icon-license check; deploy (T4) when PO wants.

## 2026-08-28 — MIP-3+4 accepted; T2 (echte ingest) launched

- MIP-3 accepted: bare Hetzner/OVH first, Cloudflare deferred until real
  traffic; header contract implemented from day one so CDN is later drop-in.
- MIP-4 accepted with PO modifications: NO field cycler — map shows rain +
  temperature numbers simultaneously (+ sun/cloud icons on trial, test
  overwhelm empirically); temp↔feels-like switcher, default feels-like; no
  isolines. UV: official KNMI open datasets found (`cloud-modified-uv-index`
  Benelux/15-min + daily `uv-index`) → proxy plan dropped. Symbols: KNMI app
  is in the government OSS register — check icon-asset license; else
  Meteocons (MIT)/own, iterate on PO visual feedback.
- Wrote `.dev/specs/track-t2-ingest.md` (sol): real rain end-to-end — shared
  grid + index maps, knmi-hdf5 crate (RTCOR + nowcast, Python cross-checks),
  AROME ranged-tar partial download strategy (avoid 868 MB/h), daemon with
  atomic manifest, caddy dev-serving on 8080 per MIP-3 contract, knmi-grib
  fixture self-skip. Rain only; extra MIP-4 fields = follow-up track.
- In flight: T3b (sol, UX + click-fix), T2 (sol, launching).

## 2026-08-28 — T2a merged (luna!); HAR-bug diagnosed → T3b steer; dev topology

- T2a delivered (14m41s) — but the pane footer read `gpt-5.6-luna low`, NOT
  terra: the herdr queued-prompt model-switch artifact struck again (likely my
  contract soft-steer). Verified extra hard: full gates re-run green
  (7 property tests), quant formula matches spec exactly, AND a
  cross-implementation check: Rust CLI decodes sol's TS synthgen chunk, frame 0
  = exactly width×height bytes. zstd level 19 chosen on measurement. Merged
  with Cargo workspace union (glob members, resolver 3); positive luna-low
  datapoint for tight-spec Rust work. LESSON (mine): first merge-gate receipt
  was false-green via `cargo test | grep` without pipefail — always
  `set -o pipefail` or echo the exit INSIDE the inner shell.
- knmi-grib conformance test hard-fails without data/ fixture (1.2 GB in T1
  worktree; copied to main checkout). Follow-up for T2: fixture strategy
  (self-skip with loud message, or small committed fixture).
- PO HAR analysis (tmp/click_har.log, gitignored): one location click
  re-fetches the whole timeline per frame (83×206 per click). Cause: LRU 32 <
  85 timeline frames + meter samples all frames per click → thrash. T3b
  steered: cache holds full timeline, zero-network second click + test, chunk
  coalescing (>50% of frames → one request), build.sourcemap true.
- Dev topology per PO wish (poke testing): 4173 now runs `pnpm dev` (HMR,
  sourcemaps) from the main checkout, /data served by vite with Range 206
  verified. Real split (data as separate origin + proxy) lands with T2 per
  MIP-3; recorded as T2 spec requirement.

## 2026-08-28 — MIP-4 draft; T1 profiling follow-up merged

- PO refined the sun idea: it's "moet ik me insmeren" (zonkracht/UV, low
  spatial specificity fine), asked about KNMI sun-icon semantics (answered:
  deterministic cloud+precip summary, not a probability), added temp +
  feels-like as map layers, and set the constraint "veel info, niet
  overweldigend" → wrote MIP-4 (informatielagen): one map field at a time
  (rain default + cycler), detail lives in the hourly table, relevance-gated
  chips (insmeer-chip only at UV≥3), extra fields via the contract `field`
  mechanism at reduced resolution, UV as proxy from radiation+solar elevation
  until an official zonkracht source is found. Three open questions for PO.
- T1 profiling follow-up (PO-driven, sol, 4m57s): −0.76% instructions via
  selector short-circuit, peak heap ~4 MB, churn dominated by ecCodes message
  scan; custom GRIB1 scanner sensibly declined (10× under latency bar).
  Gates independently re-run green; follow-up commits merged to main.

## 2026-08-28 — PO visual review → T3 merged; contract field-amendment; T3b

- PO reviewed the preview and gave UX round 1: histogram must BE the scrubber;
  search box missing; layout pass; hourly forecast table incl. sun activity;
  light mode default with a light/system/dark cycler; basemap less
  traffic-focused (no roads). Direction approved implicitly → merged T3
  (PR #1) to main.
- Sun in the hourly table needs a second data field → additive contract
  amendment: optional `field` key (default `rain_rate`), new `radiation`
  (W/m²); MIP-2 §5 rain-rate-only besluit amended (changelog). Backwards
  compatible so terra's in-flight T2a stays valid; terra gets a soft steer to
  optionally include the key in serde types.
- Wrote `.dev/specs/track-t3b-ux-round1.md` (sol): the seven PO changes incl.
  PDOK Locatieserver for search (free, no key, NL-authoritative).
- PO sent T1's pane a perf follow-up himself (Python-vs-Rust delta; why not
  faster) — watcher armed on that pane; any new commits on the merged t1
  branch will need a follow-up merge.
- T2 spec (ingest daemon) queued on T2a landing; will include radiation
  extraction from AROME + download/cadence strategy for the hourly 868 MB tars.

## 2026-08-28 — T3 done+verified (awaiting PO eyes); T1 done+verified+MERGED

- T3 (sol, 8m09s): full shell on synthetic data, PR #1. Independently re-ran
  all gates green (synthgen/typecheck/4 tests/build, exit 0 observed
  synchronously); read mrf.ts — contract-conform incl. Range+progressive and
  non-206 fallback. Preview for PO at http://ageq-mthq:4173 (vite allowedHosts
  fix committed on the track branch; note: `fuser` does not exist on this box —
  kill listeners via `ss -tlnp` pid instead). Merge waits on PO visual check.
  Polish note: ~1 MB bundle (MapLibre) → code-split later.
- T1 (sol, 13m24s): GRIB gate PASSED — knmi-grib crate (eccodes FFI) exactly
  matches cfgrib over all 152,100 values; +1…+24 h decode+de-accumulate median
  0.19 s (bar 2 s). Independently re-ran fmt/clippy/test green incl. the
  elementwise conformance test. PR #2; MERGED to main (clean; devenv.nix grew
  bindgen/libclang env). Key discoveries for T2: AROME publishes an ~868 MB
  run-tar EVERY HOUR (not 4×/day); param = GRIB1 table 253/param 61
  accumulated → hourly de-accumulation; 390×390 lat-lon grid. MIP-1 changelog
  amended accordingly.
- Next: T2 spec (ingest daemon: rtcor+nowcast HDF5, AROME cadence/download
  strategy, reproject to shared grid, mrf encode + manifest) once T2a (terra,
  still working) lands and merges; T3 merge after PO look.

## 2026-08-28 — codex re-auth incident; MIP-3; T2a launched

- Incident: a codex re-auth wiped `~/.codex/config.toml` defaults → workers
  started asking approval per command prefix. Restored defaults
  (approval_policy never, danger-full-access, sol/high) + trusted the herdr
  worktrees dir; Mathijs additionally set both sessions to yolo and restarted
  them himself with continue-prompts. Both T1/T3 confirmed working again.
  Lesson: after any codex re-auth, CHECK config.toml before launching workers.
- PO asked: map track? codec track (server+client)? and ultra-cheap hosting
  (Hetzner/Cloudflare; in-memory serving?). Answers: map is already in T3;
  client mrf decode is in T3; server-side mrf encoder now split off as T2a
  (terra, tight spec — format fully pinned); video-codec epsilon stays gated
  on real frames per MIP-2. Hosting → wrote MIP-3 draft (origin box + Caddy
  static + Cloudflare free, HTTP cache contract; no custom in-memory server —
  page cache does that already). Awaiting PO on MIP-3's three questions.
- Wrote `.dev/specs/track-t2a-mrf-core.md` (quant table v0 pinned: geometric
  0.01→150 mm/h over indices 1..254; zstd level measured 3 vs 19; golden
  fixtures; mrf CLI). Known merge point: workspace root Cargo.toml created by
  both T1 and T2a — orchestrator resolves at merge.
- In flight: T1 (sol), T3 (sol), T2a (terra).

## 2026-08-28 — MIP-1 accepted; contract pinned; T1+T3 launched

- PO sanctioned the stack: Rust ingest ("geen super positieve ervaring met
  Python"), and asked for (a) an immediate sol spike on AROME GRIB parsing with
  the Python library as executable conformance spec — "snel en conform" — and
  (b) an immediate frontend scaffold. On shadcn he said "ook ok" (permissive);
  PM call: staying with MIP-1's SolidJS + Tailwind v4 without shadcn.
- MIP-1 flipped to accepted (§5 records the sanction).
- Pinned `docs/contract.md` (manifest v0 + mrf v0: magic/len/JSON-header with
  frame-offset-index + quant table, independent zstd members, Range +
  progressive decode) so T1/T2 and T3 build against the same wire format
  without coordination.
- Seeded devenv at repo root (rust, node/pnpm, eccodes, hdf5, pkg-config, uv,
  zstd) so parallel tracks don't invent competing envs. Note: transient DNS
  failures on github.com via MagicDNS broke two devenv builds; also, devenv
  can exit 0 while the underlying nix fetch failed — check for devenv.lock as
  the real receipt.
- Wrote `.dev/specs/track-t1-arome-spike.md` (sol; GRIB gate + Python
  reference harness + speed bar ≤2 s) and `.dev/specs/track-t3-frontend-shell.md`
  (sol; shell on synthetic data per contract).
- KNMI license question from PO: all used datasets are CC-BY 4.0 → any use
  incl. commercial is fine with attribution; "Bron: KNMI" requirement added to
  the T3 spec. Use-case field on key registration is informational only.
- Open with Mathijs: drop KNMI keys in `.env` (T1 falls back to the saturated
  anonymous key otherwise). Open for agents: T1 + T3 in flight.

## 2026-08-28 — MIP-2 accepted

- PO adopted MIP-2 with calls: intra-only (YAGNI), quantization floor stays at
  0.01 mm/h (display threshold is a frontend concern), rain rate only. He asked
  for frame-range requests and ideally progressive decode → format amended at
  adoption: fixed-size header with a frame-offset-index (byte offset + length
  per compressed frame), frames as independent zstd members ⇒ HTTP Range on
  arbitrary frame ranges + decode-as-bytes-arrive; reserved per-chunk
  dictionary field for later cross-frame wins (empty in v1).
- PO also noted RainViewer runs on maplibre-gl and looks fine — supports the
  MIP-1 map choice.
- Open with Mathijs: MIP-1 §4 stack sanction (Rust + SolidJS/Tailwind) and the
  two KNMI keys (Open Data API + Notification Service). Open for agents:
  T-specs start the moment MIP-1 lands.

## 2026-08-28 — PO-ronde 1 op MIP-1

- PO answered MIP-1: 3 h history, +24 h midcast (not 48), dev on ageq-mthq +
  dedicated box later, domain already via Porkbun, droplet logo, everything in
  Dutch. Asked for a serious Rust-vs-Python weighing and frontend
  framework/styling proposals (React vs SolidJS vs frameworkless; shadcn vs own).
- Revised MIP-1 (now in Dutch): recommendation flipped to Rust ingest
  (hdf5-metno + eccodes FFI; T1 must decode one AROME GRIB end-to-end as the
  ontbindende voorwaarde; Python stays as uv-based throwaway explorer and T2
  cross-validator). Frontend: SolidJS + Tailwind v4, no shadcn; core
  (decoder/WebGL/time model) framework-free TS so the shell stays swappable.
  Decisions recorded in §5; sole remaining open question = stack sanction.
- MIP-2 and proposals README translated to Dutch; AGENTS.md updated.
- KNMI portal check: Open Data API and Notification Service are separate key
  requests; EDR/WMS not needed. PO registers both keys.
- Open with Mathijs: stack sanction (MIP-1 §4), MIP-2 adoption + its three open
  questions, the two KNMI keys. Open for agents: still nothing until adoption.

## 2026-08-28 — kickoff: research + founding proposals

- PM/PO kickoff (Mathijs = PO, fable = PM/orchestrator, codex sol/terra = workers).
- Verified KNMI data coverage for the unified slider: `nl_rdr_data_rtcor_5m` 1.0
  (history, archive since 2018-12), `radar_forecast` 2.0 (pySTEPS, 25×5 min),
  `harmonie_arome_cy43_p1` 1.0 (hourly to +60 h). Found the seamless 6 h ensemble
  blend product (post-MVP candidate). API: list + presigned URL per file; MQTT
  notification service preferred over polling.
- Anonymous API key is rate-limit-saturated (every probe today 429'd, incl. after
  60 s backoff) → registered key required. PO action.
- Repo scaffolded: jj colocated, `.claude/CLAUDE.md` → `AGENTS.md`, MIP process
  (lightweight composix-CIP variant, flat `.dev/proposals/` per Mathijs).
- Wrote MIP-1 (MVP architecture: Python/uv ingest → shared-grid 8-bit frames +
  manifest → static serving → Vite/TS/MapLibre/WebGL frontend; tracks T0–T5) and
  MIP-2 (mrf binary format, intra+zstd; video-codec idea preserved as measured
  epsilon track). Both Status: draft — awaiting PO.
- Open with Mathijs: adopt/answer MIP-1 + MIP-2 open questions; KNMI key;
  motregen.nl domain. Open for agents: nothing until MIPs land.
