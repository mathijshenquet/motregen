# Track U17 — UI-polish (claude opus) — LOG

## 2026-09-24 10:50Z — start

- Spec gelezen; branch `track/u17-ui-polish` vanaf main `1c19675`. direnv in de worktree
  toegestaan (`direnv allow`), Playwright-browsers komen uit devenv.
- Prod-meting gestart: `poll-manifest.mjs` (deze map) pollt `motregen.nl/data/manifest.json`
  elke 10 s gedurende 45 min → `prod-poll.jsonl` (per poll: leeftijd nieuwste rtcor-frame,
  generated→ontvangst, generated−scantijd, headers).
- Eerste observatie: manifest `cache-control: public, max-age=15, stale-while-revalidate=60`,
  ETag + Last-Modified, gzip ~1,3 kB. De client pollt met `cache: 'no-cache'` (revalidatie),
  maar de eerste load met `'default'` kan tot 75 s oud uit de HTTP-cache komen.
- Vóór-screenshots (`screenshots/voor-*`, `shots.mjs`, preview `tmp/dist-before` met /data → prod):
  desktop 1280×800 + Pixel 5, licht + donker; kaart, zoeklijst met twee favorieten,
  verwijderknop, About.
- Interpretatie PO-punt 4: "de tijd midden boven" = de versheidspil (spec zegt dat expliciet),
  al staat die rechtsonder op de kaart; de cursorpil boven de scrubber blijft ongemoeid.

## 2026-09-24 11:00Z — UI-punten 1–4 gebouwd

- **Zoekbalk (1)**: desktop 42 → 36 px hoog, 14 px tekst, 16 px icoon, max-breedte 390 → 330 px,
  doorschijnend (86 % + blur 8 px), zachtere rand en schaduw; bij focus weer dekkend.
  Op aanraakschermen blijft de hoogte 44 px (U14-aanraakdoel) en de tekst 16 px (iOS zoomt
  anders in bij focus) — daar is hij alleen rustiger, niet kleiner. Keuze voor de PO als
  hij mobiel toch kleiner wil: 40 px met een onzichtbare tikrand rond het veld.
- **About-modal (2)**: backdrop .42 → .55 + blur 4 px, zwaardere schaduw, × als ronde knop
  met rand en achtergrond (34 px, 44 px op touch). Gedeelde `components/modal.ts`:
  `pointerdown`/`click` op de backdrop → `preventDefault` + `stopPropagation`, click sluit.
  Zelfde voor het versheidspaneel (× daar nu ook het Lucide-icoon i.p.v. de tekst "×").
  Vooraf gemeten (`tmp/probe-backdrop.mjs`, vóór-build): in Chromium lekte een backdrop-klik/-tik
  NIET door naar de kaart (dialog zit in de top layer, is geen kind van de maplibre-container).
  De `preventDefault` is dus preventief; e2e `a click on the about backdrop closes it without
  touching the map` (desktop-klik + mobiele tik) borgt het. Niet getest: iOS Safari.
- **Favoriet verwijderen (3)**: rode `Trash2` (in lucide 1.47 een alias van `trash`, klasse
  `lucide-trash`), `--danger`/`--danger-soft`-tokens voor licht/donker. Klik → de rij wordt
  "‹naam› verwijderen?" met Ja (rood) / Nee; focus naar Nee, Escape of Nee annuleert (focus
  terug naar de prullenbak), Ja verwijdert. Sluiten van de lijst reset de bevestiging.
  **Bug gevonden en gefixt in echte Chromium** (jsdom zag hem niet): de wissel verwijdert
  de gefocuste prullenbak → Chromium vuurt synchroon `focusout` zonder relatedTarget →
  `setFocused(false)` → het zoek-effect sluit de lijst vóór de focus naar Nee kan. Fix: focus
  eerst parkeren op de lijst zelf (`tabindex=-1`, geen invoerveld → geen toetsenbord op mobiel),
  dan wisselen, dan de nieuwe knop focussen. E2e met echte klik (desktop) en tik (mobile-4g);
  mutatietest: zonder de parkeerstap faalt de e2e op beide profielen (exit 1), met: groen.
- **Versheidspil (4)**: per segment een stapel: tijd groot (17 px, 16 px ≤ 430 px), eronder
  klein "Radar · 7 min" resp. "Kaart" (+ " · vr" bij een andere dag). Segmenten staan nu
  ook op mobiel naast elkaar → pil op Pixel 5 ~45 px hoog i.p.v. 70 px, aanraakdoel ≥ 44 px
  (e2e-check toegevoegd: trigger ≥ 44 op touch, pil < 56), nog steeds vrij van het merk.

## 2026-09-24 11:42Z — versheid (5): meting, verdeling, wat aan de client ligt

Meting: `poll-manifest.mjs` 10:54:53–11:40Z elke 10 s (264 polls, 0 fouten) → `prod-poll.jsonl`;
KNMI-bestandslijst `nl_rdr_data_rtcor_5m` (`created`) → `knmi-rtcor-files.json`;
`node analyse.mjs` reproduceert alles hieronder.

```text
frame  KNMI-created  manifest   KNMI−scan  ingest
10:55 10:56:53 10:57:52  113   59
11:00 11:04:18 11:05:16  258   58   ← KNMI laat
11:05 11:06:43 11:07:29  103   46
11:10 11:11:47 11:12:44  107   57
11:15 11:16:46 11:17:53  106   67
11:20 11:21:42 11:22:15  102   33
11:25 11:26:52 11:27:44  112   52
11:30 11:31:50 11:32:59  110   69
11:35 11:36:48 11:37:20  108   32
```

