#!/usr/bin/env bash
# U108 `diagram`: een eigen, weergerichte basiskaart. Water, bos (binair) en kernen worden per zoom gegeneraliseerd met
# een rasterfilter: binair rasteren op SS× de doelresolutie, Gauss-vervagen met σ (px van die zoom), de contour op 50 %
# terug naar vlakken, topologiebehoudend vereenvoudigen op 0,3 px en delen < AMIN px² weg. Een vervaagde contour heeft
# geen stekels; vormen smaller dan ~1,5σ (sloten) verdwijnen, grotere houden hun oppervlak. Rivieren komen als lijnen
# (rivers.sh), plaatsen en grenzen ongewijzigd uit het huidige archief.
# Bron: Geofabrik-extracten in $MOTREGEN_DIAGRAM_SOURCES (standaard tmp/basemap/water-src/*.osm.pbf).
# Gebruik: bash tools/basemap/diagram.sh → tools/basemap/tiles/nl-<hash>.pmtiles + manifest-diagram.json en -diagram-wegen.json
set -euo pipefail
cd "$(dirname "$0")/../.."
base_scratch="${MOTREGEN_BASEMAP_SCRATCH:-tmp/basemap}"
scratch="$base_scratch/diagram"
sources="${MOTREGEN_DIAGRAM_SOURCES:-$base_scratch/water-src}"
mkdir -p "$scratch"
base="tools/basemap/tiles/$(jq -r .filename tools/basemap/tiles/manifest-nu.json)"
# σ en kleinste deel per klasse (px van de zoom); vastgesteld met diagram-metric.mts, zie MIP-42.
# Per klasse: morfologie (glad | open:R | sluit:R, R in px van de zoom) en daarna effenen met σ (px).
# Water wordt geopend: sloten en smalle rivierstukken verdwijnen (de rivierlijnen dekken ze), land krimpt niet.
# Openen pas vanaf z7: op lage zoom zijn sloten al onder de rasterresolutie, en smal water als de Westerschelde of het
# Haringvliet (±1 px op z5) is juist wat Zeeland herkenbaar maakt. Formaat: zoom:modus, gescheiden door spaties.
modes_water="${MOTREGEN_DIAGRAM_MODES_WATER:-4:glad 5:glad 6:glad 7:open:0.25 8:open:0.45 9:open:0.45 10:open:0.45}"; sigma_water="${MOTREGEN_DIAGRAM_SIGMA_WATER:-0.15}"
modes_wood="${MOTREGEN_DIAGRAM_MODES_WOOD:-6:glad 7:glad 8:glad 9:glad 10:glad}"; sigma_wood="${MOTREGEN_DIAGRAM_SIGMA_WOOD:-0.8}"
# Kernen op lage zoom sluiten: OSM-woonwijken liggen als losse vlakken tussen wegen; gesloten worden ze één kern.
modes_urban="${MOTREGEN_DIAGRAM_MODES_URBAN:-4:sluit:0.5 5:sluit:0.5 6:sluit:0.4 7:sluit:0.3 8:glad 9:glad 10:glad}"; sigma_urban="${MOTREGEN_DIAGRAM_SIGMA_URBAN:-0.6}"
amin=2

