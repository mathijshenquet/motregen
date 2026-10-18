# MIP-37 — Botframes hergebruiken en generaties hervatten

Status: draft · auteur: worker U97 (opus-5.5) voor de PM

## 1. Het probleem
De bot op de prod-VM (2 vcores) rendert elke vijf minuten alle films en stills opnieuw (MIP-26, MIP-29: `bot/rust-render.ts`
→ `crates/render`). Met Lucht erbij kost een generatie op twee kernen van de devhost ±18,6 s; de VM is trager. Een groot
deel van die frames is gelijk aan een frame uit de vorige generatie, maar wordt toch opnieuw berekend. Een onderbroken
generatie (herstart, deploy) begint bovendien van voren af aan.

Koud profiel op de devhost (`taskset -c 0,1`, snapshot 2026-10-16 06:05Z, main 9d72493, nog zonder Lucht): 13,2 s wand,
23,5 s CPU. Grootste posten: Regen mengen 5,8 s, JPEG 3,5 s (85 stills), sampling 2,0 s, beweging 1,0 s; Gevoel vlakvulling
10,2 s, contouren 4,7 s, JPEG 1,6 s; Wind deeltjesstrepen 4,5 s. x264 is per film nodig en blijft (±20 % van de rendertijd).

## 2. Eerder werk
- U92 (2026-10-18) vergeleek frames per epoch met dezelfde data en "nu" 5 min verschoven: Regen 106/106 gelijk, Wind
  0/189, Gevoel 0/214, Lucht 142/142 binnen het uur en 0 over het uur heen. Oorzaken: Wind = deeltjestijd telt vanaf het
  begin van de film; Gevoel = `palette(now)` over nu-uur … +18 u; klokpaneel kleurt anders voor `epoch <= now`;
  `blur(frame − now)` groeit na +120 min lead; Lucht = `drift_anchor` per uur. Met echte nieuwe data verandert bovendien
  de nowcast, dus bij Regen is alleen het radarverleden echt vast.
- U93: elk frame en elk bewegingslid in een mrf-chunk heeft een BLAKE3-hash van het gecomprimeerde lid in de header.
- `crates/render/src/shared.rs` deelt gedecodeerde rasters tussen modi binnen één generatie; over generaties heen
  bewaart niets iets.
- MIP-30: de bot bewaart uitvoer per manifestsleutel; dat helpt niet zodra "nu" verschuift.

## 3. Aanbeveling

### 3.1 Waar: in de Rust-renderer
Alleen de renderer weet welke bronframes, mengfactoren, blur en toestand een frame bepalen. In de bot zou die kennis
gedupliceerd moeten worden uit het manifest, en elke rendererwijziging zou de bot stil laten afwijken. De bot geeft
alleen een map door: `motregen-render … --frame-cache <map>` (bot: `MOTREGEN_FRAME_CACHE`, standaard
`<rendercache>/frames` onder `/var/cache/motregen-bot`). Zonder die vlag werkt de renderer zoals nu (tests, pariteit).

### 3.2 De sleutel
Per frame een BLAKE3-hash over een vaste byte-serialisatie van alles wat de pixels bepaalt:
1. schemaversie van de cache;
2. **rendercode-generatie** = BLAKE3 van de renderer-executable zelf, eenmaal per run berekend. Elke nieuwe build maakt
   alle oude frames ongeldig; er is geen handmatig versienummer dat iemand kan vergeten op te hogen. Constanten,
   lettertypen en paletten zitten via `include_str!`/`include_bytes!` in die binary;
3. de basemap-bestanden (BLAKE3 van `basemap.json` en de plaat- en watermaskers die de run inleest);
4. modus, klokvariant, beeldmaat;
5. per frame: epoch, still-vlag, `epoch <= now` (klokpaneel);
6. per gebruikt bronframe: mrf-lidhash plus de decodeercontext uit de header (grid, kwantisatietabel, predictor, dict,
   bron) en de bewerking (Regen: blur-σ en -taps, celbreedte, zichtvensterbegrenzing); voor beweging de hash van het
   bewegingslid en het bewegingsgrid; de mengfactoren als exacte bits;
7. modusafhankelijk: Gevoel het palet (de exacte bandwaarden), isolijn-randvervaging (`opacity`), Wind de deeltjestijd;
8. bij Wind en Gevoel de hash van de labeltoestand vóór dit frame (3.4).

Ontbreekt een lidhash (chunk van vóór U93), dan is dat frame niet cachebaar: het wordt gewoon gerenderd en niet bewaard.

**Bewaking tegen verouderde frames.** De renderer voorspelt de bronframes voor de sleutel goedkoop uit de headers. Bij
elke miss legt `Dataset` vast welke bronframes het renderen werkelijk las; zit daar iets buiten de voorspelling, dan
wordt het frame niet bewaard en telt `cache_mismatches` in `media.json` op (tests eisen nul). Een hit komt altijd van een
eerdere miss met dezelfde code en dezelfde sleutel, dus die controle dekt ook de hits.

### 3.3 Wat er op schijf staat
- Per filmframe het RGB-beeld, zstd-gecomprimeerd (verliesvrij, dus bytegelijk terug). Schatting ±0,8–1,1 MB per frame
  (3,5 MB rauw); exact te meten in de bouw.
- Per still de JPEG-bytes; stills buiten de film hoeven dan helemaal niet meer gerenderd of gecodeerd te worden.
- Bij Wind en Gevoel de labeltoestand na het frame (3.4).
- Per film de MP4 onder een filmsleutel (hash van alle framesleutels + encoderinstellingen + fps + hold), zodat een
  complete film na een onderbreking niet opnieuw door x264 hoeft.
