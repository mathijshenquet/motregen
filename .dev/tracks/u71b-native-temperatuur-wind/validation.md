# U71b — verificatie

2026-10-09; runtime-code op `dda0091`, daarna alleen documentatie, meetbestanden en een commentaarcorrectie.
Alle onderstaande exitcodes zijn synchroon waargenomen; geen losgelaten achtergrondchecks.

| Commando | Exit | Resultaat |
| --- | ---: | --- |
| `pnpm -C bot typecheck` | 0 | TypeScript |
| `pnpm -C bot test` | 0 | 110 tests, 26 bestanden |
| `pnpm -C bot build` | 0 | TypeScript en beide Rust-workers |
| `nix build .#motregen-bot --no-link` | 0 | Beide native workers verpakt |
| `pnpm -C web typecheck` | 0 | TypeScript |
| `VITE_DATA_ORIGIN=https://motregen.nl pnpm -C web build` | 0 | Lokale prod-datareferentie |
| `pnpm -C web test --run src/core/isolines.test.ts src/core/isoline-spline.test.ts src/core/isoline-contours.test.ts src/core/isoline-labels.test.ts src/core/wind-layer.test.ts src/core/rain-smoothing.test.ts` | 0 | 69 tests, 6 bestanden |
| `pnpm -C web e2e e2e/telegram.spec.ts --project desktop` | 0 | 7 tests, 24,2 s, eigen e2e-slot |
| `pnpm -C bot parity … --mode=weather` | 0 | 5/5 beelden |
| `pnpm -C bot parity … --mode=feels` | 0 | 5/5 beelden |
| `pnpm -C bot parity … --mode=wind` | 0 | 5/5 beelden plus vijf simulatiefasen per beeld |
| `MOTREGEN_CHROMIUM_PATH=/niet-bestaand/u71b-chromium bash .dev/tracks/u71b-native-temperatuur-wind/measure.sh 2core8 tmp/u71b-2core7 warm` | 0 | 173 nieuwe media, 51,492 s renderer / 52,53 s proces |
| `bash .dev/tracks/u71b-native-temperatuur-wind/measure.sh 2core7 tmp/u71b-2core-4 cold-text` | 0 | 173 nieuwe media en nieuwe tekstassets, 56,790 s renderer / 58,00 s proces |

Exacte pariteitscommando's, referentie-build en preview staan in `docs/telegram.md` §U71b.
De pinned generatie is `2026-10-09T12:18:21Z`. JSON, beeldparen, fase-maskers en alle meetruns
staan in deze trackmap; bij de beeldparen staat de browser links en native rechts.
De volledige web-e2e-suite is volgens de werkafspraak niet gedraaid.

De GPU-fase van windstreepjes wordt via gemeten footprints uitgesloten van de statische ΔE;
ruwe ΔE, maskeraandeel, dichtheid, lengte, breedte en alpha-inkt blijven zichtbaar. De originele
statische ΔE-grenzen zijn niet verruimd. De windgrenzen zijn vóór de eerste formele run ingesteld.

De CPU-meting haalt de 60-secondenbar. Geheugen is GNU-time-RSS, geen gezamenlijke cgroup-piek;
de VM-geheugenlimieten zijn hier niet opgelegd. PO-beeldgoedkeuring en onafhankelijke
orkestratorverificatie blijven mergevoorwaarden. Geen Telegram-poller, echte uploads of
productie-uitrol uitgevoerd.
