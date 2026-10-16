# U85 — publieke changelog, versies en het kanaal "Motregen Updates"

Eigenaar: worker `u85-changelog` (gpt-6.1-sol). Orkestrator: Claude. Branch `track/u85-changelog` vanaf `origin/main`.
Track-LOG `.dev/tracks/u85-changelog/LOG.md` (append-only, tijd uit `date`). Lever een **slice**: geen e2e of volledige
suites; alleen typecheck en de tests die je zelf toevoegt. De orkestrator gate op de integratiebranch. Geen prod-acties,
geen echte Telegram-posts (alleen naar een testchat die de orkestrator je geeft). Commit en push elke 15–20 minuten.

## PO-wens (2026-10-16, samengevat)
Publieke changelog bijhouden: wijzigingen verzamelen als "pending", en bij de uitrol verplaatsen naar een versie.
Versies zoals in gitsitter (`mathijshenquet/gitsitter`, lokaal `~/gitsitter`: semver in het manifest, `release.yml`
met bumpniveau patch/minor/major, tag `vX.Y.Z`). Per release een post in een Telegramkanaal "Motregen Updates" met voor/na-
beelden of korte voor/na-video's (split screen), elk met een eigen beschrijving. Dezelfde inhoud op de website onder
`/changelog`. De werkwijze vastleggen in `AGENTS.md`.

## Ontwerp (volg dit; wijk af met reden in de LOG)
1. **Notities per wijziging**: `changes/pending/<slug>.md`, één bestand per wijziging (geen gedeeld `pending.md`, dan
   botsen parallelle tracks niet). Frontmatter: `title`, `kind` (`nieuw` | `beter` | `opgelost`), optioneel `media`:
   lijst van `{ file, caption }` met paden onder `changes/media/`. Body: 1–3 zinnen Nederlands voor gewone gebruikers.
   Media klein houden: mp4 (H.264, ≤ 2 MB, ≤ 12 s) of webp; schrijf een validator die te grote of ontbrekende media en
   onbekende velden weigert.
2. **Versie**: één bron, `VERSION` in de root (start `0.1.0`), ook zichtbaar in de app (bijv. in het "Over"-scherm).
3. **Release**: `tools/release.sh <patch|minor|major>`: valideert, bumpt `VERSION`, verplaatst alle `pending/*.md` naar
   `changes/vX.Y.Z/` (met `index.md`: datum + volgorde), werkt `CHANGELOG.md` (nieuwste boven) bij, commit
   "release vX.Y.Z", tagt `vX.Y.Z`. Het script pusht of rolt NIET uit; dat blijven aparte stappen van de orkestrator
   na akkoord van de PO. Droogloop-optie `--dry-run` die laat zien wat er zou gebeuren.
4. **Telegram**: `tools/changelog-post.ts <versie> <chat-id>`: post via de bestaande bot-token uit `.env`
   (`TG_BOT_KEY`) één tekstbericht met de versie en de titels, gevolgd door een album (`sendMediaGroup`, ≤ 10 items)
   met per item zijn eigen `caption`. Zoek uit (Bot API-docs) en meld hoe Telegram per-item-bijschriften in een album
   toont, en of een Telegraph/Instant View-pagina een beter "slideshow"-alternatief is. Idempotent: een release
   die al gepost is (bijhouden in `changes/vX.Y.Z/posted.json` met message-ids) wordt niet opnieuw gepost.
5. **Website `/changelog`**: route in de app (bestaande router/`page-routes` volgen), bij de build gegenereerd uit
   `changes/`: per versie datum, notities, media inline (video met `muted playsinline controls`). Licht en donker,
   390 en 1280 zelf bekijken (één schermbeeld per thema volstaat). Link vanuit het "Over"-scherm.
6. **Voor/na-media maken**: `tools/before-after.ts` die twee builds/origins op dezelfde URL, tijd en camera opneemt
   (hergebruik `web/scripts/rain-motion-strip.ts` en de camerahaak `window.__motregenJumpTo`) en ze met ffmpeg naast
   elkaar zet (still of clip, labels "voor"/"na"). Geen perfectie: een werkende eerste versie.
7. **`AGENTS.md`**: korte sectie "Changelog en releases": elke track levert een `changes/pending/<slug>.md` mee (de PO
   reviewt die vóór de release); de orkestrator releaset; uitrol alleen na expliciet akkoord van de PO.

Leesbaarheid: geen één-letternamen, geen slimme one-liners, commentaar alleen voor het niet-vanzelfsprekende waarom.
Meld **"U85 slice"** met head-sha, wat werkt en wat nog niet.
