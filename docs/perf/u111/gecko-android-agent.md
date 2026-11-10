# Opdracht voor een agent op de macbook: vier Firefox-profielen van de Android-telefoon (ronde 3)

> **Stand 2026-11-10 (na de SurfaceFlinger-meting):** `zakpaden=bitmap`, `zakgolf=regelmatig` en `zakpaden=zuinig`
> bestaan niet meer; die links tonen nu de basis. Ter vergelijking blijven `zakclip=aan` en `domrust=uit` (tot
> 2026-11-24). Uitslag: `README.md`, *Telefoonmeting met SurfaceFlinger*.

Je draait op de macbook van de PO (Mathijs). Zijn Android-telefoon (Pixel 9, Firefox 159, pakket `org.mozilla.firefox`)
hangt met USB aan de macbook; USB-foutopsporing staat aan op de telefoon en in Firefox, en volgens de PO staat de
profiler in desktop-Firefox klaar (`about:debugging`, telefoon verbonden). De PO wil dit niet zelf doen: werk het
zelfstandig af en vraag hem alleen iets als je echt vastzit.

Doel: vier Gecko-profielen van de windmodus van motregen, elk ~15 s tijdens afspelen, zodat de orkestrator op
ageq-dev2 de draden CanvasRenderer, GeckoMain, Renderer en Compositor kan lezen. Achtergrond:
`docs/perf/u111/README.md` (zelfde map). Ronde 1 en 2 (`android-1-…`, `android-r2-…`) zijn al binnen. In ronde 3 is
het gat rond de badge zonder `clip()` de standaard; `zakclip=aan` is de oude manier ter vergelijking en
`zakpaden=bitmap` de voorgetekende zakken (met de exacte golf, en met `zakgolf=regelmatig` een regelmatiger golf die de
cache veel vaker raakt). Alle vier met alle lagen aan.

## De vier opnames

| # | bestand | URL |
| --- | --- | --- |
| 1 | `android-r3-basis.json.gz` | `http://ageq-dev2:4312/?perf=1&modus=wind&dev` |
| 2 | `android-r3-zakclip-aan.json.gz` | `http://ageq-dev2:4312/?perf=1&modus=wind&dev&zakclip=aan` |
| 3 | `android-r3-zakpaden-bitmap.json.gz` | `http://ageq-dev2:4312/?perf=1&modus=wind&dev&zakpaden=bitmap` |
| 4 | `android-r3-zakpaden-bitmap-regelmatig.json.gz` | `http://ageq-dev2:4312/?perf=1&modus=wind&dev&zakpaden=bitmap&zakgolf=regelmatig` |

Zo nodig nog `android-r3-zakpaden-zuinig.json.gz` met `&zakpaden=zuinig`. Meet ze om en om (1, 2, 3, 4, en zo nodig
nog eens 1): de telefoon wordt warm, en dat drukt latere opnames. Meet daarnaast de getoonde frames zoals in je reeks
zonder profiler (SurfaceFlinger), met dezelfde links zonder `perf=1&`: daarop wordt beslist. De fps in de app-HUD
heet nu "rAF/s"; dat zijn geen getoonde frames.

`ageq-dev2` is een tailnet-naam; de telefoon zit op tailscale en kan hem bereiken.

## Per opname

1. Open de URL op de telefoon. Met adb, zonder de PO:
   `adb shell am start -a android.intent.action.VIEW -d '<URL>' org.mozilla.firefox`
   Zet de URL tussen enkele quotes, de `&` moet heel aankomen. Controleer met een screenshot
   (`adb exec-out screencap -p > shot.png`, zelf bekijken) dat de windkaart laadt en de film afspeelt. Doet hij dat
   niet vanzelf, tik dan op de afspeelknop onderin (`adb shell input tap X Y`, coördinaten uit het screenshot).
2. In desktop-Firefox, op de apparaatpagina van de telefoon in `about:debugging`: *Prestaties profileren*.
   Preset **Graphics**, interval 1 ms. *Opname starten*, wacht 15 s, *Opname vastleggen*.
3. De Firefox Profiler opent in een tab. **Niet uploaden.** Kies menu › *Downloaden* en sla op als het bestand uit
   de tabel.
4. Sluit het profiler-tabblad en ga naar de volgende opname. Laat de telefoon tussen opnames ~5 s rusten.

Klikken in desktop-Firefox: gebruik computer use als je die hebt. Heb je die niet, zeg het de PO in één zin en
vraag hem alleen de knoppen van stap 2 en 3 te bedienen terwijl jij de URL's opent en de bestanden verwerkt.

## Terugplaatsen

```sh
scp ~/Downloads/android-r3-*.json.gz ageq-dev2:motregen-profiles/
ssh ageq-dev2 ls -l motregen-profiles
```

Controleer dat er vier `android-r3-`bestanden staan die elk groter zijn dan 100 kB. Meld daarna de PO de vier bestandsnamen en
hun groottes, en alles wat afweek: een opname die niet afspeelde, een foutmelding of een andere preset.

## Zonder profiler: de eigen opname van de app in een lus

`?perf=start&auto` (of `&auto=<naam>`) laat de app zelf 30 s opnemen vanaf het laden en de opname daarna zonder
tikken naar de profielsink op ageq-dev2 sturen (dezelfde POST als de knop Versturen). Zo kan een lus met alleen adb
varianten meten, bijvoorbeeld:

```sh
for variant in '' '&zakclip=aan' '&zakpaden=bitmap' '&zakpaden=bitmap&zakgolf=regelmatig'; do
  adb shell am start -a android.intent.action.VIEW -d "'http://ageq-dev2:4312/?perf=start&auto&modus=wind&dev$variant'" org.mozilla.firefox
  sleep 45
done
```

De sink schrijft naar `~/motregen-profiles/` op ageq-dev2; de variant staat in de metadata (`metadata.label`) en, als
de sink op de nieuwe versie van `web/scripts/prof-sink.ts` draait, ook in de bestandsnaam. Deze opnames hebben de
UserTiming-fasen van de app (tempo en gaten), geen stacks van Firefox zelf.

## Dezelfde scène in elke browser: `camera=`

`?dev&camera=<lon>,<lat>,<zoom>` (bijvoorbeeld `&camera=5.29,52.13,7`, midden van het land) zet de kaart bij het
laden vast op die plek en zoom. De opgeslagen kaartstand en de locatiefix tellen dan niet mee; de pagina centreert
niet op de pin en schrijft niets naar de opslag. Zet hem in elke link van een vergelijking tussen Firefox en Chrome,
of tussen varianten. Voorbeeld:
`http://ageq-dev2:4312/?modus=wind&dev&camera=5.29,52.13,7&domrust=uit`.

## Grenzen

- Verander niets aan de telefoon behalve de tabbladen in Firefox, en niets aan ageq-dev2 buiten `~/motregen-profiles/`.
- Upload geen profiel naar profiler.firefox.com; het bevat URL's van de dev-host.
