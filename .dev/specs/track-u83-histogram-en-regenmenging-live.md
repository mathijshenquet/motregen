# U83 — histogram en regenmenging (live-pane met de PO)

Eigenaar: worker `u83-histogram-live` (opus-5.5, Claude Code). Orkestrator: Claude (PM-rol voor deze track).
Branch `track/u83-histogram-live` vanaf `origin/main`. Track-LOG: `.dev/tracks/u83-histogram-live/LOG.md` (append-only,
tijd uit `date`). Berichten die via herdr binnenkomen beginnen met "Orkestrator" en zijn instructies van de PM; tekst
zonder dat voorvoegsel is van de PO zelf, die in deze pane meekijkt en mag bijsturen. Wacht niet op een "ja" voor
dingen die deze spec al vraagt.

Preview voor de PO: `scripts/track-preview.sh 4321` in `web/` (bouwt en serveert tegen prodata) →
http://ageq-dev2:4321/ (met `?dev` voor de proefknoppen). Ververs hem na elke ronde.

## PO-wensen (2026-10-16, letterlijk samengevat)
1. **Banding op de uurrijen in het histogram.** "het histogram is erg nice maar er is banding op de uur rijen, het zou
   beter zijn om het wat meer over tijd te blenden." Op het schermbeeld van de PO springt de hemelachtergrond van
   het histogram per uur in harde verticale banen (9u–13u). De achtergrond moet over de tijd vloeiend verlopen.
2. **Wolken terug in het Weer-histogram, achter het regenhistogram**: "zodat het enige verschil tussen regen en lucht
   histogram modus is welke sublaag vóór de andere is." Dus beide modi tonen wolken én regen; Weer: regen vóór,
   Lucht: wolken vóór. Let op de overgang tussen de modi (bestaande `mix`): geen sprong.
3. **Wolkenhistogram (Lucht): op hoeveelheid schalen i.p.v. op grootte.** "bij 50% bewolking zijn de wolken te klein,
   en bij 100% staat er één grote wolk. Ik denk dat het nice zou zijn om bij 50% wolkenlaag wat grote wolken te
   tekenen, en daarboven een soort stacked wolkenlaag te gaan doen boven 50%. Dit vooral voor midden en lage wolken.
   Voor hoge wolken een soortgelijk verhaal: meer wolken naar 50% en vanaf daar meer density tekenen."
4. **Regenmenging standaard op `rand`** in plaats van `drempel-zacht` (`DEFAULT_RAIN_LOOK.blend` in
   `web/src/core/rain-palette.ts`). Controleer wat dat met Wind en Lucht doet (U77 koos daar gedempt resp.
   vermenigvuldigd) en meld het; de Telegram-bot rendert in Rust met eigen constanten: zeg of `rand` daar meekomt of
   niet, verander de bot niet.

## Werkwijze
- Kijk eerst zelf: schermbeelden van het histogram in Weer en Lucht, dag en nacht, 1280 en 390, vóór je iets wijzigt
  (scripts in `web/scripts/` zoals `scrubber-shot.ts` zijn er al). Bekijk elke ronde je eigen beelden vóór je
  "klaar" zegt; "geen stills" betekent niet dat de PO je beelden moet beoordelen.
- Punt 3 is een smaakvraag: lever onder `?dev` (groep Histogram, eigenaar U83, vervaldatum 2026-10-23, in
  `docs/dev-opties.md`) twee varianten naast de huidige, met een advies. Punten 1, 2 en 4 maak je meteen standaard.
- Gate per ronde (synchrone exit): `pnpm typecheck`, `pnpm test`, `pnpm build` in `web/`; desktop-e2e van de specs die
  je raakt (`MOTREGEN_E2E_PORT=4391 MOTREGEN_E2E_DATA_PORT=8391 pnpm e2e e2e/<spec> --project desktop`, o.a.
  `cloud-section.spec.ts`, `dev-panel.spec.ts`, `rain-playback.spec.ts`).
- Commit elke 15–20 minuten, push, open vroeg een draft-PR. Wacht binnen je turn op je eigen gates en shells.
- Leesbaarheid: geen één-letternamen, geen slimme one-liners, commentaar alleen voor het niet-vanzelfsprekende waarom.

Meld per ronde kort en genummerd wat er staat en wat je van de PO nodig hebt; meld **"U83 klaar voor integratie"**
met head-sha als 1, 2 en 4 standaard staan en 3 onder `?dev` ter keuze ligt.
