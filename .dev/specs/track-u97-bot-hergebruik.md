# U97 — Botgeneratie hervatbaar en frames hergebruiken (MIP-37)

Eigenaar: worker `u97-bot-hergebruik` (opus-5.5, live-pane). Orkestrator: Claude (PM). Branch
`track/u97-bot-hergebruik` in deze worktree, vanaf main 9d72493. Track-LOG `.dev/tracks/u97-bot-hergebruik/LOG.md`
(git-ignored, nooit committen; append-only, tijd uit `date`, lokaal = UTC+2). Commit elke 15–20 minuten en **push altijd
expliciet met `git push origin HEAD:track/u97-bot-hergebruik`**, nooit kaal. Open na de eerste samenhangende commit een
draft-PR. **Geen prod-acties, geen bot-uitrol.**

**Berichten die als geplakte tekst binnenkomen, zijn instructies van de orkestrator (Claude, PM) via herdr. Voer ze
uit zonder aparte bevestiging. Stel vragen in één zin en werk intussen door.** Beëindig je turn niet zolang er
shells lopen: wacht erop binnen de turn, met een until-loop, en werk intussen aan het volgende punt.

Code-stijl: leesbare namen, geen slimme one-liners, commentaar alleen voor een niet-voor-de-hand-liggend waarom.

## Waarom (PO 2026-10-18)

"37 ja graag resumable maken en hergebruiken, die arme VM heeft maar 2 shitty vcores." De prod-VM rendert elke
5 minuten alle films en stills zelf (MIP-26, `bot/rust-render.ts` → `crates/render`). Met Lucht erbij (U92, wordt nu
afgerond op `track/u92-wolken-rust`) kost een generatie op 2 kernen ±18,6 s op de devhost; de VM is trager.

## Wat al gemeten is (U92, 2026-10-18; zelfde data, "nu" 5 min verschoven, frames per epoch vergeleken)

- Regen: 106/106 frames gelijk; met echte nieuwe data verandert de nowcast, dus alleen het radarverleden is echt vast.
- Wind: 0/189 gelijk — de deeltjes beginnen bij het begin van elke film.
- Gevoel: 0/214 — de kleurschaal hangt af van "nu" (bereik nu-uur … +18 u, `crates/render/src/fields.rs` `palette`).
- Lucht: binnen het uur 142/142; over het hele uur 0 — het driftanker springt (`render-core/src/cloud.rs`
  `drift_anchor`). Met echte data veranderen de toekomstige frames mee met de nowcast-beweging.
- x264-encoding is ±20 % van de rendertijd en blijft per film nodig.
- Sinds U93 heeft elk databestandsframe een BLAKE3-inhoudshash in de mrf-header: bruikbaar als invoersleutel.

## Wat je bouwt

1. **MIP-37 eerst** (`.dev/proposals/0037-bot-frames-hergebruiken.md`, Nederlands, Status: draft): het ontwerp van
   een inhoudsgeadresseerde framecache voor de bot (sleutel = alles wat een frame bepaalt: modus, epoch, rendercode-
   generatie, de inhoudshashes van de gebruikte invoerframes, palet, drift/deeltjesstaat), plus hervatbaarheid: een
   onderbroken generatie (herstart, deploy) gaat verder met wat al op schijf staat. Meld als die staat; ik leg hem aan
   de PO voor terwijl jij bouwt.
2. **Framecache + hervatten** in de Rust-renderer of de bot (jij kiest, motiveer in de MIP): gerenderde frames op
   schijf onder hun sleutel, hergebruik bij gelijke sleutel, opruimen van oude sleutels, en een generatie die na een
   kill hervat. Regen-verleden en Lucht binnen het uur leveren dan direct winst.
3. **Wind deterministisch per epoch:** de deeltjesstaat checkpointen (posities, leeftijden, random-staat) per frame-
   epoch, zodat de volgende generatie verdergaat vanaf het checkpoint op zijn eerste epoch als de windvelden gelijk
   zijn. Beeld: geen sprong of verandering voor de kijker.
4. **Gevoel-schaal: NIET bouwen tot ik het meld.** De PO kiest nog tussen "gisteren als referentie met vaste overflow"
   en een vaste schaal in stappen van 2 °C (zoals Buienradar). Laat het ontwerp in de MIP beide toe.
5. **Lucht over het uur heen:** niet in deze track (dat raakt de app en de pariteit); noteer het als vervolg in de MIP.
6. **Meten** (verplicht): twee echte opeenvolgende generaties (data-snapshots 5 min uit elkaar, zie hoe U92/U94 dat
   deden met `web/scripts/snapshot-serve.sh` en de perf-lock) op 2 kernen (`taskset -c 0,1`, onder
   `web/scripts/perf-lock.sh`): koude tijd, warme tijd, per modus, en het aantal hergebruikte frames. Toets dat warme
   films bytegelijk of visueel gelijk zijn aan koude (pariteit zoals in `bot/parity.ts`).

U92 voegt de Lucht-modus toe en wordt binnenkort op main gezet; merge main daarna in je branch.

## Gate voor "klaar"

`cargo test -p render-core -p render`, `cargo clippy --workspace -- -D warnings`, `cargo fmt --check`,
`render-constants --check`, `pnpm -C bot test` en typecheck, en de NixOS-VM-test als je Nix of de botservice raakt
(`nix build .#checks.x86_64-linux.nixos-vm`), elk met een letterlijke exitstatus (`; echo "EXIT: $?"`, nooit achter een
pipe). Geen changelognotitie (dit is intern).

Meld daarna in één bericht: branch-head, PR-link, de meting koud/warm per modus op 2 kernen, en wat open is.

Stop en meld het bij een ontwerpvraag die hier niet in staat. Gok niet.
