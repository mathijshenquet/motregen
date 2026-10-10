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

## 14:57 — gebouwd, bekeken, gemeten: klaar voor PO-blik (niets als standaard vastgezet)

### Wat er staat (`?dev` › Kaart; eigenaar U77, vervalt 2026-10-17; `docs/dev-opties.md` bijgewerkt)
- **Regenpalet**: `huidig` · `blauw-grijs-rood` (PO) · `blauw-violet-rood` · `oplopend-donker`. Elk palet heeft een
  eigen reeks voor de lichte en de donkere kaart (`PALETTE_STOPS` in `web/src/core/rain-palette.ts`); de laag wisselt
  de opzoektabel als de kaart omslaat. De grenzen licht/matig/zwaar zijn die van het histogram (2,5 en 7,5 mm/u).
- **Regenmenging** (alleen Weer; Wind en Lucht houden `huidig`, de PO-keuze uit U62):
  | stand | dekking | canvas | wat je ziet |
  | --- | --- | --- | --- |
  | `huidig` | lineair vanaf byte 0 | α² (telt licht op) | de witte halo |
  | `zuiver` | idem | echte alfa-over | alleen de fout eruit: zachte blauwe waas, de kaart blijft op kleur |
  | `steil` | 0 → 0,55 over byte 2–12 | alfa-over | de hele gladgestreken zoom dekkend; het gebied is groter dan de data |
  | `drempel` | 0 → 0,55 over byte 25–37 | alfa-over | niets tot de rand van de data, daar meteen dekkend |
  | `rand` | als drempel | alfa-over | plus een dunne contour (shader, `fwidth`) |
  De drempel ligt op byte 31: halverwege droog en de lichtste radarregen (0,1 mm/u = byte 62). Na het gladstrijken
  ligt de rand van de data precies daar, dus het getekende gebied is weer het gebied van de data.
- **Contrastregel** (`onsetContrastShift`, toegepast in `buildRainColormap` voor steil/drempel/rand): de beginkleur
  schuift per palet en thema op (dag naar zwart, nacht naar wit) tot de lichtste zichtbare regen op land, water én
  bebouwing minstens 15 L* verschilt; de verschuiving loopt over de lichte band uit, matig en zwaar houden het
  palet. Regen maakt de kaart daarmee overdag altijd donkerder en 's nachts altijd lichter (de "ondergrens" uit de
  spec). `huidig` en `zuiver` hebben geen dekkende inzet en dus geen garantie. De ondergronden staan als
  `GROUND_COLOURS` in de code; de test leest `licht.json`/`donker.json` en faalt als de kaartstijl ervan wegloopt.
  Wat de regel oplevert (`rig/onset-contrast.ts`, `metingen/contrast-van-de-inzet.md`):
  | palet | thema | beginkleur palet | na de regel | land | water | bebouwing |
  | --- | --- | --- | --- | --- | --- | --- |
  | huidig | dag | 51,190,246 | 34,125,162 | 26,1 | 15,3 | 21,8 |
  | huidig | nacht | 51,190,246 | ongewijzigd | 36,2 | 29,1 | 30,5 |
  | de drie blauwe | dag | 64,152,238 | 50,119,186 | 26,4 | 15,1 | 21,7 |
  | blauw-grijs-rood, blauw-violet-rood | nacht | 66,120,214 | ongewijzigd | 23,7 | 16,8 | 18,2 |
  | oplopend-donker | nacht | 58,118,188 | ongewijzigd | 22,4 | 15,6 | 16,6 |
  Eerst stond het minimum op 10: in beeld te weinig voor blauw op het lichtblauwe water. Nu 15.
