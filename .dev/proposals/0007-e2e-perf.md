# MIP-7: end-to-end- en performancetests — meetbaar voor eindgebruikers

Status: draft
Auteur: orchestrator (fable), 2026-08-31

## 1. Het probleem

We hebben per track unit- en contracttests, maar geen end-to-end-bewijs van
wat de eindgebruiker ervaart: hoe snel staat er regen op het scherm, hoe
soepel scrubt het, hoeveel data kost een sessie. De PO wil juist die
perf-achtige eigenschappen goed testbaar maken — inclusief op echte
apparaten (de mobiele-GPU-vraag staat al sinds T3c open omdat headless
SwiftShader niet representatief is: 23 fps daar zegt niets over een
telefoon).

## 2. Eerder werk

- Playwright: scriptbare echte browser; goed voor functionele e2e,
  netwerk-assertions en latency-metingen; NIET voor fps op onze
  GPU-loze machines (SwiftShader).
- Core Web Vitals (LCP/INP/CLS) + Resource Timing/PerformanceObserver:
  standaard browser-API's — metingen kunnen dus ín de app zelf, op elk
  apparaat, zonder tooling.
- Het klik-HAR-incident (83 requests per klik) bewees al dat
  netwerk-economie een regressiegevoelig, testbaar contract is: "tweede
  klik = nul netwerk" is sindsdien een unit-test — dat principe verdient
  uitbreiding naar sessieniveau.
- Deterministische data bestaat al: synthgen + `pnpm preview` geeft een
  reproduceerbare omgeving; de echte pipeline via caddy voor live-metingen.

## 3. Aanbeveling — drie lagen

**Laag 1: perf-HUD in de app (de eindgebruikers-laag).** Een klein
framework-vrij metrics-moduul dat continu meet en met `?perf=1` (of een
triple-tap op het logo) een overlay toont: **TTFR** ("time to first rain":
load → eerste WebGL-regenframe), scrub-latency (input → frame, p50/p95),
lopende fps tijdens afspelen én particles, sessie-bytes en request-count,
manifest-leeftijd. Dit maakt perf letterlijk afleesbaar voor de PO op elk
apparaat — dé oplossing voor de open mobiele-GPU-vraag. Geen beaconing in
v1 (RUM naar de origin kan later, privacy-licht, aparte beslissing).

**Laag 2: lab-suite met budgetten (de gate-laag).** Playwright-suite in
`web/e2e/` tegen preview+synthgen (deterministisch): cold load → TTFR-budget;
warm reload → alles uit cache (bytes ≈ manifest-only); scripted scrub over
de hele tijdlijn → geen request-storm, geen errors; locatieklik 1 en 2 →
tweede klik nul netwerk (sessie-versie van de bestaande unit-test);
sessie-totaalbudget (bytes, requests). Budgetten als
falende assertions, startwaarden (te kalibreren in de track): TTFR < 2,0 s
cold / < 0,5 s warm, tweede klik = 0 requests, volledige sessie < 8 MB.
Draait via `pnpm e2e` en in de gates van frontend-tracks. fps wordt hier
bewust NIET geasserteerd (SwiftShader) — wel gelogd als indicatie.

**Laag 3: live-smoke (de productie-laag).** Een klein script (later
systemd-timer op de VPS): manifest-versheid < 15 min, headers conform
MIP-3, Range → 206, frontend-index 200, TTFR-meting via Playwright tegen
de echte site (informatief, geen gate). Hoort bij T4's runbook.

## 4. Open vragen

1. **Budgetwaarden**: de startwaarden hierboven redelijk? (Ze zijn bewust
   streng-maar-haalbaar; de track kalibreert en documenteert.)
2. **HUD-activatie**: `?perf=1` + triple-tap ok, of liever altijd een
   subtiel fps-getalletje in een hoekje in dev-builds?
3. **RUM-beaconing** (echte-gebruikersmetingen naar de origin): nu meteen
   meenemen of aparte latere beslissing? (Aanbevolen: later.)
4. **CI**: de repo is public — GitHub Actions kan de lab-suite + workspace-
   gates gratis draaien bij elke push. Meenemen in deze track of apart?

## Changelog

- 2026-08-31: draft.
