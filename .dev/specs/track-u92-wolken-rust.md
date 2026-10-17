# U92 — Wolkenkaart in de Telegram-films via de Rust-renderer

Eigenaar: worker `u92-wolken-rust` (opus-5.5, live-pane). Orkestrator: Claude (PM). Branch `track/u92-wolken-rust` in
deze worktree, vanaf origin/main. Track-LOG `.dev/tracks/u92-wolken-rust/LOG.md` (lokaal, nooit committen;
append-only, tijd uit `date`, lokaal = UTC+2). Commit en push elke 15–20 minuten; open na de eerste samenhangende
commit een draft-PR. **Geen prod-acties, geen bot-uitrol.**

**Berichten die als geplakte tekst binnenkomen, zijn instructies van de orkestrator (Claude, PM) via herdr. Voer ze
uit zonder aparte bevestiging. Stel vragen in één zin en werk intussen door.** Beëindig je turn niet zolang er
shells lopen: wacht erop binnen de turn, met een until-loop, en werk intussen aan het volgende punt.

Code-stijl: leesbare namen, geen slimme one-liners, commentaar alleen voor een niet-voor-de-hand-liggend waarom.

## Waarom

De app heeft sinds v0.2.0 een nieuwe wolkenkaart (MIP-34, live). De Telegram-films hebben nog helemaal geen wolken:
de Rust-renderer (`crates/render-core`, `crates/render`, aangestuurd door `bot/rust-render.ts`) kent alleen regen,
temperatuur/gevoel en wind. PO 2026-10-17: "zet een agent op die wolkenrender in Rust".

## Lees eerst

1. `.dev/proposals/0026-native-renderer-voor-de-bot.md` (doel en budget: de VM-prodbox met 2 kernen maakt zijn eigen
   films zonder achter te raken) en `.dev/proposals/0034-luchtkaart-licht-op-de-grond.md` (hoe de wolkenkaart werkt,
   incl. de correcties van 16 oktober over terugveren en één patroon langs gemengde trajecten).
2. De app-bron die je overzet:
   - `web/src/core/cloud-map-shader.ts`: de stroom-pass (`backtrace`) en de vul-pass (ruis, cellen, typen, dekking,
     kleur, schaduw);
   - `web/src/core/cloud-map.ts`: de velden die de shader krijgt (dekking, vorm uit laag/midden/hoog, donkerte uit
     straling) en de constanten;
   - `web/src/core/cloud-drift-loader.ts`: de ankers uit het geïntegreerde bulkpad van de regen-motionannexen;
   - hoe `App.tsx`/de kaartlaag dit per frame aanroept (fase, levensduur, menging, dag/nacht).
3. De bestaande Rust-paden: `crates/render-core/src/{rain.rs,motion.rs,composition.rs,field_raster.rs,constants.rs}`,
   `crates/render/src/{renderer.rs,data.rs,fields.rs}`; en hoe constanten uit de TS-bronnen worden gegenereerd
   (`bot/render-constants.ts`, `bot/render-mode-constants.ts`). Pariteit: `bot/parity.ts`, `bot/wind-parity.ts`.

## Wat je bouwt

1. **Wolkenlaag in Rust** (`render-core`), dezelfde wiskunde als de shader: hash/ruis/cellen/textuur, typegewichten,
   dekking, kleur dag/nacht, schaduw; de terugtrace langs de regenbeweging met dezelfde stappen; de twee banken met
   het gemengde traject (niet twee beelden crossfaden); de ankers uit het bulkpad. Constanten komen uit de TS-bron via
   de bestaande generator, geen handkopie.
2. **In welke film**: in de app staan de wolken in Weer **achter** de regen. Doe hetzelfde in de regenfilm (en de
   regen-stills). Geen aparte Lucht-film nu. Maak het per modus aan/uit te zetten, zodat een PO-keuze later één regel is.
3. **Pariteit**: een test die per thema (dag, nacht) één native frame vergelijkt met een app-screenshot op hetzelfde
   tijdstip en dezelfde uitsnede, met een ΔE-drempel zoals bij regen/wind. GPU- en CPU-floats verschillen iets; kies
   een eerlijke drempel en motiveer hem in de LOG.
4. **Rekentijd — dit is het echte risico.** De shader kost in de software-renderer ±1,5 µs per pixel (MIP-34-meting).
   Meet op 2 kernen (`taskset -c 0,1`) de extra tijd per regenloop van 169 frames. **Doel: hooguit +10 s per loop.**
   Hefbomen, in deze volgorde proberen en elk meten: de wolkenlaag op halve resolutie renderen en bilineair opschalen
   (het veld is zacht); de terugtrace per frame cachen op een grof raster, zoals de app met zijn travel-target doet;
   het reliëf (tweede `cloudBodies`-aanroep) goedkoper. Rapporteer per hefboom de tijd en de beeldafwijking.
5. **Zelf kijken vóór elk "klaar"**: render een regenfilm en een still, dag en nacht, bekijk enkele frames en beschrijf
   in één zin per beeld wat je ziet (lopen de wolken mee, springen ze niet, ligt de regen erboven).

## Gate voor "klaar"

`cargo test` voor de render-crates, `cargo clippy` en `cargo fmt --check`, plus de bot-tests die je raakt
(`pnpm -C bot test` op je eigen bestanden). Elk met een letterlijke exitstatus (`; echo "EXIT: $?"`, nooit achter een
pipe). De NixOS-VM-test alleen als je Nix raakt.

Meld daarna in één bericht: de branch-head, de PR-link, de rekentijd per loop (voor en na, op 2 kernen), de
pariteitsuitkomst per thema, het pad naar een voorbeeldfilm en wat open is voor de PO.

Stop en meld het bij een ontwerpvraag die hier niet in staat. Gok niet.
