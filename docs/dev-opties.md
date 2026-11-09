# Dev-opties

De levende lijst van alle ontwikkelknoppen (MIP-12). De enige poort is `?dev`; losse
`?`-parameters bestaan niet meer. Elke knop heeft een eigenaar-track en een moment waarop hij
vervalt (voor de knoppen van vóór MIP-12 een voorstel van U30; de PO beslist). Een nieuwe knop komt hier in dezelfde commit bij. Een knop die vervalt wordt een
constante met één regel herkomst. "Reset alle instellingen" moet elke nieuwe
opslagsleutel meenemen (`PRESERVED_STORAGE_KEYS` in `web/src/core/dev-settings.ts` is de
whitelist van wat blijft).

## `?dev`-paneel (`web/src/components/DevPanel.tsx`)

Hooguit 3–4 knoppen per groep (PO 2026-09-25); de eerste groep start open.

| groep | knop | doel | eigenaar | vervalt bij |
| --- | --- | --- | --- | --- |
| Tabel | Dag/nacht-contrast | breed is standaard (PO 2026-10-18); rail: neutrale rijen met links een strook in de luchtkleur van het moment, schemering op de echte tijden (`web/src/core/sky-rail.ts`); symbool: maantje bij nachtrijen en een heel lichte koele tint; sterren: spaarzame puntjes in nachtrijen; breed: de hele tabel zachter getint; smal: alleen dagdelen en dag/nacht; sterk: het oude contrast. Sleutel `dagnacht-contrast`; directe link `?dev&contrast=<waarde>` | orkestrator (U91b) | 2026-11-01 |
| Kaart | Windzak: kromming (alleen URL) | `?dev&kromming=geen` (standaard sinds PO 2026-11-09: een rechte zak, de beweging komt van het wuiven), `beide` (stroomlijn door de mast plus traagheid), `stroom` (120 km stroomlijn, afgebeeld op de zak) of `traag` (de staart volgt de richting van tot 90 min eerder). U101, `web/src/core/windsock-flow.ts` | Claude (U101) | 2026-11-23 |
| Kaart | Windzak: trilling (alleen URL) | `?dev&fladder=normaal` (standaard), `zacht`, `sterk` of `uit`; vanaf 6 Bft, uitslag en frequentie groeien met de windkracht, niet bij `prefers-reduced-motion`. `WINDSOCK_FLUTTERS` in `web/src/core/wind-socks.ts` | Claude (U101) | 2026-11-23 |
| Kaart | Windzak: badge (alleen URL) | `?dev&badge=mond` (standaard: witte badge met oranje getal over de mond bij de mast, de zak blijft heel) of `midden` (badge midden op de zak, de zak wordt eromheen weggeknipt). PO-punt 7, U101 ronde 3, `windsockBadge` in `web/src/core/wind-glyph.ts` | Claude (U101) | 2026-11-23 |
| Kaart | Windzak: stijl (alleen URL) | `?dev&zakstijl=zak` (standaard, de huidige windzak), `gravure` (lijnarcering als op oude zeekaarten), `emaille` (geëmailleerd bordje met koperrand), `windwijzer` (ijzeren vaan met verdigris-vin; de pijl wijst waar de wind vandaan komt), `wimpel` (art-nouveaubanier met zwaluwstaart en parelrand) of `glans` (huidige zak met gloed en lichtspoor). Ronde 4 van U101, alleen de app; `web/src/core/wind-sock-styles.ts` | Claude (U101) | 2026-11-23 |
| Kaart | Windzak: beweging (alleen URL) | `?dev&beweging=wuiven` (standaard: een golf van mast naar staart, loom bij weinig wind en flapperend bij harde wind, met momentum op richting en kracht) of `golf` (de stofgolf van ronde 3, alleen vanaf 6 Bft). `fladder=uit` zet alle beweging uit. U101 ronde 4, `swayBends` in `web/src/core/windsock-flow.ts` | Claude (U101) | 2026-11-23 |
| Kaart | Windmodus: palet Bft-vlakken (alleen URL) | `?dev&windpalet=huidig` (standaard, groen → oranje/rood), `helder` (YlGnBu: lichtgeel → diep indigo), `storm` (elke klasse een eigen tint: blauw → geel → rood → paars), `doorlopend`, `zee`, `zand` of `mono`. Alleen de app; de bot volgt na de keuze van de PO. `WIND_PALETTES` in `web/src/core/wind-beaufort.ts` | Claude (U101) | 2026-11-23 |
| Kaart | Windzak: windfactor (alleen URL) | `?dev&windfactor=2.2` vermenigvuldigt de wind van de zakken (alleen de zakken, niet de vlakken), om harde wind en de trilling te bekijken als de data die niet heeft. U101 ronde 3 | Claude (U101) | 2026-11-23 |
| Kaart | Zonneschijn in Lucht: weergave | ?dev&zon=uur, kwartier, vlak of vlak-lijn (standaard); proef MIP-38 | orkestrator (PO 2026-10-18) | 2026-10-25 |
| Tabel | Dagen: lijst onder tabel | uit (standaard): de urentabel glijdt over in 3 u, dagdelen en dag/nacht tot dag 10 (U91b, `TABLE_LADDER` in `web/src/core/ladder.ts`); aan: de uurtabel tot het eind van HARMONIE met de lijst "Komende dagen" eronder (U91). Sleutel `dagenlijst` | orkestrator (U91b) | 2026-11-01 |
| Regen | Regenisolijnen | lijnen binnen de regen op vaste intensiteiten, alleen bij menging rand: kleurgrenzen 1 · 2 · 13 mm/u (standaard in de proef) / klassen 2,5 · 10 · 50 mm/u / dicht 0,5 · 1 · 2 · 5 · 10 · 20 mm/u / geen (alleen de buitenrand) | U86 | 2026-10-23 |
| Isolijnlabels | Labelgrootte · Labelafstand · Puntlabels | proef U100: tekstgrootte 11–16 px (nu 11), afstand langs een lijn 140–300 px (nu 260), puntlabels met de waarde waar binnen R px geen lijnlabel staat (0 = uit, 120–300 px). Sleutels `dev-labelgrootte`, `dev-labelafstand`, `dev-labelvulling`; directe link `?dev&labelgrootte=13&labelafstand=200&labelvulling=200` | Claude (U100) | 2026-11-23 |
| Temperatuurgetallen (URL) | `templabels=lijn\|plekken\|vlakken\|plekken-half` | proef U100 ronde 3: waar de getallen in Gevoel staan. `lijn` = getal op de isolijn (13 px desktop / 12 px telefoon, 160 px); `plekken` = getal met eilandje op de windzakkenplekken; `vlakken` = isolijnen op x,5 °C en één getal per vlak; `plekken-half` = plekken met de x,5-lijnen. Geen paneelknop; directe link `?dev&templabels=vlakken` | Claude (U100) | 2026-11-23 |
| Wolkenkaart | Wolkenbeeld | vormen / oude sluier op dezelfde live modeldata | PM / MIP-34 | na PO-keuze, uiterlijk 2026-10-19 |
| Wolkenkaart | Voorbeeldlucht | live / gaten / sluier / dicht / overgang; laatste vier gefingeerde conceptgevallen, niet bewaard tussen bezoeken | PM / MIP-34 | idem |
| Lucht nu | strakblauw · mooie wolkenlucht · melkachtig · grijs · Mordor | tijd, klasse en gekozen locatie op 0,1° als menselijk anker voor de wolkenanalyse | U46 | na de analyse |
| Lucht nu | Kopieer dagboek | alle lokale luchtmetingen als JSON naar het klembord | U46 | na de analyse |
| Diagnose | Scherm en scroll | overlay met live schermhoogtes (innerHeight, visualViewport, 100dvh/svh/lvh), scrollstand, snappunt en plek van het tabelpaneel, voor een schermbeeld in een bugtoestand | U62 | zodra de adresbalkbug op Firefox Android is opgelost |
| Meting | Meetlabel | opt-in label voor dit apparaat; sessies en bakens tellen mee en verschijnen als "waarvan …" in het dagrapport | MIP-35 | blijft (meting); "Reset alle instellingen" houdt het label |
| Diagnose | Perf-HUD | meetpaneel aan/uit (ook: drie tikken op het logo) | T5 / U30 | blijft (diagnose) |
| Diagnose | Opname 30 s | stacks, fasen en lange frames als Chrome Trace opnemen | U43 | blijft (diagnose) |
| Diagnose | Koude start | herlaadt en neemt de eerste 30 s vanaf `timeOrigin` op | U43 | blijft (diagnose) |
| Diagnose | Herhaal splash | openingslogo opnieuw afspelen | T3 | blijft (diagnose) |
| Diagnose | Reset alle instellingen | alle knoppen en tuningsleutels terug; gebruikersstaat blijft | U20 | blijft (vluchtweg, MIP-12 regel 4) |