- Elk bestand atomair: schrijven naar een tijdelijk bestand, dan `rename`. Een onleesbaar of afgekapt bestand is een miss
  en wordt verwijderd.

Ruimte: met Lucht ±665 filmframes en 255 stills per generatie ≈ 0,7 GB; tijdens een generatie staan oude en nieuwe
sleutels kort naast elkaar (≈ 1,4 GB piek). Zie open vraag 2.

### 3.4 Toestand over frames heen
- **Wind deterministisch per epoch.** De deeltjes zijn al een zuivere functie van de deeltjestijd: elke frame trekt
  dezelfde vaste toevalsreeks, en positie en leeftijd volgen uit `simulation_seconds`. Die tijd telt nu vanaf het begin
  van de film (`1 + index / fps`), en daardoor schuift elk frame per generatie. Voorstel: de deeltjestijd afleiden uit de
  epoch (filmseconden sinds 1970: `epoch / framestap / fps`). Dan toont elke generatie op dezelfde epoch dezelfde deeltjes;
  geen sprong voor de kijker. Een checkpoint van posities, leeftijden en toevalsstaat is dan overbodig: die staat bestaat
  niet als losse toestand. Zichtbaar verschil: de eerste seconde van de film is niet meer leeg, de deeltjes lopen meteen
  (open vraag 1).
- **Isobaarstap en isolijnlabels** hebben wel geheugen: de drukstap heeft hysterese en labels blijven op hun vorige
  ankers staan. Daardoor hangt een frame af van alle frames sinds het begin van de film. Voorstel: die toestand (stap,
  ankers, labelsleutel met de frame-epoch in plaats van een tijdlijnindex) na elk frame bewaren. De volgende generatie
  start op zijn eerste epoch met de toestand van het frame ervoor uit de vorige generatie, als die er is; anders fris,
  zoals nu. Daarna lopen de sleutels gelijk zolang de velden gelijk zijn, en ook bij een hit wordt alleen de bewaarde
  toestand geladen, zonder contouren of labels te rekenen. Gevolg: een warme film is bytegelijk aan een koude film die met
  hetzelfde checkpoint start, maar niet aan een volledig koude film (labels kunnen op een andere plek staan; open vraag 3).
- Regen heeft geen toestand over frames heen.

### 3.5 Hervatten
Volgt uit 3.3: elk frame gaat naar schijf zodra het klaar is. Na een kill of herstart rendert de volgende run hetzelfde
manifest (of een nieuwer) en krijgt hits voor alles wat al klaar was, inclusief complete films. Na een deploy met een
gewijzigde renderer is alles bewust een miss (3.2, punt 2); een deploy die alleen de bot raakt, laat de binary en dus de
cache intact.

### 3.6 Opruimen
Na elke geslaagde modus verwijdert de renderer de cachebestanden van die modus die deze generatie niet gebruikte, plus
achtergebleven tijdelijke bestanden. Er staat dus hooguit één generatie plus wat een onderbroken run achterliet. De
bestaande bot-prune laat de submap `frames/` met rust.

### 3.7 Gevoelstemperatuur-schaal
Niet in deze track. Het palet zit als exacte bandwaarden in de sleutel. Beide PO-opties ("gisteren als referentie met
vaste overflow" of een vaste schaal in stappen van 2 °C) maken het palet stabiel over generaties en leveren zonder
verdere cachewijziging hits op.

### 3.8 Lucht over het uur heen
Niet in deze track (raakt de app en de pariteit). Binnen het uur geeft de cache direct hits; bij de uurwissel springt
`drift_anchor` en is alles een miss. Vervolg: het driftanker per frame-epoch continu maken in app en bot tegelijk.

### 3.9 Meten (verplicht in de bouw)
Twee echte opeenvolgende datasnapshots, 5 min uit elkaar, op `taskset -c 0,1` onder `web/scripts/perf-lock.sh`: koude
tijd, warme tijd, per modus, en het aantal hergebruikte frames. Pariteit: elke warme film bytegelijk aan een koude film
met hetzelfde checkpoint, en Regen ook bytegelijk aan volledig koud.

Verwachting vóór meting: Regen hergebruikt het radarverleden en de stills waarvan blur en bronnen gelijk blijven
(U92: 77/84 stills); Wind en Gevoel hergebruiken bijna alles binnen dezelfde HARMONIE-run zodra hun tijd en palet stabiel
zijn (Gevoel pas na de schaalkeuze); Lucht binnen het uur bijna alles. x264 blijft per film.

## 4. Open vragen
1. Wind: de film begint met alle deeltjes al in beweging, in plaats van ze in de eerste seconde te laten inlopen. Akkoord?
   Richting van de worker: ja; het inlopen was een bijeffect van "tijd telt vanaf filmbegin", geen ontwerpkeuze.
2. Schijf: ±0,7 GB per generatie in `/var/cache/motregen-bot/frames`, kortstondig ±1,4 GB. Past dat op de VM? Zo niet:
   alleen stills en frames zonder nowcastbron bewaren.
3. Labels en isobaarstap lopen door vanaf de vorige film. Na een herstart zonder cache starten ze fris en kunnen ze één
   keer verspringen ten opzichte van de vorige film. Akkoord?

## Changelog
- 2026-10-18 13:18 CEST: concept (worker U97).
