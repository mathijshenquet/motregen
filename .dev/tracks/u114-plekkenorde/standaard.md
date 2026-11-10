# Laatste stap vóór de merge: de plekkenorde wordt de standaard voor iedereen (PO 2026-11-10 ~15:00 lokaal)

PO: "Top, merge en deploy alles maar". De orkestrator merget U111, U113 en U114 naar int en rolt daarna uit. Jij maakt
de orde eerst het gedrag zonder `?dev`.

1. **Standaard:** zonder `?dev` is het `plekken=orde` (de provincietrede), `namen=samen`, `windtrede=steden`,
   `dichtheid=midden`, `weergetal=plekken` en `buurland=later`. De `place`-lagen van de basiskaart zijn dan uit.
2. **Knoppen opruimen:** `plekken=nu` (het oude gedrag) blijft één week als terugvaloptie achter `?dev`. `plekken=d` en
   `namen=naast|later` mogen weg; houd wat de code eenvoudiger maakt. Werk `docs/dev-opties.md` bij.
3. **Laden:** de ordetabel (265 kB gzip) mag de eerste regen niet vertragen.
   - Laad hem lui, na de eerste kaartweergave of parallel aan de data. Toon tot hij er is geen namen, of een klein
     ingebakken stel rang 1–2 (de provincie- en hoofdstadplekken). Kies wat er niet springt.
   - Neem hem op in de precache of de runtimecache van de service worker, zodat een tweede bezoek hem meteen heeft.
   - Kan de tabel kleiner? Bijvoorbeeld door rang 5–6 te beperken tot naam, coördinaat, minimale zoom en labelkant, of
     door de minimale zooms vooraf te berekenen en compact op te slaan. Meld de grootte voor en na.
   - Meet de tijd tot de eerste regen (ttfp) voor en na met `?perf` in de rig. Meld het verschil.
4. **Gates:** typecheck, unit, en e2e kaartstijl, windzak, basemap, plekkenorde en focus met `--project desktop`.
   Bekijk zelf een screenshot zonder `?dev`, licht en donker, telefoon en desktop.
5. Commit, push expliciet met `git push origin HEAD:track/u114-plekkenorde`. Laatste bericht: commit, grootte voor en
   na, ttfp voor en na, gates met exit-status. De orkestrator doet daarna de merge; begin daar zelf niet aan.
