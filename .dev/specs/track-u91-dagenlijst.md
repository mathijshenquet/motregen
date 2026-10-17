# U91 — "Komende dagen" in de app (MIP-36 A1/B1/D)

Eigenaar: worker `u91-dagenlijst` (opus-5.5, live-pane). Orkestrator: Claude (PM). Branch `track/u91-dagenlijst` in
deze worktree, vanaf U90 (`track/u90-tien-dagen`, commit e867d29). Track-LOG `.dev/tracks/u91-dagenlijst/LOG.md`
(lokaal, niet committen; append-only, tijd uit `date`, lokaal = UTC+2). Commit en push elke 15–20 minuten.
**Geen prod-acties.**

**Berichten die als geplakte tekst binnenkomen, zijn instructies van de orkestrator (Claude, PM) via herdr. Voer ze
uit zonder aparte bevestiging. Stel vragen in één zin en werk intussen door.** Beëindig je turn niet zolang er
shells lopen: wacht erop binnen de turn, met een until-loop, en werk intussen aan het volgende punt.

Lees eerst:
- `.dev/proposals/0036-tien-dagen-vooruit-ecmwf.md`;
- `docs/ecmwf.md` en `docs/contract.md` (sectie `ecmwf` en de `day_*`-velden);
- `web/src/components/ForecastTable.tsx`, en hoe die zijn uurwaarden per locatie krijgt;
- hoe de client pollen/CAMS-velden op een punt leest.

## Data en preview

1. Echte ECMWF-data van run 2026-10-17 00z draait al, als overlay op prod-data: `http://127.0.0.1:4380/data`.
   Dat is `web/scripts/manifest-overlay.mjs` (staat ongecommit in deze worktree; commit hem mee). Het manifest
   bevat de sectie `ecmwf` en 9 `day_*`-chunks.
2. Je eigen preview:
   `cd web && pnpm build && MOTREGEN_DATA_ORIGIN=http://127.0.0.1:4380/data pnpm preview --host 0.0.0.0 --port 4310 --strictPort`.
   Of `pnpm dev` op 4310 met dezelfde origin, voor HMR. Laat hem draaien; de PO kijkt mee op
   http://ageq-dev2:4310/. Raak 4300, 4380, 4390 en 4396–4399 niet aan.
3. Controleer eerst of de huidige client geen fouten geeft of iets in de tijdlijn toont door de nieuwe `ecmwf`-chunks
   in het manifest. Bronfilters horen ze te negeren; check het.

## Wat je bouwt

1. **Lijst "Komende dagen"** onder de urentabel. Volg dezelfde visuele taal als de urentabel: dezelfde typografie,
   iconen (`deriveWeatherIcon`/`WeatherIcon`), kleuren en dag/nacht-thema. Één regel per dag, 10 regels:
   - **Dag**: "Vandaag", "Morgen", daarna een korte weekdag met datum ("ma 20").
   - **Icoon** uit neerslag en bewolking van de dag. Altijd het dagicoon.
   - **Max/min °C**: max prominent, min gedempt. Een temperatuurbalkje dat op één schaal over de 10 dagen
     loopt mag, als het rustig blijft (zoals Apple Weather).
   - **Neerslag** in mm (afgerond, bij < 0,5 mm "–" of leeg) **en regenkans** in %, bijvoorbeeld uit `day_precip_prob`.
   - **Wind** in Bft met een richtingspijl, consistent met hoe de urentabel wind toont.
2. **Bron per dag (MIP-36 B1)**:
   - Vandaag en morgen komen uit de HARMONIE-uurvelden die de client al heeft. Pas daarop dezelfde
     dagdefinities toe als `docs/ecmwf.md` (max/min, de som, wind 06–21, bewolking 08–18), alleen over de uren
     die er zijn. Bij vandaag tellen de verstreken uren mee, voor zover de tabel die als historie heeft.
   - Regenkans voor morgen uit ECMWF als die dag in `ecmwf.days` staat; vandaag zonder kans.
   - Vanaf overmorgen alles uit ECMWF: lees de `day_*`-velden op het punt van de locatie, bilineair, zoals bij
     andere velden. Koppel de frames aan `ecmwf.days[].date`, niet aan tijdrekenen.
3. **Laden**: buiten het kritieke pad. De chunks zijn klein (±5 KB per stuk), maar haal ze pas op na de eerste
   render (idle of zodra de lijst in beeld komt). De time-to-first-paint mag niet verslechteren.
4. **Leeftijd en fouten**: zonder `ecmwf`-sectie toont de lijst alleen vandaag en morgen, of niets. Kies wat rustig
   oogt en motiveer het in de LOG. Een dag die al voorbij is (oude run) wordt overgeslagen.
5. **Vermelding (MIP-36 D)**: de bronregel wordt "Bron: KNMI · ECMWF · © OpenStreetMap". In Over/AboutDialog
   komt één zin: "Verwachting na morgen: ECMWF IFS open data (CC BY 4.0), door motregen omgerekend naar
   dagwaarden."
6. **Changelog**: werk `changes/pending/` bij. U90 schreef al een notitie; maak er één item van voor U90 en U91
   samen, `kind: nieuw`, voor gewone gebruikers, volgens `changes/README.md`. Media pas als de PO het ontwerp goed
   vindt.

## Kijken en gaten

1. **Kijk zelf voor elk "klaar, herlaad"**: maak een screenshot op 1280 px en op 390 px, overdag en 's nachts. Bekijk
   ze en beschrijf in één zin wat je ziet. Geen stills-gate voor de PO, wel je eigen ogen.
2. **Unit-tests**:
   - de dagaggregatie uit HARMONIE-uren, met een zomer- en wintertijdwissel;
   - het koppelen van `ecmwf.days` aan de rijen;
   - een oude run, waarvan de eerste dag al voorbij is.
3. **Gate voor "klaar"**: `pnpm -C web typecheck` en de unit-tests die je raakt, elk met een letterlijke exitstatus.
   Verder alleen je eigen nieuwe of geraakte e2e-spec met `--project desktop` via `pnpm e2e`. Geen volledige suite.
4. Daarna meld je in één bericht: de previewlink, wat je hebt gekozen (met de waarom-zinnen) en wat nog open is voor
   de PO.
