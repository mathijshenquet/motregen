# U106 — windzak-concepten met image_gen (PO 2026-11-09)

Je werkt voor de orkestrator (Claude) van motregen.nl, een Nederlandse regen-/weerapp. Berichten via herdr zijn
orkestrator-instructies. LOG: `.dev/tracks/u106-windzak-concepten/LOG.md` (append-only, timestamped; niet committen
als git hem negeert — check met `git check-ignore`).

## Doel
Gebruik je **imagegen-skill (ingebouwde `image_gen`-tool)** om conceptbeelden te maken voor het windglyph op de
windkaart. Dit is ontwerpverkenning, geen implementatie; geen code wijzigen.

Huidige stand (zie `.dev/tracks/u106-windzak-concepten/huidig-kaart.png` en `huidig-close.png`, bekijk ze eerst met
view_image): oranje-witte gestreepte windzak, kromt mee met de stroming, witte cirkel-badge met oranje Beaufort-getal
aan de mond. De PO vindt het "nog niet helemaal super mooi".

PO-brief, letterlijk: "iets wat er uit ziet als een nice blend tussen een hand crafted ding zegmaar toen mensen in het
westen nog tijd hadden om mooie dingen te maken plus digitale magicism".

Lees dat als: ambachtelijke, met de hand gemaakte schoonheid (bijv. gegraveerde kaartsymbolen van oude Hollandse
zeekaarten en atlassen, art-nouveau/arts-and-crafts ornament, emaille-bordjes, gietijzeren windwijzers, borduur- of
houtsnedekwaliteit) gecombineerd met iets digitaals/magisch (zachte gloed, lichtsporen, subtiele kleurverlopen,
glans, deeltjes). Het moet een **klein kaartsymbool** blijven: leesbaar op ±28–40 px hoog op een telefoon, richting
en sterkte (1–9 Bft) in één oogopslag, met een getal dat leesbaar is. Het mag ook iets anders dan een windzak zijn
(windvaan/haan, wimpel, veer, banier) zolang windrichting en kracht leesbaar blijven.

## Opdracht
1. Maak **8 verschillende richtingen** (één `image_gen`-call per richting, geen `n`-varianten), elk als één beeld met:
   links een grote close-up van het glyph bij 2, 5 en 8 Bft; rechts een uitsnede van een lichte, rustige kaart van
   Nederland (groen/zandkleurig, zee lichtblauw) met ±12 van die glyphs in verschillende richtingen en sterktes, op
   kaartschaal. Geen tekst behalve de Bft-getallen. Varieer de richtingen echt (bijv. graveerstijl, emaille, gietijzer
   windwijzer, borduur/textiel, art nouveau wimpel, glas/lichtsporen, papier-knipkunst, delfts-blauw), telkens met een
   digitale-magie-laag.
2. Bekijk elk resultaat zelf; als een beeld mislukt (onleesbaar, te druk, verkeerde inhoud), één gerichte herpoging.
3. Kopieer de 8 gekozen beelden naar `.dev/tracks/u106-windzak-concepten/concept-<nr>-<korte-naam>.png` in deze
   worktree en maak één overzichtsblad `overzicht.png` (2×4 raster met de naam onder elk beeld; ImageMagick via
   `nix shell nixpkgs#imagemagick -c magick montage -font "$(fc-match -f '%{file}' 'DejaVu Sans')" -label '%t' ...`).
4. Commit de beelden + `prompts.md` (per concept de exacte prompt) en push:
   `git push origin HEAD:track/u106-windzak-concepten`.
5. Antwoord met de paden, per concept één zin over wat het is, en welke 2 jij het sterkst vindt als kaartsymbool en
   waarom.
