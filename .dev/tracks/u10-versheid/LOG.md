# Track U10 — dataversheid zichtbaar (LOG, append-only)

## 2026-09-23 14:30Z — start

- Spec gelezen (`.dev/specs/track-u10-versheid.md`), MapClock/App-bedrading,
  manifest-refresh, contract, sweep §7 en SYNTHESE ("versheid!").
- Plan: `core/freshness.ts` (zuiver: per bron laatste meting/run, leeftijd,
  statusklasse, NL-labels) + `components/Freshness.tsx` (vervangt MapClock;
  "Kaart"-helft blijft) + kleine App-bedrading: refresh-uitkomst wordt een
  signal `RefreshState { checkedAt, failedAt? }` i.p.v. een stille catch.

## 2026-09-23 14:33–14:45Z — prod-steekproef versheid (drempel-ijking)

Elke 30 s `manifest.json` van motregen.nl (UA Mozilla, no-cache), leeftijd
van het laatste rtcor-frame t.o.v. de wandklok:

```text
14:33:19 radar 14:25  age 8.3   (generated 14:27:52)
14:37:44 radar 14:30  age 7.7   pubdelay 4.4
14:42:46 radar 14:35  age 7.8   pubdelay 2.8
14:43:16 radar 14:40  age 3.3   pubdelay 3.0
```

Zaagtand ~3 → ~8,5 min aan de serverkant; de client pollt elke 60 s en
kan daar dus tot +1 min bovenop zetten → nominale piek ~9,5 min.
**Beslissing (afwijking van spec):** vers ≤ 10 min i.p.v. ≤ 8 min. Met 8
zou de pil in normaal bedrijf elke radarcyclus kort oranje worden — dat
is ruis die het signaal ("dit is echt achter") verdunt. Verouderend 10–20,
verouderd > 20, offline bij een mislukte manifestcontrole. Constanten
`FRESH_MAX_MS`/`AGING_MAX_MS` in `web/src/core/freshness.ts`; één regel om
terug te zetten als de PO 8 wil.

## 2026-09-23 14:50Z — implementatie + gates

Ontwerpkeuzes:
- Hoofdgetal = tijd van de nieuwste rtcor-*meting* (max over `times`, niet
  de chunk-`run`: een rtcor-chunk groeit binnen zijn uur). Overige bronnen:
  nieuwste `run` (nowcast, blend/seamless, HARMONIE, UV) met cadans-hint
  (5 min / kwartier / 3 uur, uit docs/ingest.md + docs/seamless.md).
- Pil: `● RADAR 14:55 3 min | KAART 15:14`; leeftijd kort ("3 min", "1 u",
  "offline") en gekleurd bij aging/stale/offline; tik opent de dialog.
- Offline = laatste manifestcontrole mislukte (netwerk of HTTP ≠ 2xx);
  een geslaagde controle zonder nieuwer manifest telt als geslaagd (dan
  vangt de leeftijd een stilgevallen ingest af). Status overschrijft leeftijd.
- Klok tikt elke 15 s; negatieve leeftijd (apparaatklok achter) → 0.
- a11y: aria-live="polite" op een sr-only span met alleen het statuslabel
  (Actueel/Loopt achter/Verouderd/Offline) → voorgelezen bij statuswissel,
  niet bij elke tik. Knop heeft een volledige aria-label; tekst naast kleur.
- Dialog: zelfde familie als About (`about-dialog`/`about-body`), via
  `Portal` naar body — binnen `.map-clock` zou hij `pointer-events:none`
  erven en de small/strong-stijlen van de pil.
- Kleuren `--fresh/--aging/--stale` per thema; lichte varianten donker
  genoeg voor tekst (#23855a/#a86f00/#bf4530).
- Mobiel (≤430 px): pil iets compacter, anders raakte hij het
  motregen.nl-merk (screenshot-vangst); e2e bewaakt nu "pil rechts van merk".

Gates (synchroon, exit codes gezien; `cd web`):

```text
pnpm typecheck                         → TYPECHECK-EXIT: 0
pnpm test                              → TEST-EXIT: 0 (33 files, 169 tests)
pnpm build                             → BUILD-EXIT: 0
direnv exec .. pnpm e2e e2e/freshness.spec.ts --project desktop --project mobile-4g
  (MOTREGEN_E2E_PORT=4302 MOTREGEN_E2E_DATA_PORT=8302)  → E2E-EXIT: 0 (6/6)
```

NB e2e moet buiten de Claude-sandbox (tsx-IPC-pipe + poorten) en binnen de
devenv (caddy) — `direnv exec .. pnpm e2e`.

Screenshots in `screenshots/` (desktop + Pixel 5, licht + donker; vers,
verouderend, verouderd, offline, paneel, offline-paneel). Geforceerd via
`page.clock.setFixedTime` t.o.v. het synth-manifest (laatste rtcor 14:55Z)
en `page.route('**/manifest.json', abort)` + "Nu verversen" voor offline.
