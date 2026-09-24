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
