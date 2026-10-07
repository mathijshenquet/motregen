{ lib, runCommand }:

runCommand "motregen-basemap" {
  meta = {
    description = "OSM vector basemap for motregen.nl";
    license = lib.licenses.odbl;
  };
} ''
  mkdir -p "$out"
  cp ${../../tools/basemap/tiles}/*.pmtiles "$out/"
''
