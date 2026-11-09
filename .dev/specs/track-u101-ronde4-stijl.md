# U101 ronde 4 — windglyph-stijlvarianten in SVG/canvas (PO 2026-11-09)

PO: de windzakken zijn "nog niet helemaal super mooi". Brief: "een nice blend tussen een hand crafted ding, toen
mensen in het westen nog tijd hadden om mooie dingen te maken, plus digitale magicism". Parallel maakt een
Codex-worker (U106) bitmap-moodboards; jij maakt **echt werkende varianten** op de kaart.

Maak 4–5 stijlvarianten achter `?dev&zakstijl=<naam>` (docs/dev-opties.md, eigenaar U101, vervalt 2026-11-23),
allemaal met de bestaande mechaniek (tween, kromming, trilling, badge aan de mond, ankers buiten namen):
- `gravure` — fijne lijnarcering/hatching als op oude Hollandse zeekaarten, inkt + een warme accentkleur.
- `emaille` — glanzende emaille-bordjeskwaliteit: dieporanje en crème, dunne gouden/koperen rand, subtiele highlight.
- `windwijzer` — gietijzeren/koperen windvaan-silhouet (wimpel of haan-achtig) met verdigris-tint.
- `wimpel` — art-nouveau banier/wimpel met sierlijke golf en een ornamentale knoop aan de mast.
- `glans` — huidige zak maar met "digitale magie": zachte gloed, lichtspoor achter de staart dat met de wind meegaat.
Mag elk een subtiele digitale laag hebben (gloed/lichtspoor) zolang het rustig blijft. Leesbaarheid eerst: richting
en Bft in één oogopslag op de telefoon (±28–40 px), getal in de badge leesbaar, licht én donker kaartthema.

Lever een vergelijkingsblad (telefoon + close-up per variant, plus de huidige) en een kort clipje per variant
(afspelen, harde wind via windfactor). Alleen de app; bot/Rust pas na de PO-keuze. Gerichte tests. Commit/push zoals
eerder. Wacht binnen je turn op eigen taken.
