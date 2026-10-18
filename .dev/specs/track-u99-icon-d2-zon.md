# U99 — Zonneschijnduur uit ICON-D2 (MIP-39)

Eigenaar: worker `u99-icon-d2-zon` (opus-5.5, live-pane). Orkestrator: Claude (PM). Branch `track/u99-icon-d2-zon` in
deze worktree, vanaf de integratiebranch 8d46ab7 (bevat U96: `web/src/core/sunshine.ts` en de zoncurve in Lucht).
Track-LOG `.dev/tracks/u99-icon-d2-zon/LOG.md` (git-ignored, nooit committen; append-only, tijd uit `date`, lokaal =
UTC+2). Commit elke 15–20 minuten en **push altijd expliciet met `git push origin HEAD:track/u99-icon-d2-zon`**, nooit
kaal. Draft-PR tegen `int/eval-2026-10-17` na de eerste samenhangende commit. **Geen prod-acties.**

**Berichten die als geplakte tekst binnenkomen, zijn instructies van de orkestrator (Claude, PM) via herdr. Voer ze
uit zonder aparte bevestiging. Stel vragen in één zin en werk intussen door.** Beëindig je turn niet zolang er
shells lopen: wacht erop binnen de turn, met een until-loop, en werk intussen aan het volgende punt.

Code-stijl: leesbare namen, geen slimme one-liners, commentaar alleen voor een niet-voor-de-hand-liggend waarom.

## Waarom (PO 2026-10-18: "39 akkoord")

U95c (MIP-38, sectie "Vergelijking met de Zwitserse app", `tools/zonneschijn/results.md`): S1 op de uurstraling van
ICON-D2 haalt in Nederland 8,7 min/u (vaardigheid +0,57), tegen 10,5 voor S1 op HARMONIE — het niveau van MeteoSwiss
thuis (ICON-CH 8,7–8,8). ICON-D2 is gratis open data van de DWD (opendata.dwd.de), 2,2 km, elke 3 uur, tot +48 h.

## Wat je doet

1. **MIP-39 eerst** (`.dev/proposals/0039-zonneschijnduur-uit-icon-d2.md`, Nederlands): bron (welke ICON-D2-velden:
   globale straling als uurgemiddelde, en zoek uit of de DWD-open-data ook directe straling of `DURSUN` voor ICON-D2
   levert — als dat zo is, meet in `tools/zonneschijn/` of het native veld beter is dan S1 op ICON-D2-straling, net zoals
   ICON-CH dat thuis is), downloadvolume en ingestkosten per run voor het NL-kader, publicatie (een eigen veld/chunk in
   het manifest), en hoe de client kiest: ICON-D2 tot +48 h, daarna HARMONIE, met een naadloze overgang. Status draft;
   meld als hij staat, ik leg hem aan de PO voor terwijl jij bouwt.
2. **Ingest** (Rust, `crates/ingest`): ICON-D2 ophalen voor het NL-kader, alleen de benodigde velden en uren, op de
   bestaande manier publiceren (mrf met inhoudshashes, generatiesuffix, manifest). Robuust bij een uitgevallen run (val
   terug op de vorige of op HARMONIE). Tests met fixtures, zoals de bestaande bronnen.
3. **Client:** `web/src/core/sunshine.ts` en de zoncurve in Lucht gebruiken ICON-D2 waar die er is (zelfde S1, of het
   native veld als dat beter meet). De tabel en de bot raken we niet in deze track.
4. **Nix/prod-config:** de nieuwe bron als optie in de NixOS-module (standaard aan), timer zoals de bestaande bronnen;
   de NixOS-VM-test groen. Geen uitrol.
5. **Changelog:** geen eigen notitie (de zon in Lucht krijgt er al een); vermeld de DWD als bron in het Over-scherm en
   de bronregel onder de tabel waar dat hoort (licentie: DWD-open-data, controleer de exacte naamsvermeldingseis).

## Gate voor "klaar"

`cargo test` voor ingest en mrf, `cargo clippy --workspace -- -D warnings`, `cargo fmt --check`, web typecheck en de
geraakte unit-tests, de geraakte e2e-specs met `--project desktop`, `nix flake check --no-build` en de NixOS-VM-test
(`nix build .#checks.x86_64-linux.nixos-vm`), elk met een letterlijke exitstatus (`; echo "EXIT: $?"`, nooit achter een
pipe). Meet de ingestkosten (tijd en bytes per run) en zet ze in de MIP.

Meld daarna in één bericht: branch-head, PR-link, de meting (MAE native vs S1 als je het native veld vond), de
ingestkosten, en wat open is voor de PO.

Stop en meld het bij een ontwerpvraag die hier niet in staat. Gok niet.
