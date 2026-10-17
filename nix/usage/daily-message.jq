include "contract";

def decimal: if . == null then "–" else ( . * 10 | round / 10 | tostring | gsub("\\."; ",")) end;
def total: add // 0;
def commands: [.commands[]?] | total;
def lower_bound: if .usersLowerBound then "≥" else "" end;
def feature_name: {
  pinFeel: "gevoel vastgezet", pinWind: "wind vastgezet", pinAir: "lucht vastgezet",
  hover: "isolijnfocus", search: "zoeken", geo: "geolocatie", fav: "favoriet",
  pin: "pin", play: "afspelen", scrub: "tijd verschoven", clockScrub: "klok verschoven",
  history: "historie", fresh: "versheid", about: "over", share: "delen"
}[.] // .;
def percent_text($numerator; $denominator): "\(pct($numerator; $denominator) | decimal) %";
def missing($days): "meting stil sinds \($days[-1].day // "onbekend (nog geen dagaggregaat)")";
def mean($days; metric): if ($days | length) == 0 then null else ([$days[] | metric] | total) / ($days | length) end;
def coverage($days): if ($days | length) == 7 then "" else " · \($days | length)/7 dagen" end;

def web_text($current; $previous; $all):
  if $current == null then "<b>Web</b>\n  \(missing($all))"
  else $current as $web
    | ([$previous[].beacons] | total) as $previous_beacons
    | ["<b>Web</b>",
      "  sessies \($web.sessions) (7d gem. \(mean($previous; .sessions) | decimal)\(coverage($previous)))",
      "  bakens \($web.beacons) (7d gem. \(mean($previous; .beacons) | decimal))",
      "  touch \($web.dimensions.coarse.true.n // 0) · desktop \($web.dimensions.coarse.false.n // 0) (7d \(percent_text(([$previous[].dimensions.coarse.true.n // 0] | total); $previous_beacons)) touch)",
      "  " + ($web.features | to_entries | map(select(.key != "tg" and .value.n > 0)) | sort_by(-.value.n, .key) | .[:3]
        | map(.key as $feature | "\($feature | feature_name | @html) \(percent_text(.value.n; $web.beacons)) (7d \(percent_text(([$previous[].features[$feature].n // 0] | total); $previous_beacons)))")
        | if length == 0 then "geen features gebruikt" else join(" · ") end),
      "  Telegram-webview \(percent_text(($web.features.tg.n // 0); $web.beacons)) (7d \(percent_text(([$previous[].features.tg.n // 0] | total); $previous_beacons)))"
    ] | join("\n")
  end;

def telegram_text($current; $previous; $all):
  if $current == null then "<b>Telegram</b>\n  \(missing($all))"
  else $current as $telegram
    | ["<b>Telegram</b>",
      "  gebruikers \($telegram | lower_bound)\($telegram.users) (7d gem. \(if any($previous[]; .usersLowerBound) then "≥" else "" end)\(mean($previous; .users) | decimal)\(coverage($previous)))",
      "  commando’s \($telegram | commands) (7d gem. \(mean($previous; commands) | decimal))" +
        ($telegram.commands | to_entries | sort_by(-.value, .key) | map(select(.value > 0)) | .[:3] | map("/\(.key | @html) \(.value)") | if length == 0 then "" else " · " + join(", ") end),
      "  inline \($telegram.inline) (7d \(mean($previous; .inline) | decimal)) · tijdknoppen \($telegram.timeButtons) (7d \(mean($previous; .timeButtons) | decimal)) · plaatsknoppen \($telegram.placeButtons) (7d \(mean($previous; .placeButtons) | decimal))",
      "  privé \($telegram.chats.private) · groep \($telegram.chats.group) interacties (7d \(mean($previous; .chats.private) | decimal)/\(mean($previous; .chats.group) | decimal))"
    ] | join("\n")
  end;

($web | map(select(.day == $day)) | first // null) as $web_current
| ($web | map(select(.day >= $baseline and .day < $day))) as $web_previous
| ($telegram | map(select(.day == $day)) | first // null) as $telegram_current
| ($telegram | map(select(.day >= $baseline and .day < $day))) as $telegram_previous
| ["<b>motregen · \($day)</b>", "",
    web_text($web_current; $web_previous; $web), "",
    telegram_text($telegram_current; $telegram_previous; $telegram),
    (if $channel.members != null then
       "  kanaal nu \($channel.members) leden (\(if $channel.previous == null then "verschil onbekend" else ($channel.members - $channel.previous) as $delta | (if $delta >= 0 then "+" else "" end) + ($delta | tostring) end))"
     else "  kanaal: stand niet beschikbaar" end),
    (if $cloudflare != null then "\nCloudflare (UTC, incl. bots): \($cloudflare.uniques) unieke IP’s · \($cloudflare.pageViews) pageviews · FR \(percent_text($cloudflare.frRequests; $cloudflare.requests)) van verzoeken (FR is vooral de dev-host)" else empty end),
    (if $baseline < "2026-10-17" then "\nfilters sinds 2026-10-17" else empty end)
  ] | join("\n")