- **Histogram**: `rainColor(waarde, look)` leest dezelfde tabel; `beelden/histogram-dag-1280.webp`.
- **Eén bron**: `rainColormap()` zonder argument is byte voor byte de tabel van vóór U77 (test met de oude code als
  orakel, beide thema's). VOOR DE ORKESTRATOR/U76: naam en vorm van de export zijn gelijk; er is alleen een optioneel
  argument `look: { palette, blend, theme }` bij gekomen (ook op `rainColor`). `bot/` is niet aangeraakt.

### Geschrapt: blauw → paars → magenta (de gangbare radarschaal)
Gebouwd en gemeten, haalt de eis "bruikbaar bij rood-groen-kleurenblindheid" niet: zonder rood- of groengevoelige
kegeltjes lijken blauw, paars en magenta op elkaar (kleurverschil licht–zwaar 10–15, matig–zwaar 10–11, waar de lat
20 is). Niet in de knop gezet. De toets (`rain-palette.test.ts`, tabel in `metingen/bandverschil-per-palet.md`;
CIE76 tussen 0,5 / 4,5 / 15 mm/u, normaal · protanopie · deuteranopie):
| palet | thema | normaal l–m / m–z / l–z | protanopie | deuteranopie |
| --- | --- | --- | --- | --- |
| huidig | dag | 93 / 53 / 122 | 66 / 36 / 45 | 74 / **19** / 64 |
| blauw-grijs-rood | dag | 48 / 76 / 103 | 45 / 34 / 78 | 49 / 56 / 102 |
| blauw-grijs-rood | nacht | 43 / 75 / 99 | 40 / 42 / 70 | 46 / 51 / 91 |
| blauw-violet-rood | dag | 38 / 85 / 102 | 23 / 70 / 75 | 22 / 88 / 100 |
| blauw-violet-rood | nacht | 39 / 69 / 96 | 29 / 55 / 69 | 40 / 64 / 93 |
| oplopend-donker | dag | 34 / 35 / 55 | 24 / 32 / 48 | 22 / 38 / 53 |
| oplopend-donker | nacht | 44 / 37 / 76 | 41 / 34 / 73 | 42 / 38 / 79 |
Het PO-palet is het sterkst: grijs is voor elk kleurzicht iets anders dan blauw en dan rood. Violet en
oplopend-donker halen de lat pas nadat ik de matige band ook in helderheid van de lichte heb losgetrokken (ze zaten
op 13–18). Het huidige palet zakt bij deuteranopie op geel tegen oranjerood (19); de test dekt alleen de nieuwe.

### Beelden (`beelden/`, 22 stuks; rig `rig/look-shots.ts` + `rig/run-look-shots.sh`, kopieer naar `web/tmp/u77/`)
Elk beeld is één pagina; de stand wisselt via de dev-knoppen, dus elke cel is hetzelfde frame en dezelfde uitsnede.
- `paletten-{radar,harmonie}-{dag,nacht}-{1280,390}`: nu · PO-palet met menging huidig · huidig + drempel · de drie
  nieuwe paletten + drempel.
- `mengingen-{radar,harmonie}-…`: het PO-palet in de vijf mengingen; `mengingen-stad-radar-…` hetzelfde op zoom 9.
- Radar = 14:15 vandaag (lichte buien én rode kernen in Friesland en Brabant); `nacht-vast` = donker thema met
  Expressief uit, want een radartijd overdag heeft geen nacht. HARMONIE: de spec vraagt +6 u, maar dat is nog de
  blend (U72); genomen op +9 u (23:40, nacht) en +23 u (morgen 13:40, dag), bron per beeld `harmonie harmonie`.
- `histogram-dag-1280`, en `modus-wind-lucht-dag-1280` (de paletten in Wind en Lucht).
Zelf bekeken: paletten radar dag 1280 + 390, radar nacht 1280 (vorige paletronde), harmonie dag + nacht 1280;
mengingen radar dag 1280, harmonie dag 1280, stad dag 1280 (vorige ronde), stad nacht 390; histogram; wind/lucht.
NIET stuk voor stuk bekeken: de overige 390-beelden en mengingen nacht 1280 (wel gemaakt, 0 mislukt).

### Wat ik zie
- **De menging is het probleem, het palet niet.** `paletten-*`, cel 2: het PO-palet met menging `huidig` houdt de
  witte waas. Op HARMONIE overdag (`paletten-harmonie-dag-1280`, cel 1 en 2) bleekt de halve kaart wit weg: het
  weermodel heeft brede velden van 0,01–0,1 mm/u en de 9×9-blur smeert die nog verder uit.
- `drempel` haalt dat in alle acht scènes weg: de kaart houdt zijn kleur, een bui heeft een rand, en die rand ligt
  waar de data regen heeft. `zuiver` is de kleinste ingreep maar blijft een waas, boven zee bijna onzichtbaar.
  `steil` tekent ruim de helft meer oppervlak dan er regen is (op HARMONIE loopt het vlak door tot in Brabant).
  `rand`: ingezoomd geeft de contour houvast, op landelijk niveau wordt het druk (honderden buitjes met een lijntje).
- Prijs van `drempel`: breed motregenveld in HARMONIE wordt één vlak met een harde rand en gaten (`…harmonie-dag`).
  Daarom staat de inzetdekking op 0,55 en niet op 0,7: op 0,7 verdwenen plaatsnamen en grenzen onder de plaat.
- **Blauw op deze kaart is lastig**: het water van de basiskaart is zelf lichtblauw (158,189,255). "Lichtblauw" als
  begin van het palet is boven zee onzichtbaar; de regel maakt er overdag middenblauw van (50,119,186). Boven de
  Noordzee blijven de blauwe paletten het zwakst — daar wint het huidige palet met drempel, omdat turquoise in tint
  van het water afwijkt. Buiten deze track: een grijzer of bleker water in `licht.json` geeft blauwe regen lucht.
- Volgorde: in het PO-palet leest matig als een donkere leigrijze kern in het blauw en zwaar als rood daarbinnen;
  duidelijk, maar vlak. Met violet springen de kernen er meer uit. `oplopend-donker` is overdag het rustigst, maar
  zware regen is dan bijna zwart en mist het signaal van rood; 's nachts (blauw → ijsblauw → geelwit) is het het mooist.
- Histogram: blauwe staven op de blauwe hemel van de scrubber vallen minder op dan het huidige turquoise.
- Wind en Lucht: de paletten werken daar, maar de menging blijft er de oude, dus de halo ook (`modus-wind-lucht`).
  Schakelen tussen Weer (strak) en Wind (wazig) is dan een zichtbare sprong.

### Advies (wat ik zou kiezen)
1. **Menging `drempel`**, voor elk palet. Dit is de eigenlijke reparatie; ook met het huidige palet is de halo weg.
2. **Palet `blauw-grijs-rood`** (het PO-voorstel): als enige ruim boven de lat voor kleurenblindheid, dag en nacht.
   Vindt de PO het grijs te dof, dan `blauw-violet-rood` (levendiger, krap aan de lat: 22–23 overdag).
3. Daarna, niet in deze track: (a) dezelfde menging in Wind en Lucht — de vermenigvuldiging uit U62 omzeilde deze
   canvasfout en is dan misschien niet meer nodig; (b) het water van de lichte kaart; (c) de bot: `bot/native-rain.ts`
   bootst de α² na (`1 - alpha * alpha`), dus stills en filmpjes hebben dezelfde halo tot dat meegaat.
Knoppen die ik bewust heb laten liggen voor ronde 2: de drempel op 0,1 mm/u in plaats van 0,03 (kleiner HARMONIE-
vlak, maar de lichtste radarbuitjes krimpen), en de inzetdekking (0,55).

### Frametijd `rand` (de enige stand die de shader duurder maakt)
`rig/blend-frames.ts` + `rig/run-blend-frames.sh` (naar U72; po-android, renderer-cgroup 40 %, 25 s laden, 20 s
afspelen in Weer vanaf nu, gepaard en om en om, perf-lock per run, load bij start 2,9–10,3). `metingen/frametijd-rand-tegen-drempel.log`.
| | frames in 20 s | p95 | frames > 34 ms | lange frames |
| --- | --- | --- | --- | --- |
| drempel | 1185 / 1181 / 1144 | 16,8 / 16,8 / 16,8 | 3 / 3 / 14 | 2 / 1 / 7 |
| rand | 1179 / 1172 / 1176 | 16,8 / 16,8 / 16,8 | 4 / 6 / 4 | 2 / 3 / 2 |
Geen meetbaar verschil: de spreiding tussen de drie drempel-runs is groter dan het verschil tussen de standen.
SwiftShader, dus een bovengrens voor een telefoon-GPU. Palet, zuiver, steil en drempel wisselen alleen de tabel
(256 texels) en de mengfunctie en zijn niet gemeten.

### Niet gedaan, eerlijk
- Niet afspelend beoordeeld: alle oordelen komen van stills. Een harde drempel kan bij afspelen flikkeren waar
  motregen rond de drempel schommelt; dat ziet alleen de PO op 4320.
- Niet op een echt toestel of in Firefox/Safari gekeken. De α²-optelling is gemeten in headless Chromium; de halo
  die de PO op zijn telefoon ziet past erbij, maar hoe andere browsers een canvas met kleur > alfa mengen heb ik
  niet gemeten.
- Het terugvalpad (regen als MapLibre-laag als de overlay-canvas faalt) mengt in een dekkend doel en had de fout nooit.

### Gate (web/), 14:55
`pnpm typecheck` 0 · `pnpm test` 0 (84 bestanden, 561 tests) · `pnpm build` 0 ·
`MOTREGEN_E2E_PORT=4390 MOTREGEN_E2E_DATA_PORT=8390 pnpm e2e e2e/dev-panel.spec.ts e2e/rain-playback.spec.ts --project desktop` 0 (7 groen).
De eerste e2e-poging gaf exit 1 op mijn eigen nieuwe regels in `dev-panel.spec.ts` (ik las `data-rain-look` van
`.map` in plaats van `.map-shell`); hersteld, daarna 7 groen. `pnpm test` en de rigs draaien buiten de sandbox (tsx
opent een IPC-socket). Preview 4320 serveert deze build (`index-bAQpJW04.js`, bevat de nieuwe knoppen). Draft-PR #107.
