# Track U46 — wolken-vibe meten: webcam-poller + grading-pijplijn (MIP-18 deel 3) (gpt-5.6-sol)

Read first: `AGENTS.md`, `.dev/proposals/0018-wolkenlagen-en-vibe.md` (deel 3), `docs/fields.md`
(`cloud_*`, `radiation`, CMF), `docs/contract.md`/`docs/mrf.md` (manifest + chunks lezen),
`web/src/core/mrf.ts` + `pred.ts` (decoder; er is geen Rust-reader voor de client-chunks —
kies: Python-herimplementatie van de decoder, óf een klein `tsx`-script dat de web-decoder
hergebruikt en één punt sampelt; het tweede is minder werk en blijft in sync), `.env`
(`KNMI`-sleutel voor de 10-minutendata; nooit committen). LOG:
`.dev/tracks/u46-wolken-webcam-poller/LOG.md` (committed, append-only, timestamped). Branch
`track/u46-wolken-webcam-poller` vanaf main. Eigen worktree. Vandaag: 2026-10-07.

Dit is een **meetrig**: eerlijkheid boven snelheid; elke stap met synchrone receipts.

## Opdracht

1. **Poller** (`tools/skywatch/`, Python via uv, `pyproject.toml`, pyright schoon): elke
   10 min (systemd user-timer op deze host, geïnstalleerd via een `install.sh` + unit-files in
   de repo; geen nix-wijziging nodig):
   a. KNMI-webcam De Bilt: `https://cdn.knmi.nl/knmi/map/page/weer/actueel-weer/webcam/webcam.jpg`
      → `~/skywatch/images/YYYY-MM-DD/HHMM.jpg` (sla over als de bytes gelijk zijn aan de
      vorige; log de verversingscadans). Beelden zijn hoststaat (regenereerbaar).
   b. Ons live manifest (`https://motregen.nl/data/manifest.json`): voor De Bilt
      (52,10 N 5,18 O) het frame met kortste lead ≤ 1 u voor nu, velden `cloud_low`,
      `cloud_mid`, `cloud_high`, `cloud_frac`, `radiation`, plus run/lead-metadata. Bewaar ook
      de frames voor nu+1u…+6u (lead-afhankelijkheid later).
   c. KNMI 10-minutenwaarneming station 260 (dataset `Actuele10mindataKNMIstations` op het
      KNMI Data Platform, sleutel uit `.env`): globale straling, zonneschijnduur, bewolking
      (octa's), wolkenbasis, zicht. Documenteer de exacte variabelen in `tools/skywatch/
      README.md`.
   d. Eén rij per tijdstip in `tools/skywatch/data/samples.csv` (committed, append-only; de
      orkestrator commit dagelijks) met alle velden + CMF (straling / Haurwitz-helderehemel,
      zelfde formule als `uv.ts`).
2. **Dagboek**: `?dev`-knop "Lucht nu" met vijf klassen (strakblauw · mooie wolkenlucht ·
   melkachtig · grijs · Mordor) → `localStorage['motregen-sky-diary']` (tijd, klasse, afgeronde
   locatie op 0,1°) + "Kopieer dagboek". `docs/dev-opties.md` bijwerken (eigenaar U46, vervalt
   na de analyse). Klein; raak alleen `DevPanel.tsx` en `dev-settings.ts`.
3. **Grading-pijplijn** (`tools/skywatch/grade.py`), nog niet draaien op schaal: OpenAI
   Decisions API (`POST /v1/decisions`, model `gpt-6-luna`, sleutel `OPENAI_API_KEY` uit
   `.env`): per beeld (a) keuze: de vijf klassen, (b) score 0–10 "hoe mooi/prettig is deze
   lucht om buiten te zijn", (c) predicaat "de zon is zichtbaar". **Dezelfde drie vragen** voor
   (i) de webcamfoto en (ii) een render van onze wolkendoorsnede: `tools/skywatch/render.ts`
   (Playwright, preview-build, `?still=1`-achtige vaste staat of een losse route die alleen
   de scrubber op De Bilt toont, 3 u rond het tijdstip), met de instructie "stel je de hemel
   voor die deze grafiek beschrijft". Alleen overdag (zonshoogte > 5°). Rooktest op 10 beelden
   met receipts (kosten, latency, ruwe antwoorden in de LOG).
4. **Analyse-notebook-light** (`tools/skywatch/analyse.py`): kappa (klasse) en Spearman
   (score) tussen webcam en grafiek; verwarringsmatrix model-lagen × webcam-klasse; welke
   combinatie van fractie/laag/CMF de webcam-score het best voorspelt (ordinale regressie of
   gewoon een boom). Draait op de CSV + grades; output markdown in `tools/skywatch/
   reports/`. Nu alleen op de rooktestdata laten draaien.
5. Receipts: `uv run pyright` 0, `uv run pytest` (parser, CMF, CSV-schema), poller 3× met de
   hand gedraaid met timer-status in de LOG, `pnpm typecheck`/`pnpm test` voor de dev-knop.
   Draft-PR vroeg.

## Afbakening

Geen Windy/andere camera's (alleen De Bilt), geen grading op schaal (dat is over 3–4 weken),
geen wijziging aan de tekening (U47). Leesbaarheidsbar: geen één-letternamen.
