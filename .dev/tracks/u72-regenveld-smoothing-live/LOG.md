# U72 — live-pane: smoothing/upsampling van het regenveld (opus-5.5)

Append-only. Spec: `.dev/specs/track-u72-regenveld-smoothing-live.md`. Preview: http://ageq-dev2:4320/?dev

## 2026-10-09 14:25 — ingelezen; twee bevindingen die de spec bijstellen
- De shader stond NIET op blokken: `rainSample` mengt zelf de vier buurcellen (texelFetch, vanwege de 255 =
  geen-data-byte). "Nu" is dus al bilineair op het gedeelde raster. `gl.NEAREST` op de textuur is alleen de
  opslag; de filtering gebeurt in de shader.
- De blokken van HARMONIE zitten in de DATA. Alle regenbronnen staan op hetzelfde gedeelde raster (1250×1350,
  1 km in Web Mercator ≈ 0,62 km op de grond; de vier chunks delen de rasterhash `g610bb747061d5247`), en de
  ingest zet elke bron er met dichtste-buur op (`crates/ingest/src/grid.rs`, `nearest_index`). AROME is
  0,029° × 0,018° ≈ 2 km = ~3,25 rastercel breed; radar/nowcast/blend ~1 km = ~1,6 cel. Bilineair op het fijne
  raster verzacht alleen de rand van elk blok. Een blur "in rastereenheden" van het gedeelde raster doet op
  HARMONIE dus juist minder; de kernen moeten in BRONcellen rekenen.
- De blend (`seamless`, +2…+6 u) heeft een bronraster van ~1 km en hoort bij de groep radar/nowcast. HARMONIE
  begint in de tijdlijn pas ruim 6 uur vooruit; "+6 u" uit de spec is nog blend. Beelden daarom op +9 u en +23 u.

## 14:28 — gebouwd
- `web/src/core/rain-layer.ts`: per frame een kern (`u_left_kernel`/`u_right_kernel` + breedte van de broncel);
  de standaard `bilinear` loopt door de ongewijzigde `rainSample`. Nieuw: `nearestSample` en `sourceSample`
  (knopen op een rooster met de maat van één broncel, elk één texelFetch; gewogen op de byte vóór de paletlookup).
  Tijdmenging: `u_blend_eased`, en de warp-kap als uniform in plaats van constante.
- `web/src/core/rain-smoothing.ts`: de standen, de opslagsleutels, bron → groep, broncelbreedtes.
- `?dev` › Kaart: "Regenveld radar/nowcast", "Regenveld HARMONIE", "Tijdmenging HARMONIE". Zonder `?dev`
  wordt er niets gezet: het product tekent exact als voorheen.

| stand | wat | texels per pixel (eerste versie, in de tekenshader) |
| --- | --- | --- |
| blokken | dichtste rastercel (referentie: zo ziet de data eruit) | 1 |
| bilineair | NU: vier rastercellen | 4 |
| bronlineair | lineair tussen 2×2 broncellen | 4 |
| glad | bicubisch (Catmull-Rom) over 4×4 broncellen; gaat door de bronwaarden, vervaagt niet | 16 |
| blur 3×3 | klokvormige weging over 3×3 broncellen | 9 |
| blur 5×5 | idem over 5×5 broncellen | 25 |

## 14:35 — beelden (zelf bekeken), `beelden/{nl,stad}-{radar,harmonie}-{dag,nacht,nacht-vast}-{1280,390}.webp`
Rig `rig/field-shots.ts` + `rig/run-field-shots.sh` (kopieer naar `web/tmp/u72/`, draai vanuit `web/`): één
pagina per beeld, de stand wisselt via de dev-knop, dus elke cel is hetzelfde frame en dezelfde uitsnede.
`nl` = startbeeld, `stad` = zoom 9 rond de Veluwe. Radar = nu (14:30, bronnen rtcor/nowcast); HARMONIE nacht =
+9 u (23:30), dag = +23 u (morgen 13:30), bron per beeld gecontroleerd via `data-rain-sources`. `nacht-vast` =
donker thema met Expressief uit (radar heeft vanmiddag geen nachttijd). 16 beelden, 0 mislukt.
