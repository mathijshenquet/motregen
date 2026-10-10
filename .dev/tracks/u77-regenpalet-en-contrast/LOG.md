# U77 — live-pane: regenpalet en contrast met de kaart (opus-5.5)

Append-only. Spec: `.dev/specs/track-u77-regenpalet-en-contrast-live.md`. Preview: http://ageq-dev2:4320/?dev

## 2026-10-10 14:25 — ingelezen, diagnose (opdracht 1)

Preview 4320 draait (`MOTREGEN_DATA_ORIGIN=https://motregen.nl/data pnpm preview --host 0.0.0.0 --port 4320
--strictPort`, los van de sessie gestart; `scripts/track-preview.sh` uit de spec bestaat niet in deze checkout).

### Correctie op de spec: Weer-modus vermenigvuldigt niet
`rainPresentation` zet `multiply` alleen bij wind- of luchtfocus ≥ 0,5 (overdag). In Weer ligt de regen met gewone
alfa over de kaart (`data-rain-blend="normal"`, dekking 1,00 — gecontroleerd op de pagina).

### De oorzaak: de regencanvas optelt licht bij de kaart
De regen tekent op een eigen canvas (`LayerOverlay`, `premultipliedAlpha: true`) met
`gl.blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)`. Die functie geldt ook voor het alfakanaal: op de lege canvas komt
kleur × α in RGB en **α × α in alfa**. De browser leest de canvas als voorvermenigvuldigd en mengt dus
`kleur × α + (1 − α²) × kaart` in plaats van `kleur × α + (1 − α) × kaart`. De gewichten tellen op tot meer dan 1
(maximaal 1,25 bij α = 0,5): onder halve dekking **maakt regen de kaart lichter** in plaats van hem te kleuren.

Gemeten, niet alleen afgeleid (`rig/halo-probe.ts`, `metingen/halo-probe-huidig.log`; radar 14:15, alleen de
regencanvas op zwart en op wit, 1280 px):
| byte (mm/u) | pixels | dekking uit het palet (α) | α² | canvas-alfa gemeten |
| --- | --- | --- | --- | --- |
| 1–15 (< 0,02) | 24 066 | 0,055 | 0,003 | 0,012 |
| 15–30 (0,02–0,03) | 21 706 | 0,137 | 0,019 | 0,029 |
| 30–45 (0,03–0,05) | 16 952 | 0,233 | 0,054 | 0,056 |
| 45–55 (0,05–0,08) | 10 707 | 0,312 | 0,098 | 0,098 |

De canvas-alfa volgt α², niet α (de twee laagste klassen wijken af door 8-bit-afronding van een rood-kanaal van 1–7).
Eerste poging mat op het blauwe kanaal en gaf "alfa = α": de beginkleur heeft blauw = 255 en loopt op wit vast op 255,
dus die meting kon het verschil niet zien. Weggegooid; rood gebruikt.

### Welke kleur krijgt een pixel? (berekend uit palet × alfacurve × menging; L* = helderheid, Δ t.o.v. de ondergrond)
Ondergronden uit `licht.json`/`donker.json`: land `#f8f4f0` / `#101d21`, water `rgb(158,189,255)` / `#183746`,
bebouwing (zoom ≤ 9) ≈ 222,218,217 / `#26302c`. "nu" = wat de canvas doet (α²), "zuiver" = echte alfa-over.

| mm/u | byte | paletkleur | α | ondergrond | nu | zuiver |
| --- | --- | --- | --- | --- | --- | --- |
| 0,03 | 30 | 54,183,255 | 0,19 | dag land (L* 96) | 249,255,255 · L* 100 · **Δ +3,2** | 211,233,243 · Δ −5,3 |
| 0,03 | 30 | | | dag water (L* 77) | 163,217,255 · Δ +7,7 | 138,188,255 · Δ −1,4 |
| 0,03 | 30 | | | dag bebouwing (L* 87) | 224,245,255 · Δ +8,0 | 190,211,224 · Δ −3,9 |
| 0,1 | 62 | 51,190,246 | 0,39 | dag land | 230,255,255 · L* 98 · **Δ +1,9** | 172,223,242 · Δ −10,4 |
| 0,1 | 62 | | | dag water | 154,234,255 · Δ +11,8 | 116,189,252 · Δ −2,3 |
| 0,1 | 62 | | | dag bebouwing | 208,255,255 · Δ +9,6 | 156,207,228 · Δ −7,0 |
| 0,3 | 90 | 38,217,210 | 0,56 | dag land | 190,255,255 · L* 96 · **Δ −0,5** | 129,229,223 · Δ −11,4 |
| 0,3 | 90 | | | dag water | 129,251,255 · Δ +15,5 | 90,205,230 · Δ +0,4 |
| 0,3 | 90 | | | dag bebouwing | 173,255,255 · Δ +7,7 | 118,217,213 · Δ −6,4 |
| 1 | 122 | 116,228,135 | 0,76 | dag land | 192,255,203 · L* 95 · **Δ −1,6** | 147,232,160 · Δ −11,2 |
| 1 | 122 | | | dag water | 154,253,209 · Δ +15,8 | 126,219,163 · Δ +4,0 |
| 1 | 122 | | | dag bebouwing | 181,255,193 · Δ +6,6 | 141,226,154 · Δ −4,2 |
| 0,1 | 62 | 51,190,246 | 0,39 | nacht land (L* 10) | 33,98,124 · Δ +29,0 | 30,92,116 · Δ +26,6 |
| 0,1 | 62 | | | nacht water (L* 21) | 40,120,155 · Δ +25,8 | 34,107,138 · Δ +20,8 |
| 0,1 | 62 | | | nacht bebouwing (L* 19) | 52,115,133 · Δ +26,4 | 43,103,122 · Δ +21,8 |
| 1 | 122 | 116,228,135 | 0,76 | nacht land | 95,186,117 · Δ +58,8 | 92,181,111 · Δ +57,1 |

