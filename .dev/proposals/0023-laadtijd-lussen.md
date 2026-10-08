# MIP-23 — Twee laadtijd-lussen: mobiel (ttfp/ttfh) en desktop (waterval + kaart-placeholder)

Status: draft · 2026-10-08 · PO-akkoord in chat ("verder akkoord", beide met gpt-6.1-sol)

## Doel
De lat uit MIP-19 §De lat (spelende tijdlijn op mobiel ≤ Buienradar) halen én op desktop de
achterstand wegwerken, met twee autonome lussen onder het PO-mandaat van 2026-10-07: wat niet
waarneembaar is gaat door met vóór/ná per commit; wat zichtbaar is wordt een stap met de PO.

## Prioriteit (PO 2026-10-08 08:50)
`ttfr` voorop, dan `ttfp`; `ttfh`/blank-visible secundair zolang er ná de start geen grote lange
frames meer zijn (LoAF ná ttfp is een bewaker, geen doel). Geldt voor beide tracks.

## Track A — mobiel (U63)
Stand (PO-telefoon koud): ttfp 3,65 s, eerste regenframe 1,9–2,5 s, ttfh 5,5 s. Kandidaten:
1. manifest + eerste regen-Range als preload/Early Hints (nu pas op ~0,8 s gevraagd);
2. decode-worker en WebGL warm tijdens de stijl-fetch; eerste frame vóór de uurvelden uploaden;
3. ttfh: regen nu ± 1 u eerst over de hele hemel, wolken/uurvelden erna;
4. resterende lange frames tijdens laden (isoline-traces bij Wind, wind-trail per tik, uploads spreiden);
5. warme start via SW-precache (stijl, fonts, PMTiles-header).
Metrics: ttfp, ttfr, ttfh, blank-visible-oppervlak, LoAF eerste 12 s, decodes/wire; gate `--compare`
op `po-android`; Buienradar-referentiescenario; PO-opnames zijn de waarheid.

## Track B — desktop (U64)
Stand (MacBook): first paint 0,40 s, LCP 0,47 s, tweede regenbeeld 1,86 s (Buienradar 1,82 s); wat
daarna tot "speelt" komt is ongemeten. Eerst een eerlijke waterval van de koude start; dan:
1. directe NL-placeholder onder de kaart tot de eerste tegels (inline SVG van enkele kB, óf de eigen
   z4/z5-PMTiles-tegel inline), overgang zonder flits — zichtbaar, dus met screenshot naar de PO;
2. preload/Early Hints voor stijl, fonts, manifest, eerste Range; stijl-JSON inline;
3. bundel: niet-kritische modules lazy (tabel, profielmodus, still, wind-tuning), meten in kB/ms;
4. warme start: app-shell en kaartassets in de SW.
Metrics: desktop rig koud/warm (ttfr, ttfp, LCP), waterval per iteratie, MacBook-traces als referentie.

## Decision
(open — in uitvoering op PO-akkoord in chat)

## Aanvulling (PO 2026-10-08 13:30): warm is een volwaardig scenario
Beide lussen meten en optimaliseren naast koud ook WARM (tweede bezoek in een nieuwe pagina-context met
gevulde HTTP- en SW-cache, geen in-memory staat), en rapporteren koud en warm altijd samen. Aanleiding:
de laatste rig-cijfers (docs/perf.md) tonen desktop warm ttfr 1,43 s tegen koud 1,20 s en mobile-4g
warm 2,95 s; warm hoort duidelijk onder koud én onder Buienradar warm te liggen. Eerste stap in beide
lussen: uitzoeken wat warm nog over het netwerk of de hoofddraad gaat dat niet hoeft (SW-revalidatie,
manifest, shadercompilatie in een verse context, PMTiles-header, plaatsenlijst).
