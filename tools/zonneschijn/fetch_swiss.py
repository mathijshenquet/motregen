"""SwissMetNet-stationsuren (zonneschijnduur en globale straling) ophalen voor de vergelijking in Zwitserland (U95c).

Bron: MeteoSwiss Open Government Data, collectie ch.meteoschweiz.ogd-smn (https://data.geo.admin.ch, geen sleutel).
sre000h0 = zonneschijnduur in minuten per uur, gemeten met een zonneschijnsensor (WMO: directe straling > 120 W/m²),
dus anders dan KNMI-SQ, dat uit globale straling wordt afgeleid. gre000h0 = globale straling, uurgemiddelde in W/m².
reference_timestamp is het eind van het uur in UTC.

Schrijft data/stations-ch.csv en data/obs-ch.csv (station, eind van het uur in UTC, minuten zon, W/m²).
Afgesloten decennia worden gecachet in data/ch/; recent en now worden elke keer opnieuw opgehaald.
"""

import csv
import io
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

BASE = "https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn"
DATA = Path(__file__).parent / "data"
REGIONS = {
    "BER": "Plateau", "SMA": "Plateau", "GVE": "Plateau", "BAS": "Plateau", "PAY": "Plateau", "LUZ": "Plateau",
    "SAE": "Berg", "JUN": "Berg", "DAV": "Berg",
    "LUG": "Zuid", "OTL": "Zuid", "MAG": "Zuid",
}
FILES = ["historical_2010-2019", "historical_2020-2029", "recent", "now"]


def get(url: str) -> str:
    for attempt in range(5):
        response = requests.get(url, timeout=300)
        if response.ok:
            return response.content.decode("latin-1")
        time.sleep(5 * (attempt + 1))
    response.raise_for_status()
    return ""


def extract(text: str) -> list[list[str]]:
    rows = []
    for record in csv.DictReader(io.StringIO(text), delimiter=";"):
        sunshine, radiation = record["sre000h0"], record["gre000h0"]
        if sunshine == "" or radiation == "":
            continue
        hour_end = datetime.strptime(record["reference_timestamp"], "%d.%m.%Y %H:%M")
        rows.append([record["station_abbr"], hour_end.strftime("%Y-%m-%dT%H"), sunshine, radiation])
    return rows


def main() -> int:
    cache = DATA / "ch"
    cache.mkdir(parents=True, exist_ok=True)
    stations = list(csv.DictReader(io.StringIO(get(f"{BASE}/ogd-smn_meta_stations.csv")), delimiter=";"))
    with open(DATA / "stations-ch.csv", "w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["station", "lon", "lat", "height_m", "name", "region"])
        for station in stations:
            if station["station_abbr"] in REGIONS:
                writer.writerow([
                    station["station_abbr"], station["station_coordinates_wgs84_lon"], station["station_coordinates_wgs84_lat"],
                    station["station_height_masl"], station["station_name"], REGIONS[station["station_abbr"]],
                ])
    hours: dict[tuple[str, str], list[str]] = {}
    for abbreviation in REGIONS:
        for kind in FILES:
            cached = cache / f"{abbreviation}_{kind}.csv"
            closed_decade = kind == "historical_2010-2019"
            if closed_decade and cached.exists():
                rows = list(csv.reader(open(cached)))
            else:
                rows = extract(get(f"{BASE}/{abbreviation.lower()}/ogd-smn_{abbreviation.lower()}_h_{kind}.csv"))
                with open(cached, "w", newline="") as handle:
                    csv.writer(handle).writerows(rows)
            for row in rows:
                hours[(row[0], row[1])] = row
        print(f"{abbreviation}: {sum(1 for key in hours if key[0] == abbreviation)} uren", flush=True)
    with open(DATA / "obs-ch.csv", "w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["station", "hour_end_utc", "sunshine_min", "radiation_wm2"])
        writer.writerows(hours[key] for key in sorted(hours))
    return 0


if __name__ == "__main__":
    sys.exit(main())