if [ ! -f "$scratch/source.gpkg" ]; then
  if [ ! -f "$scratch/region.geojsonl" ]; then
  for pbf in "$sources"/*.osm.pbf; do
    osmium tags-filter "$pbf" wr/natural=water,wood wr/waterway=riverbank wr/landuse=reservoir,basin,forest,residential,commercial,industrial,retail \
      w/highway=motorway -o "$scratch/filtered-$(basename "$pbf")" --overwrite
  done
  osmium merge "$scratch"/filtered-*.osm.pbf -o "$scratch/merged.osm.pbf" --overwrite
  # Zelfde landbedekkingskader als build.sh ([0,49,10,55]): bij contain-zoom staan ook BE en DE in beeld.
  osmium extract --bbox 0,49,10,55 --strategy smart "$scratch/merged.osm.pbf" -o "$scratch/region.osm.pbf" --overwrite
  osmium export "$scratch/region.osm.pbf" --geometry-types polygon,linestring -f geojsonseq --output "$scratch/region.geojsonl" --overwrite
  fi
  rm -f "$scratch/source.gpkg"
  layer() {  # naam, geometrietype, where
    ogr2ogr -f GPKG $([ -f "$scratch/source.gpkg" ] && echo -update) "$scratch/source.gpkg" "$scratch/region.geojsonl" -nln "$1" \
      -t_srs EPSG:3857 -nlt "$2" -where "$3" -select natural,waterway,landuse,highway
  }
  layer water MULTIPOLYGON "OGR_GEOMETRY IN ('POLYGON','MULTIPOLYGON') AND (\"natural\" = 'water' OR waterway = 'riverbank' OR landuse IN ('reservoir', 'basin'))"
  ogr2ogr -f GPKG -update -append "$scratch/source.gpkg" /vsigzip/tools/basemap/ocean.geojson.gz -nln water -t_srs EPSG:3857 -nlt MULTIPOLYGON
  layer wood MULTIPOLYGON "OGR_GEOMETRY IN ('POLYGON','MULTIPOLYGON') AND (\"natural\" = 'wood' OR landuse = 'forest')"
  layer urban MULTIPOLYGON "OGR_GEOMETRY IN ('POLYGON','MULTIPOLYGON') AND landuse IN ('residential', 'commercial', 'industrial', 'retail')"
  layer motorway MULTILINESTRING "OGR_GEOMETRY IN ('LINESTRING','MULTILINESTRING') AND highway = 'motorway'"
fi

# Grote scheepvaartkanalen als lijn (zoals rivieren rang 2): het openen van water breekt een kanaal van ±1 px breed
# (Amsterdam-Rijnkanaal op z10) anders in brokken. Een vaste lijst, zoals de hoofdrivieren in rivers.mts: op lengte
# selecteren haalt ook ringvaarten en sieltiefs binnen.
canals="Amsterdam-Rijnkanaal|Noordzeekanaal|Lekkanaal|Twentekanaal|Julianakanaal|Maas-Waalkanaal|Wilhelminakanaal|Zuid-Willemsvaart|\
Noordhollandsch Kanaal|Prinses Margrietkanaal|Van Starkenborghkanaal|Van Harinxmakanaal|Kanaal door Walcheren|Kanaal door Zuid-Beveland|\
Kanaal Gent-Terneuzen|Schelde-Rijnkanaal|Kanaal Almelo-De Haandrik|Kanaal Wessem-Nederweert|Hartelkanaal|Calandkanaal|Albertkanaal|\
Dortmund-Ems-Kanal|Wesel-Datteln-Kanal|Rhein-Herne-Kanal|Küstenkanal|Mittellandkanal"
if [ ! -f "$scratch/canal.geojsonl" ]; then
  for pbf in "$sources"/*.osm.pbf; do
    osmium tags-filter "$pbf" w/waterway=canal -o "$scratch/canal-$(basename "$pbf")" --overwrite
  done
  osmium merge "$scratch"/canal-*.osm.pbf -o "$scratch/canal-merged.osm.pbf" --overwrite
  osmium export "$scratch/canal-merged.osm.pbf" --geometry-types linestring -f geojsonseq --output "$scratch/canal.geojsonl" --overwrite
fi
ogr2ogr -f GPKG -update -overwrite "$scratch/source.gpkg" "$scratch/canal.geojsonl" -nln canal -t_srs EPSG:3857 -nlt MULTILINESTRING \
  -lco GEOMETRY_NAME=geom -dialect SQLite \
  -sql "SELECT ST_LineMerge(ST_Union(geometry)) AS geometry, name FROM \"canal\" WHERE name IN ('$(sed "s/|/','/g" <<< "$canals")') GROUP BY name"
bash tools/basemap/rivers.sh
for rank in 1 2 3; do
  ogr2ogr -f GPKG -update -overwrite "$scratch/source.gpkg" "$base_scratch/rivers/rivers.gpkg" "rank$rank" -nln "river$rank"
done

# Kader in EPSG:3857. z4–7: het kustwaterkader van het archief [-5,48,13,57] (contain-zoom toont ruimte buiten de
# app-grenzen, en de z4-starttegels liggen daar). z8–10: de app-grenzen (2,31–7,42 °O, 50,33–53,68 °N) plus 0,3°,
# omdat de app het beeld daar binnen de grenzen houdt.
frame() { printf '%s\n' "$1 $2" "$3 $4" | gdaltransform -s_srs EPSG:4326 -t_srs EPSG:3857 -output_xy | tr '\n' ' '; }
wide_frame="$(frame -5 48 13 57)"
app_frame="$(frame 2.0108 50.0256 7.7192 53.9844)"
export scratch wide_frame app_frame sigma_water sigma_wood sigma_urban modes_water modes_wood modes_urban amin
# Eén zoom × klasse: rasteren, vervagen, contour, vereenvoudigen, kleine delen weg → part-z<zoom>-<klasse>.gpkg.
generalize() {
  local zoom="$1" class="$2"
  local px ss resolution left top right bottom sigma_var sigma modes_var mode work part
  px="$(awk -v z="$zoom" 'BEGIN { print 40075016.6856 / (256 * 2^z) }')"
  ss=4; [ "$zoom" -ge 9 ] && ss=2
  resolution="$(awk -v p="$px" -v s="$ss" 'BEGIN { printf "%.6f", p / s }')"
  local min_x min_y max_x max_y
  if [ "$zoom" -le 7 ]; then read -r min_x min_y max_x max_y <<< "$wide_frame"; else read -r min_x min_y max_x max_y <<< "$app_frame"; fi
  read -r left top right bottom <<< "$(awk -v a="$min_x" -v b="$max_y" -v c="$max_x" -v d="$min_y" -v p="$px" \
    'BEGIN { printf "%.6f %.6f %.6f %.6f\n", int(a / p - 1) * p, int(b / p + 1) * p, int(c / p + 1) * p, int(d / p - 1) * p }')"
  sigma_var="sigma_$class"; sigma="${!sigma_var}"
  modes_var="modes_$class"
  mode="$(tr ' ' '\n' <<< "${!modes_var}" | awk -F: -v z="$zoom" '$1 == z { sub(/^[0-9]+:/, ""); print }')"
  mode="${mode:-glad}"
  local mode_label="$mode"
  # R van px van de zoom naar rasterpixels.
  case "$mode" in *:*) mode="${mode%%:*}:$(awk -v r="${mode#*:}" -v k="$ss" 'BEGIN { print r * k }')" ;; esac
  work="$scratch/z$zoom-$class"; part="$scratch/part-z$zoom-$class.gpkg"
  gdal_rasterize -q -l "$class" -burn 255 -ot Byte -init 0 -tr "$resolution" "$resolution" -te "$left" "$bottom" "$right" "$top" \
    -co COMPRESS=DEFLATE "$scratch/source.gpkg" "$work.tif"
  (cd web && node --import tsx ../tools/basemap/blur.mts "../$work.tif" "../$work.png" "$(awk -v s="$sigma" -v k="$ss" 'BEGIN { print s * k }')" "$left" "$top" "$resolution" "$mode")
  rm -f "$part" "$work"-block-*
  # gdal_contour -p is enkeldraads en traag op grote multipolygonen (z10: 25 min): per blok van 2048 px parallel. De
  # naden liggen recht op de bloksgrens; zonder vlakrand zijn ze onzichtbaar.
  local width height
  read -r width height <<< "$(gdalinfo "$work.png" | awk '/^Size is/ { gsub(",", ""); print $3, $4 }')"
  for ((block_y = 0; block_y < height; block_y += 2048)); do for ((block_x = 0; block_x < width; block_x += 2048)); do
    echo "$block_x $block_y $(( width - block_x < 2048 ? width - block_x : 2048 )) $(( height - block_y < 2048 ? height - block_y : 2048 ))"
  done; done | xargs -P 4 -L 1 bash -c '
    block="'"$work"'-block-$0-$1"
    gdal_translate -q -srcwin "$0" "$1" "$2" "$3" "'"$work"'.png" "$block.tif"
    # Expliciete niveaus rond 0–255: met -i of één -fl laat gdal_contour -p het bovenste plateau (open zee) weg.
    gdal_contour -q -p -fl -1 127.5 300 -amin lo -amax hi "$block.tif" "$block.gpkg" -nln contour'
  for block in "$work"-block-*.gpkg; do
    ogr2ogr -f GPKG $([ -f "$part" ] && echo -append) "$part" "$block" -nln "z$zoom$class" -a_srs EPSG:3857 -nlt MULTIPOLYGON -explodecollections -dialect SQLite \
      -sql "SELECT ST_SimplifyPreserveTopology(geom, $px * $tolerance) AS geom, '$class' AS class FROM contour WHERE lo = 127.5"
  done
  ogrinfo -q "$part" -dialect SQLite -sql "DELETE FROM \"z$zoom$class\" WHERE ST_Area(geom) < $px * $px * $amin" > /dev/null
  if [ -n "${MOTREGEN_DIAGRAM_METRIC:-}" ]; then
    gdal_rasterize -q -l "z$zoom$class" -burn 255 -ot Byte -init 0 -tr "$resolution" "$resolution" -te "$left" "$bottom" "$right" "$top" \
      -co COMPRESS=DEFLATE "$part" "$work-result.tif"
    local metric vertices
    metric="$(cd web && node --import tsx ../tools/basemap/diagram-metric.mts "../$work.tif" "../$work-result.tif" "$ss")"
    vertices="$(ogrinfo -q "$part" -dialect SQLite -sql "SELECT SUM(ST_NPoints(geom)) AS n FROM \"z$zoom$class\"" | awk '/n \(/ { print $NF }')"
    echo "{\"zoom\":$zoom,\"class\":\"$class\",\"mode\":\"$mode_label\",\"sigma\":$sigma,\"vertices\":${vertices:-0},\"metric\":$metric}" > "$work-metric.json"
    rm -f "$work-result.tif"
  fi
  rm -f "$work.tif" "$work.png" "$work.pgw" "$work"-block-*
}
tolerance="${MOTREGEN_DIAGRAM_TOLERANCE:-0.3}"
export tolerance
export -f generalize
jobs=()
for zoom in ${MOTREGEN_DIAGRAM_ZOOMS:-4 5 6 7 8 9 10}; do
  for class in ${MOTREGEN_DIAGRAM_CLASSES:-water wood urban}; do
    if [ "$class" = wood ] && [ "$zoom" -lt 6 ]; then continue; fi
    jobs+=("$zoom $class")
  done
done
# Parallel (gdal_contour is enkeldraads); de grootste (z10) eerst.
printf '%s\n' "${jobs[@]}" | sort -rn | xargs -P "${MOTREGEN_DIAGRAM_JOBS:-8}" -L 1 bash -c 'generalize "$0" "$1"'
rm -f "$scratch/diagram.gpkg"
for job in "${jobs[@]}"; do
  read -r zoom class <<< "$job"
  ogr2ogr -f GPKG $([ -f "$scratch/diagram.gpkg" ] && echo -update) "$scratch/diagram.gpkg" "$scratch/part-z$zoom-$class.gpkg"
  [ -f "$scratch/z$zoom-$class-metric.json" ] && cat "$scratch/z$zoom-$class-metric.json" | tee -a "$scratch/metric.jsonl"
done
for zoom in ${MOTREGEN_DIAGRAM_ZOOMS:-4 5 6 7 8 9 10}; do
  px="$(awk -v z="$zoom" 'BEGIN { print 40075016.6856 / (256 * 2^z) }')"
  # Rivieren rang 1 vanaf z5, rang 2 en kanalen vanaf z7, rang 3 vanaf z9 (gelijk aan de stijl); één laag `waterway`.
  if [ "$zoom" -ge 5 ]; then
    ogr2ogr -f GPKG -update "$scratch/diagram.gpkg" "$scratch/source.gpkg" -nln "z${zoom}waterway" -nlt MULTILINESTRING -dialect SQLite \
      -sql "SELECT ST_Simplify(geom, $px * 0.5) AS geom, rank FROM (SELECT geom, 1 AS rank FROM river1
        UNION ALL SELECT geom, 2 AS rank FROM river2 WHERE $zoom >= 7 UNION ALL SELECT geom, 3 AS rank FROM river3 WHERE $zoom >= 9
        UNION ALL SELECT geom, 2 AS rank FROM canal WHERE $zoom >= 7)"
  fi
  [ "$zoom" -ge 6 ] || continue
  ogr2ogr -f GPKG -update "$scratch/diagram.gpkg" "$scratch/source.gpkg" -nln "z${zoom}road" -nlt MULTILINESTRING -dialect SQLite \
    -sql "SELECT ST_Simplify(ST_LineMerge(ST_Union(geom)), $px * 0.5) AS geom, 'motorway' AS class FROM motorway"
done

[ -n "${MOTREGEN_DIAGRAM_NO_TILES:-}" ] && exit 0
# Twee archieven uit dezelfde generalisatie: zonder en met snelwegen.
for name in diagram diagram-wegen; do
  conf="{"; layers=()
  for layer in $(ogrinfo -q "$scratch/diagram.gpkg" | awk -F'[: ]+' '/^[0-9]+:/ { print $2 }'); do
    zoom="$(echo "$layer" | grep -o '[0-9]*' | head -1)"
    case "$layer" in *waterway) target=waterway ;; *water) target=water ;; *road) target=road; [ "$name" = diagram ] && continue ;; *) target=landcover ;; esac
    conf="$conf\"$layer\":{\"target_name\":\"$target\",\"minzoom\":$zoom,\"maxzoom\":$zoom},"; layers+=("$layer")
  done
  conf="${conf%,}}"
  rm -f "$scratch/$name.mbtiles"
  ogr2ogr -f MBTILES "$scratch/$name.mbtiles" "$scratch/diagram.gpkg" "${layers[@]}" \
    -dsco MINZOOM=4 -dsco MAXZOOM=10 -dsco COMPRESS=YES -dsco CONF="$conf"
  (cd web && node --import tsx ../tools/basemap/compose.mts "$name" "../$scratch" --replace landcover:4-10 --replace water:4-10 \
    "../$scratch/$name.mbtiles")
done
