# Opdracht voor een agent op de macbook: vier Firefox-profielen van de Android-telefoon

Je draait op de macbook van de PO (Mathijs). Zijn Android-telefoon (Pixel 9, Firefox 159, pakket `org.mozilla.firefox`)
hangt met USB aan de macbook; USB-foutopsporing staat aan op de telefoon en in Firefox, en volgens de PO staat de
profiler in desktop-Firefox klaar (`about:debugging`, telefoon verbonden). De PO wil dit niet zelf doen: werk het
zelfstandig af en vraag hem alleen iets als je echt vastzit.

Doel: vier Gecko-profielen van de windmodus van motregen, elk ~15 s tijdens afspelen, zodat de orkestrator op
ageq-dev2 de draden Renderer en Compositor kan lezen. Achtergrond: `docs/perf/u111/README.md` (zelfde map).

## De vier opnames

| # | bestand | URL |
| --- | --- | --- |
| 1 | `android-1-alles.json.gz` | `http://ageq-dev2:4312/?perf=1&modus=wind&dev` |
| 2 | `android-2-zakken.json.gz` | `http://ageq-dev2:4312/?perf=1&modus=wind&dev&deeltjes=uit&regen=uit&isolijnen=uit` |
| 3 | `android-3-isolijnen.json.gz` | `http://ageq-dev2:4312/?perf=1&modus=wind&dev&deeltjes=uit&regen=uit&zakken=uit` |
| 4 | `android-4-kaart.json.gz` | `http://ageq-dev2:4312/?perf=1&modus=wind&dev&deeltjes=uit&regen=uit&zakken=uit&isolijnen=uit` |

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
scp ~/Downloads/android-*.json.gz ageq-dev2:motregen-profiles/
ssh ageq-dev2 ls -l motregen-profiles
```

Controleer dat er vier bestanden staan die elk groter zijn dan 100 kB. Meld daarna de PO de vier bestandsnamen en
hun groottes, en alles wat afweek: een opname die niet afspeelde, een foutmelding of een andere preset.

## Grenzen

- Verander niets aan de telefoon behalve de tabbladen in Firefox, en niets aan ageq-dev2 buiten `~/motregen-profiles/`.
- Upload geen profiel naar profiler.firefox.com; het bevat URL's van de dev-host.