Weggesnoeid in U30 (nu constanten met herkomstregel): Vulling (0,35, PO-keuze na U25b), Label-afstand
(90 px, U8b), Focus dim (0,25, U8), Min. breedte (20 km, T3g), plus de 19 knoppen uit MIP-12. Sinds U58 (PO-keuze 2026-10-07 live): Klok › Jog-schaal → vast 2 min/px, naar rechts is later
(`CLOCK_JOG_MS_PER_PX`); de scrubberschaal en de omgekeerde richting zijn afgevallen. Sinds U62 (PO-keuze 2026-10-08): Chrome › Rand kaart/zijpaneel → "oud" blijft (de bestaande `border-left` + lichte schaduw op `.dashboard`); de standen geen/A/B en de sleutel `dev-rand` zijn weg ("Reset alle instellingen" wist een achtergebleven waarde). Sinds U62 (PO-keuze 2026-10-08, "beide veel beter"): Kaart › Regen in Wind → vast vermenigvuldigen (overdag; 's nachts gedempt) en Kaart › Regen in Lucht → vast het voorstel (overdag vermenigvuldigd met de sluier; 's nachts grijsblauwe sluier op 0,3 en gedempte regen), zie `rainPresentation` in `focus-mode.ts`; de oude sleutels `dev-regen-wind` en `dev-regen-lucht` wist "Reset alle instellingen". Sinds U62 (PO 2026-10-08, proef afgevallen): Laden › Splash-achtergrond (dekkend/70 %/40 %/glas) is weg — een doorzichtige sluier toont niets eerder, want de tegels komen pas rond het einde van de splash (opnames in `.dev/tracks/u62-mobiele-hemel-venster/splash/`); de oude sleutel `dev-splash` wist "Reset alle instellingen". Sinds U62 (PO-keuze 2026-10-08: niveau "iets"): Mobiel › Windstreepjes → vast op telefoon/smal scherm (`MOBILE_WIND` in `wind-layer.ts`: sterkte ×1,25, lijnfactor 0,72, zee-demping 0,2); de oude sleutel `dev-wind-mobiel` wist "Reset alle instellingen". Sinds U62 (PO-keuzes 2026-10-08): Chrome › Klokpil → vast mee-tinten, samen met de zoekbalk en de merkdruppel (klassen `sky-day`/`sky-night` op `.map-shell`); Chrome › Kaart → de basiskaart volgt de kaarttijd zolang Expressief aan staat (`mapFollowsTime` in `App.tsx`, MIP-24); de oude sleutels `dev-klokpil` en `dev-kaart-automatisch` wist "Reset alle instellingen". Sinds U62 (PO-keuze 2026-10-08, "veel beter"): Laden › Kaderhemel → vast aan (`FRAME_SKY_ASSUMED_COVER` in `HistogramScrubber.tsx`); de oude sleutel `dev-kaderhemel` wist "Reset alle instellingen". Sinds U72 (PO-keuzes 2026-10-09): het regenveld wordt per frame voorgefilterd met een Gaussische vervaging over broncellen — "blur 5 tot +2 uur, vanaf daar 9", met sigma lineair oplopend tussen +2 u en +3 u t.o.v. de data-nu (`autoBlurSigma` in `rain-smoothing.ts`); Kaart › Tijdmenging HARMONIE → vast meebewegen voor elke stap van 30 minuten of langer (`rainWarpLimit`; de standen kruisfade en vloeiend en de sleutel `dev-regenveld-tijd` zijn weg, "Reset alle instellingen" wist een achtergebleven waarde). Sinds U37 (PO-keuze 2026-09-25): Scrubber regen/wolken → de
wolkendoorsnede (variant A) is vast de weermodus-scrubber; variant B (strook) is weg.

