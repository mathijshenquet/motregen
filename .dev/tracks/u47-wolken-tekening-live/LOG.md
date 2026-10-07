# LOG — track U47 wolkentekening live (claude-opus-5-5)

## 2026-10-07 10:24 — start, preview, stap 1 gebouwd (wacht op PO)
- Preview: `cd web && pnpm install --frozen-lockfile && pnpm synthgen && pnpm build &&
  MOTREGEN_DATA_ORIGIN=https://motregen.nl/data pnpm preview --host 0.0.0.0 --port 4350 --strictPort`
  → http://ageq-mthq:4350/. `synthgen` (tsx) en de preview draaien buiten de Claude-sandbox: tsx
  krijgt daar EPERM op zijn IPC-socket.
- PO-aanvulling bij de start: de volle behandeling (hemelachtergrond op licht, vibe) hoort in de
  nieuwe modus Lucht (U42); Weer blijft subtiel. Tot U42 gemerged is: bouwen in de huidige
  wolkenmodus, subtiele variant als parameter. Die parameter komt bij stap 3 (hemel), stap 1 heeft
  hem niet nodig: buiten de wolkenmodus staan de lagen al op 50 % (`CLOUD_LAYERS_DEFAULT_OPACITY`).
- Stap 1, gaten in plaats van transparantie (`cloud-section.ts`): de tijdas is per laag in vakken
  verdeeld (laag 0,75 u, midden 1,5 u, hoog 1 u; minstens 34 px), elk vak hoogstens één wolk met
  lengte = fractie van het vak, dus verwachte bedekte lengte = fractie. Onder 30 % worden wolken
  zeldzamer in plaats van kleiner; vanaf 90 % (`CLOSED_FRACTION`) een gesloten band, aangrenzende
  gesloten vakken zijn één pad. Vorm per laag: laag = koepel met bollen op een vlakke basis, midden =
  plak, hoog = veeg (dikte begrensd door lengte / aspect). Vulling vast op .92 via CSS; de
  dekkingsgradiënt per uur (`stops`, `cloudDrawParams`) is weg.
- Receipts (synchroon): `pnpm typecheck` → 0; `pnpm vitest run src/core/cloud-section.test.ts
  src/components/HistogramScrubber.test.tsx` → 0 (23 tests); `pnpm build` → 0.
- Niet gedaan: zelf gekeken (geen stills in deze loop); commit volgt na PO-akkoord.

## 2026-10-07 10:25 — dev-host heet ageq-dev2
- Orkestrator: Vite blokkeerde de preview op de nieuwe hostnaam. `git merge main` (fast-forward naar
  001b297, allowedHosts), `pnpm build` → 0, preview herstart. URL: http://ageq-dev2:4350/.

## 2026-10-07 10:32 — canoniek: Weer rustig, Lucht vol (orkestrator, PO-verduidelijking in U42)
- Weer: de drie lagen rustig onder het regenhistogram zoals vóór U42 = mijn subtiele variant.
  Lucht: dezelfde lagen met volle nadruk + kaartsluier = de volle behandeling (hemel op licht, vibe).
  Geen actie nu; bepaalt de parameter bij stap 3.

## 2026-10-07 15:06 — PO-bug: basis van lage wolken viel tegen de onderrand
- Lage laag heeft een eigen basislijn op 70 % van zijn strook (`baseline: 0.7`, was 90 %) en een
  dikte van hoogstens 50 % van de strook (was 80 %), zodat onder- én bovenkant vrij staan.
- Receipts (synchroon): `pnpm typecheck` → 0; `pnpm vitest run src/core/cloud-section.test.ts
  src/components/HistogramScrubber.test.tsx` → 0 (24 tests); `pnpm build` → 0.
- Main niet gemerged (wacht op U42, opdracht orkestrator).

## 2026-10-07 15:08 — werkwijze: zelf kijken vóór elk "klaar, herlaad" (orkestrator)
- Nieuw: `web/scripts/scrubber-shot.ts` (wolkenmodus, desktop 1280 + mobiel 390, licht + donker,
  optioneel toetsen om een ander moment te kiezen). Repro, buiten de sandbox en onder een slot:
  `cd web && scripts/e2e-slot.sh pnpm exec tsx scripts/scrubber-shot.ts http://127.0.0.1:4350 /tmp/shots stap1 "PageUp,PageUp"`
  → SHOT-EXIT 0 (vier runs: nu, +6, +12, +18 PageUp).
- Gezien: gaten en gesloten banden werken in alle drie de lagen; lage stapelwolken hebben een
  zichtbare vlakke basis met lucht eronder (basislijn-fix klopt).
- Gezien, niet opgelost (voor de PO): (1) regenbalken staan vóór de lage wolken en dekken hun basis af
  waar het regent; (2) op 390 px zijn losse lage wolkjes bij weinig bewolking ~12 px brede hoedjes;
  (3) een gesloten cirrusband oogt even zwaar als de middenlaag (stap 2); (4) cursor-tags lopen op
  mobiel rechts uit beeld als de cursor bij de muur staat (bestond al).

## 2026-10-07 15:16 — PO: "meer een soort worsten" → vormen opnieuw getekend
- Oorzaak: elke wolk was één buis met afgeronde uiteinden en ruisranden. Nu: laag en midden zijn een
  rij overlappende bollen (omtrek = bovenrand van hun vereniging; laag op een vlakke basis, midden
  afgeplat met een ondiepe onderkant, basislijn op 62 %), cirrus is een bundel dunne spitse vegen
  die dezelfde kant op hellen (22 px tussenruimte, 52 px lang), ook als de laag gesloten is.
- Eerste poging (midden als brede lenzen, cirrus als één golvende band) zelf afgekeurd op de stills:
  nog steeds een worstenketting.
- Receipts (synchroon): `pnpm typecheck` → 0; `pnpm vitest run src/core/cloud-section.test.ts
  src/components/HistogramScrubber.test.tsx` → 0 (24 tests); `pnpm build` → 0; stills
  `scrubber-shot.ts … veeg{6,12,18}` → SHOT-EXIT 0 (genomen vóór de laatste testwijziging, zelfde
  tekencode).
- Gezien: lage laag leest als stapelwolken, midden als bobbelig dek, hoog als cirrusvegen. Open:
  gesloten cirrus heeft lucht tussen de vegen, dus 100 % hoog oogt niet dicht.

## 2026-10-07 15:17 — correctie op de vorige entry
- De vorige entry noteerde de testrun als 0 terwijl hij op dat moment 1 was (één falende test). Oorzaak:
  `sin(π·positie) ** 1.5` werd aan de punt van een cirrusveeg door afronding NaN, dus er stond NaN
  in het pad. Opgelost met een ondergrens van 0. Daarna synchroon: `pnpm typecheck` → 0;
  `pnpm vitest run src/core/cloud-section.test.ts src/components/HistogramScrubber.test.tsx` → 0
  (24 tests); `pnpm build` → 0; still `def12` → SHOT-EXIT 0.
