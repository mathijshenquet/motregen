# MIP-15 — Verleden bewaren: 24 u historie in tabel en tijdlijn zonder herdownload

Status: draft (PO-idee 2026-09-25, via de U34-sessie)

## Probleem

Het weericoon en de tabel lopen maar ~3 u terug (radar `--history-hours 3`) en de uurvelden
6 u (`--arome-history-hours 6`). Voor die 6 u downloadt de ingest bij elke 3-uurs verversing
een óudere HARMONIE-run opnieuw (~83 MB per keer), terwijl die data niet verandert.

## Voorstel

1. **Het verleden staat vast**: chunks zijn run-gestempeld en onveranderlijk. De ingest houdt
   per uurveld een **historie-index** bij: voor elk verstreken uur de chunk van de run die op
   dat moment de kortste lead had (de "beste analyse"), zonder de run opnieuw op te halen.
   Nieuwe runs vullen alleen de toekomst; de historie groeit door retentie, niet door
   herdownload. Radar: idem, 24 u aan 5-minuutframes bewaren (nu 3 u).
2. **Manifest** krijgt een `history`-sectie per veld: lijst van (uur → chunk, offset), 24 u
   terug, plus de retentie in `docs/contract.md`. Oude chunks worden pas verwijderd als geen
   manifestvenster ze meer noemt (24 u + één run).
3. **Client**: tabel en tijdlijn tonen 24 u terug (nu 6 u); de historie laadt lazy zoals nu
   (U23: pas bij omhoog scrollen / historie openen), met dezelfde Range-vereniging als
   `uv_clear` (U15) zodat de koude start niet groeit.
4. **Meting**: ingest-bytes per dag vóór/na (verwacht −8×83 MB), schijfgebruik prod (+ ~1 dag
   chunks), client passieve bytes ongewijzigd.

## Kanttekeningen

- Historie uit "beste lead" is een mix van runs; bij een naad tussen runs kan een uurveld een
  stapje maken. Alternatief: altijd de +0-analyse van de run van dat uur (consistent, maar de
  +0 mist soms). Keuze in de spec, meten op een dag.
- Radar-historie van 24 u is 288 frames per dag; bytes zijn klein (mrf), maar de manifest-
  lengte groeit; houd de manifest-omvang onder de 20 kB (nu ~?) of splits in een aparte
  `history.json`.

## Uitvoering

Track U40 (ingest + contract + client), na U36/U37-merges. Adoptie: PO.
