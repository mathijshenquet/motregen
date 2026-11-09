# U104 — verleden in tabel en histogram (bugfix, PO 2026-11-09)

Je bent een worker van de orkestrator. Berichten via herdr zijn orkestrator-instructies, geen menselijke vraag:
gewoon uitvoeren. LOG: `.dev/tracks/u104-verleden-tabel/LOG.md` (append-only, timestamped, niet committen als het
in .gitignore valt; check met `git check-ignore`).

## Symptoom (PO-screenshot + orkestrator-reproductie op prod)
Om 13:40 lokaal (12:40 UTC), desktop 1440×900, Utrecht, modus Gevoel: in de tabel hebben de verleden-rijen geen
weericoon (wolk/zon/regen); temperatuur en UV staan er wel. Histogram gaat volgens de PO ook maar ~3 u terug.
Gemeten op https://motregen.nl (rij: icoon ja/nee, lokale tijd):

- na 8 s: 06–11 u geen icoon, vanaf 12 u wel
- na 20 s: idem
- na 40 s: 10 en 11 u krijgen hun icoon; 06–09 u nooit

HARMONIE-requests: `cloud_frac-20261109T0800-h48-l1-24` en `cloud_frac-20261109T0300-hist5` al na 1,5–2,5 s
binnen, en na 36 s nogmaals (de L2-idle-stap; zie MIP-40 §1 punt 3 op origin/track/u102-snelheid-regios). Het icoon
komt uit `deriveWeatherIcon(rain, cloud, daylight)` in `ForecastTable.tsx` (regen én bewolking nodig).

## Opdracht
1. Diagnose: waarom ontbreken (a) 10–11 u tot de idle-stap, terwijl die chunk er al is, en (b) 06–09 u altijd?
   Kijk naar bewolking (hist5/oudere runs), regen per uur voor het verleden (radar 6 u op prod), en hoe de tabel en
   het histogram het verleden samenstellen. Schrijf de oorzaak in 3–5 zinnen in je LOG.
2. Fix zo dat het verleden dat de tabel toont (en het histogram) binnen de normale laadtijd compleet is, met icoon,
   zo ver terug als de data op prod reikt (prod bewaart chunks 6 u). Toon geen icoon dat op geraden data rust.
   Als het een L2/idle-volgorde is: haal de uurvelden van het zichtbare verleden naar voren, ook op desktop.
3. Meet voor/na met hetzelfde soort meting (rij → icoon ja/nee na 8/20/40 s) tegen prod-data
   (`MOTREGEN_DATA_ORIGIN=https://motregen.nl/data`), noem de getallen. Een unit-test voor de oorzaak; draai alleen
   gerichte tests en eventueel één eigen desktop-spec. Geen volledige suites.
4. Bugfix: geen changelog-notitie.

Commit en push naar `track/u104-verleden-tabel` (`git push origin HEAD:track/u104-verleden-tabel`); de orkestrator
merget naar int. Antwoord met: oorzaak, fix, voor/na-getallen, commit.