Waar de minuten zitten (leeftijd = wandklok − frametijd, zoals de pil telt; frametijd = de
KNMI-bestandsnaam, `RAD_NL25_RAC_RT_…HHMM`):
1. **KNMI-publicatie** ~100–115 s na de frametijd (uitschieter 258 s, 11:00). Niet te beïnvloeden.
2. **Ingest** KNMI-created → manifest `generated`: 32–69 s, mediaan 57 s. `radar_cadence` 60 s
   (`crates/ingest/src/main.rs`) + verwerking; de fase van de lus valt vaak net vóór de
   KNMI-publicatie, dan wacht hij bijna een volle minuut.
3. **Client** `generated` → in de app: vaste poll van 60 s → gem. 30 s, max 59 s. (CDN: geen
   rol; `cf-cache-status: MISS`, `max-age=15, stale-while-revalidate=60`, ETag.)
4. **Cadans**: daarna veroudert het frame 5 min tot het volgende; dat is het grootste deel.

Dus: net na aankomst toont de pil ~3 min, vlak voor het volgende frame ~8–8,5 min. **"7 min" is
normaal bedrijf, geen hangende verversing.** Pil-leeftijd over de meetperiode (simulatie op de
gemeten aankomsttijden, 12 pollfasen):

| client-poll | generated→client | pil gem | p50 | p95 | max | polls/uur |
|---|---|---|---|---|---|---|
| oud: vast 60 s | gem 30 s, max 59 s | 5,87 min | 5,82 | 8,69 | 10,72 | 60 |
| nieuw: 15 s rond verwachte publicatie | gem 4 s, max 14 s | 5,46 min | 5,38 | 8,38 | 10,50 | ~114 |

**Gebouwd (client)**: `nextManifestRefreshDelay` + `scheduleManifestRefresh` op een
`setTimeout`-keten: vóór (frametijd + 5 min + 90 s) wacht hij tot dat moment (≤ 60 s), dan 4 min
lang elke 15 s, daarna terug naar 60 s (bij een KNMI-storing dus geen 15 s-dauerpoll).
Revalidatie met `cache: 'no-cache'` → 304 zonder body; manifest is ~1,3 kB gzip. De pil-leeftijd
telde al correct (scantijd, klok tikt elke 15 s, negatief → 0) — niets aan veranderd.
**Uitleg in het paneel** (bij status Actueel): "Een radarbeeld komt elke 5 minuten, meestal
3 à 5 minuten na de meting. Het volgende verwachten we rond HH:MM." (frametijd + 8 min; is
dat al voorbij: "Het volgende is onderweg."). Afweging "radar 10:55 + bijgewerkt 10:59" in de
pil: niet gedaan — de klok zou elke poll verspringen en "bijgewerkt" wekt de indruk dat de
radar nieuw is; met een grote scantijd plus kleine leeftijd en de uitleg in het paneel is de
verwachting beter te duiden. Eén regel om te wisselen als de PO het toch wil.
Eerste load gebruikt nog `cache: 'default'` (kan tot 75 s oud uit de HTTP-cache komen via
stale-while-revalidate); de eerste geplande poll corrigeert dat binnen ≤ 15–60 s. Laten staan:
de warme reload blijft zo 0 requests extra.

**Ingest-aanbevelingen (niet gebouwd)**:
- rtcor sneller oppikken: KNMI Notification Service (MQTT; `KNMI_NOTIFICATION_API_KEY` staat al
  in `.env`) i.p.v. de 60 s-lijstpoll → scheelt mediaan ~45–50 s per frame. Goedkoper
  alternatief: in het venster frametijd + 90…300 s elke 10 s pollen, daarbuiten 60 s.
- Meten hoeveel van de 32–69 s verwerking is (timestamp "gezien" vs "generated" loggen).
- Optioneel `Cache-Control: no-cache` op `manifest.json` (i.p.v. max-age=15/swr=60), zodat ook
  de eerste load altijd revalideert; kost één 304-round-trip per paginaload.

## 2026-09-24 11:30Z — smalle telefoons

`tmp/probe-narrow.mjs`: pil naast elkaar is 163×46 px; bij 320 px viewport overlapt die het merk
(rechterrand merk 173 px). < 360 px staan de segmenten weer onder elkaar (99×85 px, vrij).
360/393 px: naast elkaar, vrij van het merk.

## 2026-09-24 11:47Z — gates groen op 8f981e3 (synchroon, onder de hostlock, load 7,9)

`cd web`, devenv actief:
- `pnpm typecheck` → TYPECHECK-EXIT 0
- `pnpm test` → TEST-EXIT 0 (38 files, 213 tests)
- `pnpm build` → BUILD-EXIT 0
- `MOTREGEN_E2E_PORT=4341 MOTREGEN_E2E_DATA_PORT=8341 pnpm e2e` → E2E-EXIT 0 (24 passed, 15 skipped
  door profielfilters)
Screenshots vóór/na: `screenshots/{voor,na}-{desktop,pixel5}-{kaart,zoeken,verwijderen,about,paneel}-{light,dark}.png`
(pngquant; `voor` heeft geen paneel-shot). Preview na: `tmp/dist-after` op :4343 (/data → prod).

Open MET PO: zoekbalk op mobiel alleen rustiger (44 px aanraakdoel) — kleiner met onzichtbare
tikrand?; "bijgewerkt HH:MM" in de pil i.p.v. leeftijd?; ingest MQTT/10 s-venster (~50 s winst).
Niet getest: iOS Safari (backdrop, focus-parkeren bij de prullenbak).
