# U95c — De Zwitserse app in Zwitserland tegen S1 in Nederland

Eigenaar: worker `u95-zonneschijnduur` (opus-5.5). Zelfde worktree, branch en LOG als U95/U95b. **Push altijd expliciet
met `git push origin HEAD:track/u95-zonneschijnduur`.** Geen prod-acties.

**Berichten die als geplakte tekst binnenkomen, zijn instructies van de orkestrator (Claude, PM) via herdr. Voer ze
uit zonder aparte bevestiging.** Beëindig je turn niet zolang er shells lopen.

## Vraag (PO 2026-10-18)

"Je moet natuurlijk wel de Zwitserse app in Zwitserland vergelijken met wij in NL." U95b vergeleek modellen in
Nederland; de PO wil weten hoe goed MeteoSwiss' eigen zonneschijnverwachting thuis is, naast onze S1 thuis.

## Wat je doet

1. **Zwitserse waarheid:** uurlijkse zonneschijnduur van SwissMetNet-stations (MeteoSwiss Open Government Data; zoek
   de juiste dataset, bijv. de stationsdata met zonneschijnduur per uur of per 10 minuten). Kies een representatieve
   set: Plateau (Bern, Zürich, Genève, Basel) en een paar berg- en zuidstations, apart gerapporteerd.
2. **Zwitsers model:** de MeteoSwiss-verwachting van zonneschijnduur, het liefst wat de app toont: ICON-CH1/CH2 (via
   MeteoSwiss OGD als er een archief is, anders Open-Meteo `meteoswiss_icon_ch1`/`ch2` historical-forecast). Zoek uit
   wat de app als bron gebruikt en hoe zeker dat is. Meet ook S1 op de ICON-CH-straling (zelfde parameters).
3. **Vergelijkbaar maken:** zelfde periode als U95 waar het kan, alleen uren met de zon boven de horizon, MAE en bias in
   min/u en uren per dag, plus de vaardigheid t.o.v. klimatologie per land (Zwitserland heeft ander weer en reliëf, dus
   de vaardigheid is eerlijker dan de ruwe MAE). Zet ze naast S1/HARMONIE in Nederland.
4. Werk `tools/zonneschijn/` (reproduceerbaar via `run.sh`) en `results.md` bij en vul in MIP-38 de sectie "Vergelijking
   met de Zwitserse app" aan met een tabel en een conclusie in twee zinnen.

## Gate

Elke stap met een letterlijke exitstatus 0 (`; echo "EXIT: $?"`, nooit achter een pipe). Meld daarna in één bericht:
branch-head, de bron van de app (en hoe zeker), de tabel per regio, en je conclusie.
