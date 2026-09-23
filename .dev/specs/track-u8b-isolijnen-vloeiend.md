# Track U8b — isolijnen: 1 °C, afwisselend streep/stip, alleen lijnlabels, vloeiend tweenen (claude opus)

Read first: `AGENTS.md`, `.dev/specs/track-u8-temperatuur-isolijnen.md`,
`web/src/core/isolines.ts` (+ worker, tests), `web/src/core/focus-mode.ts`,
`web/src/App.tsx` (`showIsolines`, `isolinesActive`, focus-effecten,
`temperatureLayer`-zichtbaarheid), `web/src/core/temperature.ts`,
`web/src/core/rain-layer.ts` (custom WebGL-laag met geblende
textures — voorbeeld voor een GPU-variant). Your LOG:
`.dev/tracks/u8b-isolijnen-vloeiend/LOG.md` — committed, append-only,
timestamped. Branch: `track/u8b-isolijnen-vloeiend` vanaf main. Eigen
worktree. Integratie-instantie met echte data: http://ageq-mthq:4300/.

## PO-feedback op U8 (2026-09-23): "super gaaf, maar…"

1. **Stap 1 °C** i.p.v. 2, met afwisselende lijnstijl: even graden
   doorgetrokken, oneven gestreept (of stippel) — zodat 1 °C leesbaar
   blijft zonder drukte. Houd de stap-knop (1/2/5) maar default 1.
2. **In focusmodus verdwijnen de losse stadstemperatuurlabels**; de
   waarde staat alleen nog als annotatie op de lijnen. Ook getweend
   (labels faden uit terwijl de lijnen infaden).
3. **Vloeiend tweenen tussen tijdstappen** — nu schokkerig. PO-keuze:
   liever lagere nauwkeurigheid en een gladdere overgang; de fout van een
   isolijn is toch klein. Onderzoek eerst WAAR de schok zit (meet: hoe
   vaak wordt `showIsolines` daadwerkelijk herberekend tijdens afspelen en
   scrubben, hoe lang duurt één worker-ronde op desktop/mobiel, verandert
   de lijntopologie sprongsgewijs bij `setData`?). Kies dan, met
   motivering in LOG:
   a. GPU-variant: contouren in een fragmentshader op de al geblende
      veldtexture (zoals de regenlaag), per frame continu, met parity-
      dash in de shader; labels blijven uit de (goedkopere, tragere)
      worker-geometrie en mogen op een lagere cadans meelopen. Dit is
      per definitie vloeiend en waarschijnlijk de juiste keuze.
   b. CPU-variant: worker op een grover grid (2× subsample) + meer blur,
      herberekening op elke mix-wijziging met een frame-budget, en
      GeoJSON-updates die niet meer dan ~1 per 50 ms doen.
   Meetlat: tijdens afspelen geen zichtbare sprongen (video/frames in LOG),
   frametijd mobiel profiel binnen `docs/perf.md`-baseline in focusmodus.
4. Knoppen: stap, dash-aan/uit, blur/subsample, label-cadans.

## Gates

`pnpm typecheck`, `pnpm test`, `pnpm build`, `MOTREGEN_E2E_PORT=4303
MOTREGEN_E2E_DATA_PORT=8303 pnpm e2e` green, synchrone exit statussen in
LOG. Korte Playwright-video van afspelen in focusmodus vóór/na. Draft-PR
vroeg. Geen codex. U9 (histogram) en U10 (versheid) werken parallel in
App.tsx — houd je diff daar bij de isolijn-/focuspaden.
