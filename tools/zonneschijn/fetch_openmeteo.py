"""Open-Meteo-zonneschijnduur op de KNMI-stations als referentiemodel.

Bron: https://historical-forecast-api.open-meteo.com (gratis, niet-commercieel). Dat archief plakt per model
de eerste uren van opeenvolgende runs aan elkaar: het is dus een korte-termijnverwachting, vergelijkbaar
met onze leads +1…+6, niet met +21. `sunshine_duration` geldt voor het voorafgaande uur (seconden).
icon_eu, icon_global en ecmwf_ifs (9 km) zijn de kandidaten voor wat de MeteoSwiss-app buiten het ICON-CH-gebied
toont (U95b); meteoswiss_icon_ch1/ch2 geven voor Nederland "No data is available for this location".

Gebruik: fetch_openmeteo.py <eerste dag> <laatste dag>. Schrijft data/openmeteo.csv.
"""

import csv
import sys
import time
from pathlib import Path

import requests

ENDPOINT = "https://historical-forecast-api.open-meteo.com/v1/forecast"
MODELS = ["knmi_seamless", "icon_d2", "icon_eu", "icon_global", "ecmwf_ifs", "ecmwf_ifs025"]
DATA = Path(__file__).parent / "data"


def fetch_station(station: dict[str, str], first: str, last: str) -> dict:
    parameters = {
        "latitude": station["lat"],
        "longitude": station["lon"],
        "start_date": first,
        "end_date": last,
        "hourly": "sunshine_duration,shortwave_radiation",
        "models": ",".join(MODELS),
        "timezone": "GMT",
    }
    for attempt in range(6):
        response = requests.get(ENDPOINT, params=parameters, timeout=120)
        if response.ok:
            return response.json()
        time.sleep(15 * (attempt + 1))
    response.raise_for_status()
    return {}


def main() -> int:
    first, last = sys.argv[1], sys.argv[2]
    with open(DATA / "stations.csv") as handle:
        stations = list(csv.DictReader(handle))
    rows = []
    for station in stations:
        hourly = fetch_station(station, first, last)["hourly"]
        for index, time_label in enumerate(hourly["time"]):
            row = [station["station"], time_label[:13]]
            for model in MODELS:
                sunshine = hourly[f"sunshine_duration_{model}"][index]
                radiation = hourly[f"shortwave_radiation_{model}"][index]
                row += ["" if sunshine is None else f"{sunshine / 60:.2f}", "" if radiation is None else radiation]
            rows.append(row)
        print(f"{station['station']}: {len(hourly['time'])} uren", flush=True)
        time.sleep(1)
    header = ["station", "hour_end_utc"]
    for model in MODELS:
        header += [f"{model}_sunshine_min", f"{model}_radiation_wm2"]
    with open(DATA / "openmeteo.csv", "w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        writer.writerows(rows)
    return 0


if __name__ == "__main__":
    sys.exit(main())
