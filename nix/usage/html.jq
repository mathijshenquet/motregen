# Array van dagaggregaten (oudste eerst) → statische stats.html: 30-daags overzicht
# plus één tabel per dag, nieuwste eerst.
include "contract";

def cell: if . == null then "–" else tostring end;
def pctcell: if . == null then "–" else "\(.) %" end;
def row($cells): "<tr>" + ($cells | map("<td>\(cell | @html)</td>") | join("")) + "</tr>";
def head($cells): "<tr>" + ($cells | map("<th>\(@html)</th>") | join("")) + "</tr>";

def sum_counts($days; path_f):
  [$days[] | path_f // 0] | add // 0;

def summary($days):
  ([$days[].beacons] | add // 0) as $beacons
  | {
      day: "\($days[0].day // "–") t/m \($days[-1].day // "–")",
      sessions: ([$days[].sessions] | add // 0),
      beacons: $beacons,
      rejected: ([$days[].rejected] | add // 0),
      features: (usage_features | map(
        . as $f | sum_counts($days; .features[$f].n) as $n
        | {key: $f, value: {n: $n, pct: pct($n; $beacons)}}
      ) | from_entries),
      dimensions: (usage_dimensions | with_entries(
        .key as $key | .value |= (map(
          . as $v | sum_counts($days; .dimensions[$key][$v].n) as $n
          | {key: $v, value: {n: $n, pct: pct($n; $beacons)}}
        ) | from_entries)
      ))
    };

def report_table:
  "<h2>\(.day | @html)</h2>"
  + "<p>\(.sessions) sessies · \(.beacons) bakens · \(.rejected) afgewezen</p>"
  + "<table>" + head(["", "aantal", "% van bakens"])
  + (.features | to_entries | map(row([.key, .value.n, (.value.pct | pctcell)])) | join(""))
  + (.dimensions | to_entries | map(
      .key as $key | .value | to_entries
      | map(row(["\($key)=\(.key)", .value.n, (.value.pct | pctcell)])) | join("")
    ) | join(""))
  + "</table>";

(map(select(.day >= $cutoff))) as $recent
| "<!doctype html><html lang=\"nl\"><head><meta charset=\"utf-8\">"
  + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
  + "<meta name=\"robots\" content=\"noindex\"><title>motregen — gebruik</title>"
  + "<style>body{font:14px system-ui,sans-serif;margin:1.5rem;max-width:40rem}"
  + "table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:.2rem .5rem;text-align:right}"
  + "td:first-child,th:first-child{text-align:left}h2{margin-top:2rem}</style></head><body>"
  + "<h1>motregen — gebruik</h1>"
  + "<p>Percentages zijn aandelen van de geldige bakens (MIP-13). Bijgewerkt \($generated | @html).</p>"
  + (summary($recent) | .day = "Laatste 30 dagen (\(.day))" | report_table)
  + ($recent | reverse | map(report_table) | join(""))
  + "</body></html>"
