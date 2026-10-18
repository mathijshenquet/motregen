"""ICON-D2 globale en directe straling op de KNMI-stations, op korte en op een dag lead (U99, MIP-39).

Bron: https://previous-runs-api.open-meteo.com (gratis, niet-commercieel). Zonder achtervoegsel is het de
korte-termijnreeks (eerste uren van opeenvolgende runs, zoals historical-forecast); `_previous_day1` is dezelfde
reeks uit runs van een dag eerder, dus leads ≈ +24…+27 u. `_previous_day2` bestaat voor ICON-D2 niet (+48 u is het
eind). Straling geldt als gemiddelde over het voorafgaande uur; `sunshine_duration` is Open-Meteo's eigen omrekening
(een drempel op de DNI van het uurgemiddelde) in seconden. DWD publiceert voor ICON-D2 geen `DURSUN`; directe straling
(`ASWDIR_S`) wel, en die komt hier mee als het "native" veld.

Met `kwartier` als derde argument komen dezelfde stralingsvelden per kwartier (`minutely_15`, tijd = einde van het
kwartier; vier kwartieren middelen exact tot het uurgemiddelde). Dat is de resolutie van de DWD-bestanden zelf.

Gebruik: fetch_icon_d2.py <eerste dag> <laatste dag> [kwartier]. Schrijft data/icon-d2.csv of data/icon-d2-kwartier.csv;
een bestaand bestand met dezelfde kolommen dat de hele periode dekt, wordt niet opnieuw opgehaald.
"""

import csv
import sys
import time
from pathlib import Path

import requests

ENDPOINT = "https://previous-runs-api.open-meteo.com/v1/forecast"
VARIABLES = ["shortwave_radiation", "direct_radiation", "sunshine_duration"]
LEADS = {"kort": "", "dag1": "_previous_day1"}
QUARTER_VARIABLES = ["shortwave_radiation", "direct_radiation"]
DATA = Path(__file__).parent / "data"


def columns(quarter: bool) -> list[tuple[str, str]]:
    """(API-naam, kolomnaam) per veld en lead."""
    names = {"shortwave_radiation": "global_wm2", "direct_radiation": "direct_wm2", "sunshine_duration": "openmeteo_min"}
    variables = QUARTER_VARIABLES if quarter else VARIABLES
    return [(f"{variable}{suffix}", f"{lead}_{names[variable]}") for lead, suffix in LEADS.items() for variable in variables]


def header(quarter: bool) -> list[str]:
    return ["station", "quarter_end_utc" if quarter else "hour_end_utc", *[name for _, name in columns(quarter)]]


def fetch_station(station: dict[str, str], first: str, last: str, quarter: bool) -> dict:
    parameters = {
        "latitude": station["lat"],
        "longitude": station["lon"],
        "start_date": first,
        "end_date": last,
        "minutely_15" if quarter else "hourly": ",".join(api_name for api_name, _ in columns(quarter)),
        "models": "icon_d2",
        "timezone": "GMT",
    }
    for attempt in range(6):
        response = requests.get(ENDPOINT, params=parameters, timeout=180)
        if response.ok:
            return response.json()
        time.sleep(20 * (attempt + 1))
    response.raise_for_status()
    return {}


def covers(target: Path, quarter: bool, first: str, last: str) -> bool:
    if not target.exists():
        return False
    with open(target) as handle:
        rows = csv.reader(handle)
        if next(rows, None) != header(quarter):
            return False
        hours = [row[1] for row in rows]
    return bool(hours) and min(hours) <= f"{first}T00" and max(hours) >= f"{last}T23"


def cell(value: float | None, api_name: str) -> str:
    if value is None:
        return ""
    if api_name.startswith("sunshine_duration"):
        return f"{value / 60:.2f}"
    return f"{value}"


def main() -> int:
    first, last = sys.argv[1], sys.argv[2]
    quarter = sys.argv[3:] == ["kwartier"]
    target = DATA / ("icon-d2-kwartier.csv" if quarter else "icon-d2.csv")
    if covers(target, quarter, first, last):
        print(f"{target.name}: dekt {first}…{last} al, niet opnieuw opgehaald")
        return 0
    with open(DATA / "stations.csv") as handle:
        stations = list(csv.DictReader(handle))
    rows = []
    for station in stations:
        series = fetch_station(station, first, last, quarter)["minutely_15" if quarter else "hourly"]
        for index, time_label in enumerate(series["time"]):
            row = [station["station"], time_label[:16] if quarter else time_label[:13]]
            row += [cell(series[api_name][index], api_name) for api_name, _ in columns(quarter)]
            rows.append(row)
        print(f"{station['station']}: {len(series['time'])} tijdstappen", flush=True)
        time.sleep(2)
    with open(target, "w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(header(quarter))
        writer.writerows(rows)
    return 0


if __name__ == "__main__":
    sys.exit(main())
