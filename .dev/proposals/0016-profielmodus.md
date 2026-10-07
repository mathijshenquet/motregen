# MIP-16 — Profielmodus: zien wat de tijd opslokt (vooral op de telefoon)

Status: accepted (PO 2026-10-07: "?perf url is eigenlijk wel genoeg, het kan ook een puur
tailnet ding zijn, daar kan ik vanaf mijn mobiel bij"; "ga maar aan de slag")

## Het probleem

De app loopt soepel op de MacBook en stroperig op mobiel. De perf-HUD (MIP-7) meet *hoeveel*
(TTFR, scrub-latency, fps, repaints, isolijn-tellers) maar niet *wie* de hoofddraad bezet houdt.
Zonder stacks en fase-attributie zijn optimalisatieplannen gokwerk; de enige profile tot nu toe
(warme MacBook, 2026-09-25) ligt in `~/tmp` en is op een telefoon niet te herhalen.

## Eerder werk

- MIP-7: dezelfde browsermetingen voeden HUD en Playwright-gate; geen metingen naar een server.
- U30/MIP-12: `?perf=1` verviel; de HUD opent via `?dev` of drie tikken op het logo.
- Firefox Profiler importeert Chrome-traces (Trace Event-formaat, `.cpuprofile`) en Gecko-
  profielen; de PO kent dat werktuig al (`ffprof-threads.py`).
- Browser-API's: `PerformanceObserver` op `long-animation-frame` (Chrome 123+, scriptattributie
  per lange frame), User Timing (`performance.mark/measure`), JS Self-Profiling API
  (`new Profiler({sampleInterval})`, Chrome en Chrome-Android, vereist responseheader
  `Document-Policy: js-profiling`; geeft sampling-stacks in productiebuilds).

## Aanbeveling

Drie lagen, oplopend in kosten:

1. **Altijd aan, gratis**: User Timing-marks/measures rond onze eigen fasen (frame-decode,
   textuur-upload, isolijn-trace + blit, windstap, scrubber-paint, tabel-render, basemap-tiles)
   en een `long-animation-frame`-observer. De snapshot (HUD + `Kopieer JSON`) krijgt per fase
   p50/p95 en een top-5 van lange frames met scriptbron. Geen opslag, geen netwerk.
2. **Opname op aanvraag via `?perf`**: de URL zet een vlag in `localStorage` (één keer typen
   op de telefoon volstaat; `?perf=0` zet hem uit) en toont een kleine opnameknop. Een opname
   van 30 s combineert JS Self-Profiling-samples (waar beschikbaar), de marks en lange frames
   tot één bestand in Trace Event-formaat dat Firefox Profiler en Perfetto direct importeren.
   Safari/Firefox leveren alleen marks + lange frames (geen stacks).
3. **Afleveren op het tailnet**: de opname gaat per `POST /prof` naar de dev-preview op
   ageq-mthq (bereikbaar vanaf de telefoon via Tailscale); een klein collector-script schrijft
   hem naar `~/motregen-profiles/<datum>-<ua>.json` (regenereerbare hoststaat). Op desktop ook
   `Kopieer`. Productie (motregen.nl) krijgt géén `/prof` en geen `Document-Policy`-header
   totdat een aparte beslissing dat verandert; `?perf` werkt daar alleen voor laag 1 + lokale
   download.

Daarna: een meetbaar optimalisatiespoor (metriek: p95 frametijd tijdens afspelen op een
Pixel-klasse toestel, en TTFR koud op 4G) waar een agent per ronde één fase aanpakt.

## Open vragen

1. Sample-interval: 10 ms (Chrome-minimum op Android is doorgaans 16 ms); maxBufferSize 30 s.
2. Of de `?perf`-vlag ook de HUD open zet (voorstel: ja, compact).
3. Of een opname automatisch start bij laden (koude start profileren) — voorstel: een
   tweede knop "Koude start" die de vlag zet en herlaadt.

## Besluit

PO 2026-10-07: akkoord met de drie lagen; `?perf` als poort; afleveren mag puur op het tailnet.
Open vragen worden door de track (U43) met voorstel-defaults ingevuld; de PO beoordeelt op de
eerste echte opname.

## Changelog

- 2026-10-07: aangemaakt en geaccepteerd (PO, chat).