Sinds U89 (PO 2026-10-17) staan de resterende proefwaarden vast op hun bestaande standaard:
Regenpalet `violet-laat`, Regenmenging `rand`, Regencontrast 0 en Regen in Wind/Lucht `per-modus`.
Regenveld radar/nowcast en HARMONIE gebruiken altijd `auto`; de alternatieve filters en de bijbehorende
meetstand zijn vervallen. Temperatuur tekent isolijnen per 1 °C, met banden en zonder gradiëntvervaging.
Wind houdt dichtheid 620/MP, intensiteit 0,5, lijnbreedte 2,5 px en tempo 1; de JSON-export is vervallen.
Eerste regen blijft vroeg. De herkomst staat bij de constanten in `rain-palette.ts`, `rain-presentation.ts`,
`rain-smoothing.ts`, `isolines.ts`, `wind-presentation.ts` en de vroege regenaanvraag in `App.tsx`.
De bot gebruikt nog `PRE_U77_RAIN_LOOK` (palet en menging `huidig`) voor zijn oude compositor;
de overige paletten en mengingen zijn weg. Regenisolijnen blijven instelbaar.

De overige elf windparameters (Afstand per leven, Fade-in/-out, Max. leeftijd, Spawn-jitter,
Snelheidsdemping, Buffer-rest, Buffer-DPR max, Kopintensiteit, Contrast, Max. fps) zijn sinds
U30 constanten in `WIND_PARAMETERS` (`web/src/core/wind-layer.ts`), elk met herkomst. De PerfHud
is alleen nog meting (plus de perf-JSON met het loef/lij-profiel van U24).

