# U71c — verificatie

2026-10-09. Alle groene exitcodes hieronder zijn synchroon waargenomen. De volledige
web-e2e-suite is niet gedraaid; er is geen wijziging aan de webweergave of handlers.

| Commando | Exit | Resultaat |
| --- | ---: | --- |
| `pnpm -C bot typecheck` | 0 | TypeScript |
| `pnpm -C bot test` | 0 | 112 tests, 27 bestanden |
| `pnpm -C bot build` | 0 | TypeScript en beide Rust-workers |
| `nix build .#motregen-bot .#checks.x86_64-linux.bot-roles --no-link` | 0 | Package en renderer/poller-budgetasserties |
| `VITE_DATA_ORIGIN=https://motregen.nl pnpm -C web build` | 0 | Lokale browserreferentie |
| U71b-pariteitsrig, `weather` | 0 | 5/5 beelden |
| U71b-pariteitsrig, `feels` | 0 | 5/5 beelden |
| U71b-pariteitsrig, `wind` | 0 | 5/5 beelden, vijf windfasen per beeld |
| `bash .dev/tracks/u71c-renderer-geheugen/measure.sh final-warm tmp/u71c-baseline 2200M 2600M warm built` | 0 | 173 nieuwe media, 58,734 s, 1,623 GiB cgroup-piek |
| `MOTREGEN_CHROMIUM_PATH=/nix/store/j8hc3kdypr2gaa2w3dq0a370lwfzbasf-chromium-151.0.7922.137/bin/chromium bash .dev/tracks/u71c-renderer-geheugen/measure.sh vm-cold-text tmp/u71c-baseline 1800M 2200M cold-text built` | 0 | Nieuwe isolijntekst, 173 media, 76,009 s, 1,758 GiB |
| `bash .dev/tracks/u71c-renderer-geheugen/measure.sh vm-warm tmp/u71c-baseline 1800M 2200M warm built` | 0 | Laatste cache-misscorrectie; 65,702 s, 1,503 GiB, geen geheugenevents |
| `bash .dev/tracks/u71c-renderer-geheugen/measure.sh vm-warm-quiet tmp/u71c-baseline 1800M 2200M warm built` | 0 | Rustige herhaling, 58,282 s, 1,547 GiB, geen geheugenevents |
| `node .dev/tracks/u71c-renderer-geheugen/compare.mjs tmp/u71c-baseline tmp/u71c-vm-warm-quiet .dev/tracks/u71c-renderer-geheugen/byte-parity-vm-quiet.json` | 0 | 343/343 byte-identiek, geen extra/ontbrekende bestanden |
| Bestandsvergelijking met baseline, warm en nieuwe tekst | 0 | Beide 343/343 byte-identiek |

Pariteitscommando's vanaf de projectroot, met de eigen preview op 4362:

```bash
VITE_DATA_ORIGIN=https://motregen.nl pnpm -C web build
MOTREGEN_DATA_ORIGIN=https://motregen.nl/data pnpm -C web preview --host 127.0.0.1 --port 4362
```

In een tweede shell; herhaal voor `feels` en `wind`:

```bash
MOTREGEN_ORIGIN=https://motregen.nl MOTREGEN_PARITY_ORIGIN=http://127.0.0.1:4362 \
MOTREGEN_RENDER_CACHE=../tmp/u71c-built-warm \
MOTREGEN_CHROMIUM_PATH=/nix/store/j8hc3kdypr2gaa2w3dq0a370lwfzbasf-chromium-151.0.7922.137/bin/chromium \
  flock /home/mathijs/motregen-perf.lock web/scripts/e2e-slot.sh pnpm -C bot parity \
  ../.dev/tracks/u71b-native-temperatuur-wind/manifest.json ../tmp/u71c-parity/weather --mode=weather
```

De meethelper kopieert alleen warme assets naar een nieuwe cache. Het gebundelde pinned
manifest is hetzelfde als U71b; chunks moeten nog beschikbaar zijn. De gebouwde runtime
van `final-warm` en `vm-cold-text` is `b01a119`. De afsluitende cache-misscorrectie voegt
alleen `fs.access` vóór bestandgebaseerde PNG-invoer toe en is afzonderlijk getest.
`*-host.txt` bewaart commit/tijd/hostbelasting/exitstatus; `*-source.json` bewaart eventuele
bronverschillen. De oudere stappen hebben GNU-timegegevens, proces-RSS-samples en
cgroup-JSON naast hun volledige rendererlogs. Geen losse achtergrondcheck telt als receipt.

Mislukte tussenproeven blijven zichtbaar: `cold-release` heeft wrapper-exit 2 en telt niet
als groen, `cold-batches` faalt op glyphs, en `cold-batches-fixed` is teruggedraaid wegens
andere atlaspixels. Volledig koude kaart-/klokassets en echte Telegram-uploadtijd zijn niet
gemeten. Geen Telegram-poller, echte uploads, rolwissel of productie-uitrol uitgevoerd.
