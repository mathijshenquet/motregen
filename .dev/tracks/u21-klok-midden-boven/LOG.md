# U21 — versheidspil midden boven (+ compacte zoekpil, zoekpaneel)

## 2026-09-25 06:10 — start
- Worker: Claude Opus 5.5 (herdr-pane). Branch `track/u21-klok-midden-boven`, fast-forward naar main f748b6e (spec).
- Scope = spec + twee PO-aanvullingen via queue:
  1. Zoekbalk in rust compacte ghost-pil (~32 px, ≤ 240 px, 13 px tekst, icoon/plaats/ster, dunne rand,
     surface 70 %, geen zware schaduw); bij focus groeit hij naar het volle veld (~150 ms). Mobiel ≥ 44 px.
  2. Zoek-popover (suggesties/favorieten) als dekkend paneel; klik buiten sluit en lekt NIET naar de kaart;
     Escape sluit; × in het invoerveld (wist tekst, anders sluit), ≥ 44 px aanraakdoel. Rust-contrast < open.
- Plan: eerst vóór-screenshots (desktop, Pixel 5, 320 px; licht/donker), dan CSS/insets, dan e2e.

## 06:25 — nog twee PO-aanvullingen (queue)
3. About-modal-backdrop terug naar U7-waarde (.42, geen/minimale blur); ronde × en tik-slikken blijven.
4. Zoek-popover visueel AANGESLOTEN op de zoekbalk (één element, gedeelde rand/achtergrond/schaduw,
   geen gat) — twee varianten als screenshot (A: pil vouwt naar beneden open; B: paneel omsluit de pil),
   kiezen + motiveren, PO beslist op zicht. Licht/donker, desktop + Pixel 5.
- Omgeving: devenv-eval moet buiten de sandbox (nix-daemon-socket); probe-servers op 4358/8358.

## 06:30 — vijfde PO-aanvulling (queue): ontwerpbrief klok
- Kaarttijd (scrubber) = hoofdelement, altijd zichtbaar (geen Kaart/Nu-tweedeling); bronaccent in
  regimekleuren (radar grijs / nowcast blauw / model paars) + bronwoord; daaronder gedempt de datatijd
  (radar-scan + leeftijd, bij model "run HH:MM") met statusstip; één rustig element; 2 varianten
  (stip vs linkerrand), kiezen + motiveren. e2e-semantiek bewaren.

## 06:45 — implementatie + keuzes
Vóór-metingen (probe `web/tmp/probe.mjs`, screenshots `web/tmp/shots/voor/`): pil rechtsonder
(desktop 625,655 175×43; Pixel 5 220,423 163×46; 320 px kolomvorm 99×85), zoekbalk 330×36 (desktop) /
319×44 (Pixel 5), UV-chip mobiel op de tweede rij links (12,62 121×38), insetTop 0 (desktop) / 60 (mobiel).

**Versheidspil midden boven.** `left:50%; translateX(-50%)`.
- Desktop: op de eerste rij naast de zoekpil (top 12, verticaal gecentreerd op de 32 px-zoekpil).
  Keuze bij smalle kaart: de pil gaat naar een tweede rij (top 62) via een container query op
  `.map-shell` (< 720 px kaartbreedte = viewport ≲ 1190 px met 470 px zijbalk), i.p.v. de zoekpil te
  krimpen: 240 px is al het PO-maximum en een krimpende plaatsnaam wordt onleesbaar; de rij eronder kost
  alleen ~50 px contain-inset.
- Mobiel: eerste rij is vol (zoekpil 240 + themaknop), dus tweede rij gecentreerd (top safe+64).
  De UV-chip stond precies daar → verplaatst naar linksonder boven het merk (portrait én liggend).
  De < 360 px kolomvorm is weg: naast het merk hoeft de pil niet meer smal.
- Paneel opent gecentreerd onder de pil (8 px), binnen het venster geklemd; als de pil weggescrold is
  (onder 60 % van de hoogte of erboven) bovenaan het venster.
- Insets (U14): `topOverlayInset` neemt de onderrand van de pil (altijd) en van de zoekpil (alleen als
  ≥ halve breedte). Desktop 1280: 59→66 px, 1000 px-venster (tweede rij): 109, Pixel 5 / 320: 118.
  De contain-fit wordt daardoor op telefoons ~12 % kleiner (hoogte-gebonden) — prijs voor Wadden vrij.

**Klok (ontwerpbrief).** Eén knop, twee regels: `[bronaccent] 16:31 nowcast` / `● radar 14:55 · 3 min`
(model: `● run 12:00`). data-source (observations/nowcast/model), data-freshness, `.freshness-age`,
aria-live-status en aria-label (kaarttijd, bron, status, radar-samenvatting) blijven uitleesbaar.
Varianten: linkerrand (default) vs stip (`?klok=stip`). **Keuze: linkerrand** — met een bronstip staan
er twee gekleurde stippen boven elkaar (bron en status) die je moet ontcijferen; de rand scheidt de
twee betekenissen (kleur van de rand = bron, stip = versheid) en leest als één element.

**Zoekpil.** In rust ghost-pil 240×32 (touch 240×44: 42 + rand), 13 px (touch 16 px: iOS zoomt in op
invoertekst < 16 px bij focus — bewuste afwijking van "13 px" op touch), surface 70 %, dunne rand 45 %,
schaduw 0 1px 3px. Open: groeit naar 380 (desktop) / volle rij (mobiel) in 150 ms.
- Popover aangesloten (PO-punt 4), twee varianten: A "vouwt open" (default): het veld is de kop van
  één paneel, lijst direct eronder met alleen een scheidingslijn, één rand/achtergrond/schaduw;
  B "omsluit" (`?zoekpaneel=omsluit`): paneel met 6 px binnenrand, veld als eigen vak erin.
  **Keuze: A** — de rust-pil wordt letterlijk de kop (icoon en plaatsnaam blijven staan), één rand
  i.p.v. rand-in-rand, rustiger; B oogt als een extra laag chrome.
- Paneel dekkend (`--surface`, niet het 96 %-`--surface-raised`: de klokpil schemerde erdoor),
  rand line-strong, schaduw 0 14px 40px.
- Buiten-tik: scrim (fixed, z −1 binnen de zoek-stacking-context, 14 % tint) met preventDefault +
  stopPropagation op pointerdown en click → sluit, bereikt de kaart niet. Escape sluit (hele widget).
  × (Lucide X, 44×44) vervangt de ster zolang het paneel open is: wist tekst, anders sluit. Sluiten
  zonder keuze zet de huidige plaatsnaam terug. Ster opent de naam-editor: focus eerst naar het veld,
  anders klapt het paneel dicht wanneer de ster verdwijnt.
- About-backdrop terug naar .42 zonder blur (PO-punt 3).

Gates tot nu: typecheck 0, component-unit 20/20, e2e freshness+location 16 passed / 5 skipped (EXIT 0).
