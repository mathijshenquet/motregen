# Eén dag ruwe usage-regels (jq -nR) → dagaggregaat. Percentages zijn aandelen van
# de geldige bakens: alleen een baken zegt iets over featuregebruik.
include "contract";

def dimension_value($key):
  if $key == "range" then (.range // "none")
  elif $key == "coarse" then (.coarse | tostring)
  else .[$key] end;

[inputs | fromjson? | select(type == "object")] as $lines
| ([$lines[] | select(.uri == "/data/manifest.json")] | length) as $sessions
| [$lines[] | select(.uri == "/hit")] as $hits
| [$hits[] | .hit | strings | fromjson? | select(type == "object" and .v == usage_version)] as $bodies
| ($bodies | length) as $beacons
| {
    day: $day,
    sessions: $sessions,
    beacons: $beacons,
    rejected: (($hits | length) - $beacons),
    features: (usage_features | map(
      . as $f | ([$bodies[] | select(.[$f] == true)] | length) as $n
      | {key: $f, value: {n: $n, pct: pct($n; $beacons)}}
    ) | from_entries),
    dimensions: (usage_dimensions | with_entries(
      .key as $key | .value |= (map(
        . as $v | ([$bodies[] | select(dimension_value($key) == $v)] | length) as $n
        | {key: $v, value: {n: $n, pct: pct($n; $beacons)}}
      ) | from_entries)
    ))
  }
