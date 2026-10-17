#!/usr/bin/env bash
set -euo pipefail
export TZ=Europe/Amsterdam

usage_root=${MOTREGEN_USAGE_ROOT:-/var/lib/motregen-usage}
usage_lib=${MOTREGEN_USAGE_LIB:-$(dirname "${BASH_SOURCE[0]}")}
report_day=${MOTREGEN_REPORT_DAY:-$(date -d yesterday +%F)}
dry_run=false
offline=${MOTREGEN_REPORT_OFFLINE:-false}
while [ "$#" -gt 0 ]; do
  case "$1" in
    --root) usage_root=$2; shift 2 ;;
    --day) report_day=$2; shift 2 ;;
    --dry-run) dry_run=true; shift ;;
    --offline) offline=true; shift ;;
    *) echo 'Gebruik: motregen-daily-report [--root PAD] [--day YYYY-MM-DD] [--dry-run] [--offline]' >&2; exit 2 ;;
  esac
done
[[ "$report_day" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] && [ "$(date -d "$report_day" +%F)" = "$report_day" ] || exit 2
baseline=$(date -d "$report_day -7 days" +%F)
previous_day=$(date -d "$report_day -1 day" +%F)
shopt -s nullglob

read_days() {
  local directory=$1
  local files=("$directory"/????-??-??.json)
  if [ "${#files[@]}" -eq 0 ]; then
    echo '[]'
  else
    jq -cs --arg day "$report_day" --arg baseline "$baseline" '
      [.[] | select(.day <= $day)] | sort_by(.day) as $all
      | [$all[] | select(.day >= $baseline)] as $recent
      | if ($recent | length) > 0 then $recent else $all[-1:] end
    ' "${files[@]}"
  fi
}

telegram_api=${MOTREGEN_TELEGRAM_API:-https://api.telegram.org}
cloudflare_api=${MOTREGEN_CLOUDFLARE_API:-https://api.cloudflare.com/client/v4/graphql}
channel_file="$usage_root/report/$report_day-channel.json"
channel_members=null
if [ "$offline" = true ]; then
  if [ -f "$channel_file" ]; then channel_members=$(jq -e '.members | numbers' "$channel_file"); fi
elif [ -n "${TG_BOT_KEY:-}" ]; then
  if reply=$(curl --silent --fail --max-time 30 --request POST \
    --header 'Content-Type: application/json' --data '{"chat_id":"-1004364574650"}' \
    "$telegram_api/bot$TG_BOT_KEY/getChatMemberCount") \
    && channel_members=$(jq -e 'select(.ok == true) | .result | numbers | select(. >= 0 and . == floor)' <<< "$reply"); then
    if [ "$dry_run" = false ]; then
      mkdir -p "$usage_root/report"
      jq -n --arg day "$report_day" --argjson members "$channel_members" '{day: $day, members: $members}' > "$channel_file.tmp"
      mv -- "$channel_file.tmp" "$channel_file"
    fi
  else
    channel_members=null
    echo 'Kanaalstand kon niet worden opgehaald.' >&2
  fi
fi
channel_previous=null
if [ -f "$usage_root/report/$previous_day-channel.json" ]; then
  channel_previous=$(jq -e '.members | numbers' "$usage_root/report/$previous_day-channel.json")
fi
channel=$(jq -cn --argjson members "$channel_members" --argjson previous "$channel_previous" '{members: $members, previous: $previous}')

cloudflare=null
if [ "$offline" = true ]; then
  if [ -f "$usage_root/report/$report_day-cloudflare.json" ]; then cloudflare=$(cat "$usage_root/report/$report_day-cloudflare.json"); fi
elif [ -n "${CLOUDFLARE_ANALYTICS_TOKEN:-}" ]; then
  query=$(cat "$usage_lib/cloudflare.graphql")
  payload=$(jq -cn --arg query "$query" --arg zone "${MOTREGEN_CLOUDFLARE_ZONE:-eceaddc3898b93f295b87ba56ac24078}" --arg day "$report_day" '{query: $query, variables: {zone: $zone, day: $day}}')
  if reply=$(curl --silent --fail --max-time 30 --request POST --header 'Content-Type: application/json' \
    --header "Authorization: Bearer $CLOUDFLARE_ANALYTICS_TOKEN" --data "$payload" "$cloudflare_api") \
    && cloudflare=$(jq -ce 'select((.errors // [] | length) == 0) | .data.viewer.zones[0].httpRequests1dGroups[0] | select(. != null) | {uniques: .uniq.uniques, pageViews: .sum.pageViews, requests: .sum.requests, frRequests: ([.sum.countryMap[]? | select(.clientCountryName == "FR") | .requests] | add // 0)} | select(all(.[]; type == "number"))' <<< "$reply"); then
    :
  else
    cloudflare=null
    echo 'Cloudflare-dagtelling kon niet worden opgehaald.' >&2
  fi
fi

message=$(jq -nr -L "$usage_lib" --arg day "$report_day" --arg baseline "$baseline" \
  --argjson web "$(read_days "$usage_root/stats")" --argjson telegram "$(read_days "$usage_root/telegram")" \
  --argjson channel "$channel" --argjson cloudflare "$cloudflare" -f "$usage_lib/daily-message.jq")
if [ "$dry_run" = true ]; then
  printf '%s\n' "$message"
else
  if [ "$offline" = true ] || [ -z "${TG_BOT_KEY:-}" ] || [ -z "${MOTREGEN_REPORT_CHAT_ID:-}" ]; then
    echo 'Dagrapport niet verstuurd: token/ontvanger ontbreekt of offline is ingesteld.' >&2
    exit 1
  fi
  payload=$(jq -cn --arg text "$message" --arg chat_id "$MOTREGEN_REPORT_CHAT_ID" '{chat_id: $chat_id, text: $text, parse_mode: "HTML", link_preview_options: {is_disabled: true}}')
  if ! reply=$(curl --silent --fail --max-time 30 --request POST --header 'Content-Type: application/json' \
    --data "$payload" "$telegram_api/bot$TG_BOT_KEY/sendMessage") || ! jq -e '.ok == true' <<< "$reply" > /dev/null; then
    echo 'Dagrapport kon niet worden verstuurd.' >&2
    exit 1
  fi
fi