Lezen:
- **Overdag boven land is alle regen tot 1 mm/u even licht als of lichter dan de kaart zelf** (L* 95–100 tegen 96):
  een pixel van 0,03–0,1 mm/u wordt 249,255,255 / 230,255,255 — vrijwel wit met een zweem cyaan. Dat is de "witte
  halo". Het helderheidsverschil met land is 0 tot +3 L*: de regen onderscheidt zich alleen nog in tint. Dat is ook
  de "low contrast" uit de gebruikersfeedback.
- Boven water en bebouwing wordt lichte regen duidelijk LICHTER dan de ondergrond (+8 tot +16 L*): dezelfde bui is
  boven land onzichtbaar-wit en boven de Noordzee een lichte vlek.
- 's Nachts speelt het nauwelijks: de kaart is donker, optellen en mengen komen op hetzelfde neer (verschil 2–5 L*).
- Met zuivere menging zou hetzelfde palet de kaart overdag wel donkerder maken (−4 tot −11 L*), maar boven water
  blijft het ±0: lichtblauw op lichtblauw water. Daar helpt alleen een donkerder begin van het palet.

### De drie factoren, elk gemeten of nagerekend
1. **Menging (hoofdoorzaak)**: de α²-canvas hierboven. Geldt voor elke dekking onder ~0,6, dus voor alles tot ~0,4 mm/u.
2. **Alfacurve + paletbegin**: α = min(210, byte × 1,6)/255 loopt vanaf byte 0 lineair op, en het palet is tot byte 55
   één vaste lichtblauwe kleur. De hele aanloop is dus "een beetje lichtblauw" — precies het gebied waar factor 1 het
   hardst optelt.
3. **Smoothing (maakt het gebied groot)**: de ruwe data kent geen waarden onder byte 55 (≈ 0,08 mm/u); alles daaronder
   ontstaat door interpolatie tussen droog (byte 0) en regen. Zelfde frame, zelfde uitsnede:
   | regenveld | regenpixels | waarvan onder de inzet (byte < 55) |
   | --- | --- | --- |
   | blokken (de data zelf) | 125 272 | 0 (0 %) |
   | bilineair (vóór U72) | 141 346 | 21 063 (14,9 %) |
   | auto (blur, sinds U72) | 209 325 | 73 431 (35,1 %) |
   De blur rekent op de byte (logaritmische schaal), dus een rand van droog naar 1 mm/u wordt een lineaire helling
   door alle bytes 0…122: een brede zoom van 0,01–0,1 mm/u die in de data niet bestaat. Sinds U72 is ruim een derde van
   het gekleurde oppervlak zo'n zoom, en het getekende regengebied is 67 % groter dan de data.

Bijvangst voor de orkestrator: dit verklaart ook de U62-bevinding "dimmen via alfa maakt geel crème / solarized" in
Wind en Lucht. Vermenigvuldigen (MIP-24-aanvulling) omzeilde het symptoom; de oorzaak is dezelfde canvas-alfa.
Wind/Lucht laat ik in deze track ongemoeid (afbakening: alleen de menging in Weer).

### Plan
- `rainColormap()` zonder argumenten blijft byte-voor-byte de huidige tabel (de bot en U76 lezen die); palet, menging
  en thema worden optionele argumenten. Test pint de huidige tabel vast.
- Paletten in `web/src/core/rain-palette.ts`; mengvarianten: `huidig` (α²-canvas), `zuiver` (echte alfa-over),
  `drempel` (niets onder de inzet, daarna meteen dekkend), `steil` (de zoom meteen dekkend), `rand` (drempel + dunne
  contour). De contrastregel werkt op de inzet van de schaal en geldt voor de varianten met een dekkende inzet.