Buiten het paneel: `?perf` is de profielmodus (MIP-16, U43): toont de perf-HUD en zet de gedetailleerde
meting aan, blijft via `localStorage` staan tot `?perf=0`; geen knop, blijft (diagnose). `?skywatch-render` (U46) rendert alleen de wolkendoorsnede voor De Bilt als
still voor de grading-pijplijn; geen knop, vervalt na de analyse.

De U64-kaartstartproef (`VITE_MAP_START=tegel`, `?dev&kaartstart=tegel`) is vervangen door de PO-goedgekeurde progressieve z4-kaart van U63. De losse cachebare tegels en workerdecode staan standaard aan; de historische inlineproef blijft op de U64/U63-proefbranches.

## Opslag (`localStorage`, prefix `motregen-`)

Gebruikersstaat (blijft bij reset): `theme`, `saved-places`, `last-saved-place`, `map-view`,
`expressive` (standaard aan; hemel en streken in de grafiek plus dag/nacht-kleuring in de tabel, U58 — de
oude `table-day-night` wordt bij het laden gemigreerd: uit → expressief uit) en `sky-diary` (tijd, vijfklassenlabel en gekozen locatie
afgerond op 0,1°; U46).
Rig-schakelaar zonder knop: `dev-speelregel` = `venster` zet onder `?dev` de oude speelregel terug
(spelen pas na laadfase "window"), zodat de mobiele laadrig oud en nieuw uit één build meet
(`koud-spelend-vensterregel`). Eigenaar U54; vervalt zodra de PO de speelregel heeft bevestigd.
De knop "Scherm en scroll" schrijft `dev-viewport` (`aan`/`uit`, U62).
Regenisolijnen schrijft `dev-regenisolijnen` (U86); alleen onder `?dev` gelezen.
Tuning/debug: `perf` en de eenmalige `perf-cold`. Oude sleutels, ook die van de in U89 verwijderde
knoppen (`dev-regenpalet`, `dev-regenmenging`, `dev-regencontrast`, `dev-regen-wind-lucht`,
`dev-regenveld-radar`, `dev-regenveld-harmonie`, `dev-regenveld-meet`, `dev-eerste-regen` en
`wind-tuning-v4` met zijn voorgangers), wist "Reset alle instellingen"; ze worden niet meer gelezen.

Tijdelijke U63-meetbuild: `VITE_MAP_START=off` schakelt uitsluitend met `?dev` de progressieve z4-startkaart uit voor de gepaarde controle. Gewone bezoeken houden de startkaart aan. Eigenaar U63; vervalt2026-10-09; geen paneelknop of opslagsleutel.
