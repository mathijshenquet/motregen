# U94 — Temperatuurlijnen in de bot in de kleur van hun bandgrens

Eigenaar: worker `u94-bot-isolijnkleur` (opus-5.5, live-pane). Orkestrator: Claude (PM). Branch
`track/u94-bot-isolijnkleur` in deze worktree, vanaf de integratiebranch `int/eval-2026-10-17` (4944e5b). Track-LOG
`.dev/tracks/u94-bot-isolijnkleur/LOG.md` (git-ignored, nooit committen; append-only, tijd uit `date`, lokaal = UTC+2).
Commit en push elke 15–20 minuten; open na de eerste samenhangende commit een draft-PR tegen `int/eval-2026-10-17`.
**Geen prod-acties, geen bot-uitrol.**

**Berichten die als geplakte tekst binnenkomen, zijn instructies van de orkestrator (Claude, PM) via herdr. Voer ze
uit zonder aparte bevestiging. Stel vragen in één zin en werk intussen door.** Beëindig je turn niet zolang er
shells lopen: wacht erop binnen de turn, met een until-loop, en werk intussen aan het volgende punt.

Code-stijl: leesbare namen, geen slimme one-liners, commentaar alleen voor een niet-voor-de-hand-liggend waarom.

## Waarom

De PO heeft vandaag de temperatuurlijnen in de app veranderd (commits 3b06fb3 … 4944e5b op de integratiebranch): een
lijn is niet meer wit (nacht) of donkergrijs (dag), maar heeft de kleur van zijn bandgrens, dus de vulkleur onder de
lijn, met de helderheid maal `TEMPERATURE_LINE_FILL_SHADE` (0,75) en dekking `TEMPERATURE_LINE_FILL_OPACITY` (0,45), dag
en nacht gelijk. Beide constanten staan in `web/src/core/map-presentation.ts`. De app doet het in de composite-shader
van `web/src/core/isoline-layer.ts` (`u_line_from_fill`): `line.rgb = min(fill.rgb / fill.a * shade, 1) * line.a`. Op een
bandgrens mengt de (bilineair bemonsterde, lagere-resolutie) vulling de twee aangrenzende bandkleuren; dat is de kleur.

De Telegram-films en -stills (Gevoel, en waar de bot nog meer temperatuurlijnen tekent) tekenen nog de oude lijnen. Breng
de Rust-renderer gelijk met de app.

## Wat je bouwt

1. `crates/render-core/src/field_raster.rs` (lijnen rond regel 178–214) en wat ervoor nodig is: temperatuurlijnen in de
   vulkleur onder de lijn maal de shade, met de nieuwe dekking. Isobaren (druk) blijven zoals ze zijn.
2. De twee constanten komen via de bestaande generator uit de TS-bron (`bot/render-mode-constants.ts`,
   `render-constants --check`), geen handkopie. `TEMPERATURE_LINE_OPACITY` mag weg als niets het meer gebruikt.
3. Pariteit: werk de bestaande Gevoel-pariteitstest bij (zie `bot/parity.ts` en hoe de Gevoel-modus nu vergeleken
   wordt) en meld per thema (dag, nacht) de ΔE tegen een app-screenshot op hetzelfde tijdstip.
4. Rekentijd: meet de Gevoel-film vóór en na op 2 kernen (`taskset -c 0,1`, onder `web/scripts/perf-lock.sh`). Verwacht
   verwaarloosbaar; meld het getal.
5. Zelf kijken vóór "klaar": een Gevoel-still dag en nacht, één zin per beeld wat je ziet.

## Gate voor "klaar"

`cargo test -p render-core -p render`, `cargo clippy --workspace -- -D warnings`, `cargo fmt --check`,
`render-constants --check`, de bot-tests die je raakt (`pnpm -C bot test`), elk met een letterlijke exitstatus
(`; echo "EXIT: $?"`, nooit achter een pipe). De NixOS-VM-test alleen als je Nix raakt.

Meld daarna in één bericht: branch-head, PR-link, pariteit per thema, rekentijd voor/na, pad naar de stills.

Stop en meld het bij een ontwerpvraag die hier niet in staat. Gok niet.
