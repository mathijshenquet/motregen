# MIP-34 — Luchtkaart: licht en sfeer op de grond

Status: draft · 2026-10-11 · auteur: PM (sol)

## Het probleem

De PO vindt de wolkenkaart weinig informatief en lelijk: een laagfrequent veld dat de kaart wit maakt en de sfeer buiten onvoldoende weergeeft. De huidige kaart zet uitsluitend totale bewolking (`cloud_frac`) om in dekking van één sluierkleur. Overdag is die bijna wit, maximaal 0,55 dekkend; 's nachts grijsblauw, maximaal 0,30. De vulling heeft geen lijnen of labels en wordt ruimtelijk en in de tijd glad geïnterpoleerd. Veel bewolking maakt dus altijd hetzelfde soort waas, ongeacht de hoeveelheid licht eronder.

Op de echte dev-app zelf bekeken: de dagkaart verliest contrast en straat-/plaatsnamen verbleken; de nachtkaart toont grote grijsblauwe vlekken. Het is een modelveld, geen willekeurig gegenereerde ruis, maar het leest voor de gebruiker nauwelijks als weer.

## Eerder werk

MIP-14/U34 introduceerden de bewolkingssluier. MIP-24/U62 bepaalden de dag-/nachtkleuren en regenmenging in Lucht. MIP-18/U47 gebruiken voor de grafiek al de lichtfactor uit HARMONIE-straling en een heldere-hemelreferentie, met een schatting uit lage/midden/hoge bewolking als terugval. Dat werk is beschikbaar in `uv.ts` (`cloudModification`, met correctie voor uurmiddelen) en `cloud-section.ts` (`layerTransmission`, `skyDarkness`). De kaart gebruikt deze lichtfactor nog niet.

Het manifest bevat al `radiation`, `cloud_low`, `cloud_mid`, `cloud_high` en `cloud_frac`. Hiervoor is geen nieuwe databron of ingest nodig; volledige kaartvelden moeten wel op aanvraag geladen en op dezelfde geldigheidstijd uitgelijnd worden.

## Aanbeveling

Maak Lucht een kaart van **licht en bewolking**, met dezelfde betekenis als de hemel in de grafiek.

1. **Licht stuurt de dagtint.** Bereken per broncel de bestaande lichtfactor uit straling tegenover de heldere-hemelreferentie voor die plek en dat modeluur. Hergebruik de behandeling van uurmiddelen; deel niet door de momentane zonnestand. Pas de bestaande perceptuele schaal toe. Zonder bruikbare straling dienen de drie wolkenlagen als schatting; totale bewolking is de laatste terugval. Ontbrekende data krijgt geen verzonnen helder of somber resultaat.
2. **De kaart houdt contrast.** Een lichte situatie houdt een heldere kaart met een subtiele zonnige tint. Gedempt licht wordt koeler en wat grijzer; weinig licht wordt loodgrijs. De verschillen komen uit het regionale veld. Vervang de steeds wittere alfa-sluier door een beperkte tint/verdonkering die plaatsnamen en geografie leesbaar houdt. Kleuren en sterkte worden in de echte dev-app gekozen.
3. **Nacht en schemer sluiten aan.** Zonnestand blijft de basis. Bij nacht wordt nul zonnestraling niet als zware bewolking gelezen: gebruik daar de wolkenlagen voor een ingetogen verschil tussen open en gesloten hemel. Laat licht- en nachttint aansluiten bij grafiek en kaartklok.
4. **De betekenis is zichtbaar.** Een kleine legenda `helder · gedempt · somber` beschrijft de dagtinten. De wolkendoorsnede blijft de plaats om laag/midden/hoog te lezen. Modeluurvelden tonen regionale verschillen, geen afzonderlijke wolken of exacte zonmomenten; de lichtfactor blijft een modelschatting van de sfeer.

## Alternatieven

Alleen de witte sluier zwakker maken helpt de leesbaarheid, maar houdt dezelfde beperkte betekenis. Een kaart vol getekende wolken zou meer structuur tonen, terwijl onze uurvelden de positie en vorm van afzonderlijke wolken niet leveren. Daarom adviseer ik eerst de lichtkaart.

## Plan na akkoord

1. Eén proef in de bestaande HMR-dev-app, op dezelfde data en met een vergelijking met de huidige sluier. Alleen Lucht verandert. Bestaande regenpresentatie meenemen bij de beoordeling, omdat die nu met de witte sluier mengt.
2. Zelf zonnige, gedempte en sombere daguren, schemer en nacht op desktop en mobiel bekijken. De PO kiest tint en sterkte live. Typecheck tijdens de iteratie; geen volledige e2e-gate per kleurstap.
3. Na afronding: relevante tests op lichtafleiding, ontbrekende data en nacht; typecheck/unit/build en gerichte desktop-gate. Controleer extra datavraag en afspeelkosten. Merge/uitrol pas na die gate.

## Open vraag

1. Is de lichtkaart, gericht op de sfeer op de grond, de gewenste eerste proef? Aanbeveling: ja, voortbouwen op MIP-18.

## Besluit

Nog niet aangenomen. De huidige dev-app en productiekaart zijn ongewijzigd.

## Changelog

- 2026-10-11: PO-feedback onderzocht, dag-/nachtkaart zelf bekeken; voorstel opgesteld. Implementatie volgt na de richtingkeuze.
